/**
 * Cliente HTTP para o Transfermarkt (transfermarkt.com.br).
 *
 * Todas as consultas passam por um cache com TTL para não sobrecarregar o
 * site de origem — cada página consultada uma vez fica disponível para
 * todos os visitantes até expirar. São três camadas:
 *
 *  L1: `Map` no isolate. Só vale enquanto o isolate viver, o que no Oxygen
 *      é pouco, mas mata as chamadas repetidas dentro de uma requisição.
 *  L2: Cache API do Worker, compartilhada entre os isolates do mesmo PoP e
 *      persistente entre deploys. É ela que segura o tráfego em produção.
 *      Guarda `Response`, então só serve para valores JSON — todos os
 *      retornos de `index.ts` são objetos/arrays/null puros.
 *  L3: tabela `tm_cache` no Supabase. É a única camada que sobrevive de
 *      verdade: a Cache API é por PoP e pode despejar entrada a qualquer
 *      momento, então um visitante que cai num PoP frio enquanto a origem
 *      está fora do ar não tinha nada para receber — era exatamente daí que
 *      vinham os 502 das páginas de jogador, clube e competição. Com o L3 a
 *      raspagem vira atualização, e não pré-requisito para a página existir.
 *
 * Nem a Cache API nem o Supabase existem no `vite dev` puro (Node, sem as
 * variáveis do banco); ali o código cai silenciosamente de volta para o L1.
 */
import type {Db} from '~/lib/db';

const BASE = 'https://www.transfermarkt.com.br';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const memory = new Map<
  string,
  {exp: number; salvoEm: number | null; value: unknown}
>();
const MAX_ENTRIES = 500;

const CACHE_NAME = 'tm';
/** a Cache API indexa por URL, não por chave livre — daí a origem sintética */
const CACHE_ORIGIN = 'https://tm.playersplace.cache';

const cacheUrl = (key: string) => `${CACHE_ORIGIN}/${encodeURIComponent(key)}`;

function remember(
  key: string,
  ttlSeconds: number,
  value: unknown,
  salvoEm: number | null,
): void {
  if (memory.size >= MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(key, {exp: Date.now() + ttlSeconds * 1000, salvoEm, value});
}

async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

/**
 * Por quanto tempo a entrada fica GUARDADA na Cache API, independente de estar
 * fresca. É deliberadamente muito maior que qualquer TTL lógico: a Cache API
 * do Worker trata entrada vencida como miss, então usar o TTL real aqui
 * impediria justamente o que dá valor ao stale-while-revalidate — ter a cópia
 * velha em mãos na hora de responder.
 */
const RETENCAO = 7 * 24 * 3600;

/** validade lógica, guardada por nós porque o `max-age` acima é outra coisa */
const HEADER_FRESCO_ATE = 'x-fresco-ate';

/** quando o dado saiu da origem — é o que a página mostra em "Dados de …" */
const HEADER_SALVO_EM = 'x-salvo-em';

/**
 * `waitUntil` da requisição em curso, preenchido por `lib/context.ts` a cada
 * request. Sem ele o Worker cancela qualquer promessa que sobreviva à
 * resposta, e a revalidação em segundo plano simplesmente não acontece.
 *
 * É um holder de módulo porque `cached()` não enxerga o contexto da
 * requisição. Um isolate pode atender requisições concorrentes e pegar aqui o
 * `waitUntil` de uma vizinha — o que é inofensivo: só amarra a tarefa ao ciclo
 * de vida daquela requisição, e ambas vivem no mesmo isolate.
 */
let waitUntilAtual: ((p: Promise<unknown>) => void) | null = null;

export function registrarWaitUntil(fn: (p: Promise<unknown>) => void): void {
  waitUntilAtual = fn;
}

/**
 * Roda a tarefa sem segurar a resposta, amarrada ao `waitUntil` da requisição
 * em curso quando ele existe.
 *
 * É o que permite a uma página gravar efeito colateral (a página do clube
 * alimentando a `jogadores_base`, por exemplo) sem cobrar nada do visitante:
 * a resposta sai igual, e o Worker fica vivo até a gravação terminar. Sem
 * `waitUntil` — dev local — a promessa roda até onde der, que ali basta.
 */
export function emSegundoPlano(tarefa: Promise<unknown>): void {
  // sem o catch, uma falha aqui vira unhandled rejection e polui o log com um
  // erro que, por definição, ninguém está esperando
  const segura = tarefa.catch(() => {});
  waitUntilAtual?.(segura);
}

/**
 * Cliente do Supabase que sustenta o L3, preenchido por `lib/context.ts` a
 * cada request pelo mesmo motivo do `waitUntil`: `cached()` não enxerga o
 * `env`. Fica `null` quando o banco não está configurado — aí as três camadas
 * viram duas e nada quebra.
 *
 * O import de `~/lib/db` aqui é SÓ de tipo, de propósito: este módulo entra no
 * bundle do navegador (os componentes importam `~/lib/tm`), e um import de
 * valor arrastaria o supabase-js e a chave service_role para lá.
 */
let dbAtual: Db | null = null;

export function registrarDb(db: Db | null): void {
  dbAtual = db;
}

/** tabela do L3 — ver `supabase/004_cache_duravel.sql` */
const TABELA = 'tm_cache';

/**
 * Buscas não vão para o banco: a cardinalidade é a do teclado do visitante e
 * o valor de ter uma busca antiga salva é nenhum.
 */
const NAO_PERSISTIR = /^search:/;

/**
 * Teto do que aceitamos gravar. O histórico de jogos de um veterano passa
 * folgado de 100 KB; acima deste limite a linha custa mais em banco do que
 * rende em disponibilidade, e a página continua servida pelos L1/L2.
 */
const MAX_PAYLOAD = 512 * 1024;

interface DoBanco<T> {
  valor: T;
  salvoEm: number;
  frescoAte: number;
}

async function lerDoBanco<T>(chave: string): Promise<DoBanco<T> | null> {
  if (!dbAtual || NAO_PERSISTIR.test(chave)) return null;
  try {
    const {data, error} = await dbAtual
      .from(TABELA)
      .select('payload, fresco_ate, updated_at')
      .eq('chave', chave)
      .maybeSingle();
    if (error || !data) return null;

    const salvoEm = Date.parse(data.updated_at);
    const frescoAte = Date.parse(data.fresco_ate);
    if (Number.isNaN(salvoEm) || Number.isNaN(frescoAte)) return null;

    // o valor vem embrulhado em {v: …} porque `payload` é NOT NULL e várias
    // consultas legitimamente devolvem `null` (getPlayerCareer, getPlayerGameLog)
    return {valor: (data.payload as {v: T}).v, salvoEm, frescoAte};
  } catch {
    return null;
  }
}

async function gravarNoBanco(
  chave: string,
  ttlSeconds: number,
  valor: unknown,
  salvoEm: number,
): Promise<void> {
  if (!dbAtual || NAO_PERSISTIR.test(chave)) return;
  try {
    if (JSON.stringify(valor ?? null).length > MAX_PAYLOAD) return;
    await dbAtual.from(TABELA).upsert(
      {
        chave,
        payload: {v: valor ?? null},
        fresco_ate: new Date(salvoEm + ttlSeconds * 1000).toISOString(),
        updated_at: new Date(salvoEm).toISOString(),
      },
      {onConflict: 'chave'},
    );
  } catch {
    // gravar no cache nunca pode derrubar a resposta
  }
}

/** grava no L3 sem segurar a resposta */
function persistir(
  chave: string,
  ttlSeconds: number,
  valor: unknown,
  salvoEm: number,
): void {
  const tarefa = gravarNoBanco(chave, ttlSeconds, valor, salvoEm);
  waitUntilAtual?.(tarefa);
}

/** revalidações em voo, para N requisições simultâneas não virarem N fetches */
const revalidando = new Set<string>();

function revalidarEmSegundoPlano<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  cache: Cache | null,
): void {
  if (revalidando.has(key)) return;
  revalidando.add(key);

  const tarefa = (async () => {
    try {
      const agora = Date.now();
      const value = await fn();
      remember(key, ttlSeconds, value, agora);
      if (value !== undefined) {
        if (cache) await guardar(cache, key, ttlSeconds, value, agora);
        await gravarNoBanco(key, ttlSeconds, value, agora);
      }
    } catch {
      // origem fora do ar: a cópia velha continua servindo, que é o objetivo
    } finally {
      revalidando.delete(key);
    }
  })();

  // sem waitUntil (dev local, ou request já encerrada) a promessa ainda roda
  // até onde der; com ele, roda até o fim
  waitUntilAtual?.(tarefa);
}

async function guardar(
  cache: Cache,
  key: string,
  ttlSeconds: number,
  value: unknown,
  salvoEm: number,
): Promise<void> {
  try {
    await cache.put(
      cacheUrl(key),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${RETENCAO}`,
          [HEADER_FRESCO_ATE]: String(salvoEm + ttlSeconds * 1000),
          [HEADER_SALVO_EM]: String(salvoEm),
        },
      }),
    );
  } catch {
    // falha ao gravar no cache nunca deve derrubar a resposta
  }
}

/** o dado e a procedência dele, para a página poder dizer de quando é */
export interface Registro<T> {
  valor: T;
  /** epoch ms em que o dado saiu da origem; null quando não dá para saber */
  salvoEm: number | null;
  /** false quando é cópia vencida servida enquanto a atualização não volta */
  fresco: boolean;
}

/**
 * Busca com cache de três camadas e stale-while-revalidate.
 *
 * A cópia velha é devolvida na hora e a atualização acontece em segundo plano.
 * Isso existe por uma medição: em produção, a primeira visita a uma página de
 * competição chegou a **16 segundos** de TTFB (o loader dispara 5 raspagens em
 * paralelo), contra 0,2 s com cache quente. Sem esta função, todo primeiro
 * visitante depois de cada expiração pagava essa conta.
 *
 * A ordem é L1 → L2 → L3 → origem, e só a última etapa pode falhar de um jeito
 * que o visitante enxergue: qualquer camada com cópia salva responde, mesmo
 * vencida. Consultar o L3 custa uma ida ao Supabase quando os dois caches
 * locais erram — troca deliberada de alguns milissegundos por não depender de
 * o Transfermarkt estar de pé no momento exato da visita.
 */
export async function cachedRegistro<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<Registro<T>> {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) {
    return {valor: hit.value as T, salvoEm: hit.salvoEm, fresco: true};
  }

  const cache = await openCache();

  if (cache) {
    try {
      const stored = await cache.match(cacheUrl(key));
      if (stored) {
        const value = (await stored.json()) as T;
        const frescoAte = Number(stored.headers.get(HEADER_FRESCO_ATE) ?? 0);
        const salvoEm = Number(stored.headers.get(HEADER_SALVO_EM)) || null;
        const restante = Math.max(0, frescoAte - Date.now());

        if (restante > 0) {
          remember(key, restante / 1000, value, salvoEm);
          return {valor: value, salvoEm, fresco: true};
        }
        // velha: entra no L1 por pouco tempo só para segurar as chamadas
        // repetidas desta mesma requisição enquanto a atualização não volta
        remember(key, 30, value, salvoEm);
        revalidarEmSegundoPlano(key, ttlSeconds, fn, cache);
        return {valor: value, salvoEm, fresco: false};
      }
    } catch {
      // entrada corrompida ou Cache API indisponível — tenta o banco
    }
  }

  // L3: a cópia que sobrevive a despejo de cache, deploy e PoP frio
  const salvo = await lerDoBanco<T>(key);
  if (salvo) {
    const restante = Math.max(0, salvo.frescoAte - Date.now());

    if (restante > 0) {
      remember(key, restante / 1000, salvo.valor, salvo.salvoEm);
      // promove para o L2 para as próximas visitas nem chegarem no banco
      if (cache) {
        await guardar(cache, key, restante / 1000, salvo.valor, salvo.salvoEm);
      }
      return {valor: salvo.valor, salvoEm: salvo.salvoEm, fresco: true};
    }

    remember(key, 30, salvo.valor, salvo.salvoEm);
    revalidarEmSegundoPlano(key, ttlSeconds, fn, cache);
    return {valor: salvo.valor, salvoEm: salvo.salvoEm, fresco: false};
  }

  // primeira visita absoluta a esta chave: não há o que servir, tem que esperar
  const agora = Date.now();
  const value = await fn();

  // `undefined` é o combinado para "não guarde isto": deixa quem chama
  // distinguir resultado legítimo (inclusive `null`) de falha transitória, que
  // não pode ficar congelada no cache pelo TTL inteiro.
  if (value !== undefined) {
    remember(key, ttlSeconds, value, agora);
    if (cache) await guardar(cache, key, ttlSeconds, value, agora);
    persistir(key, ttlSeconds, value, agora);
  }

  return {valor: value, salvoEm: agora, fresco: true};
}

/** o mesmo que `cachedRegistro`, para quem só quer o dado */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const {valor} = await cachedRegistro(key, ttlSeconds, fn);
  return valor;
}

/**
 * Vai na origem, grava nas três camadas e devolve o dado — sem nunca ler o
 * cache antes.
 *
 * Existe para o aquecimento (`/api/aquecer`), e a diferença em relação a
 * `cached()` é justamente o stale-while-revalidate: com a chave vencida,
 * `cached()` devolveria a cópia velha na hora e revalidaria em segundo plano,
 * então o job gravaria na `jogadores_base` o elenco de ontem e a base ficaria
 * permanentemente um dia atrás. Aqui a espera pela origem é o objetivo — quem
 * está esperando é um cron, não um visitante.
 *
 * Diferente de `cached()`, esta função PROPAGA a falha: um clube que não
 * respondeu precisa aparecer no relatório do job, não virar silêncio.
 */
export async function renovar<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const agora = Date.now();
  const value = await fn();

  if (value !== undefined) {
    remember(key, ttlSeconds, value, agora);
    const cache = await openCache();
    if (cache) await guardar(cache, key, ttlSeconds, value, agora);
    await gravarNoBanco(key, ttlSeconds, value, agora);
  }

  return value;
}

async function tmFetch(path: string, accept: string): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'pt-BR,pt;q=0.9',
      Accept: accept,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Transfermarkt respondeu ${res.status} em ${path}`);
  }
  return res;
}

export async function tmHtml(path: string): Promise<string> {
  const res = await tmFetch(path, 'text/html,application/xhtml+xml');
  return res.text();
}

export async function tmJson<T>(path: string): Promise<T> {
  const res = await tmFetch(path, 'application/json');
  return res.json() as Promise<T>;
}

/** API JSON moderna do Transfermarkt (usada pelos web components do site) */
const API_BASE = 'https://tmapi.transfermarkt.technology';

export async function tmApiJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'application/json',
      // sem isto a API devolve nomes de clubes e competições em inglês
      'Accept-Language': 'pt-BR',
      Origin: 'https://www.transfermarkt.com.br',
      Referer: 'https://www.transfermarkt.com.br/',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Transfermarkt API respondeu ${res.status} em ${path}`);
  }
  return res.json() as Promise<T>;
}
