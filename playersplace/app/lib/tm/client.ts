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
 * Teto do que aceitamos gravar.
 *
 * Era 512 KB, o que descartava em silêncio exatamente as chaves mais caras de
 * reconstruir — o histórico de jogos de um veterano passa folgado disso. Num
 * cache isso era aceitável (os L1/L2 seguravam a página); num ESPELHO não é: a
 * chave que não está no banco é a chave que devolve 502 quando a origem cai.
 *
 * 2 MB de JSON viram algo entre 200 e 400 KB em disco, porque o `jsonb` do
 * Postgres é comprimido (TOAST) e este payload é altamente repetitivo.
 */
const MAX_PAYLOAD = 2 * 1024 * 1024;

/**
 * SHA-256 do valor serializado — é ele que responde "mudou alguma coisa?".
 *
 * POR QUE COMPARAR CONTEÚDO, E NÃO PERGUNTAR À ORIGEM: medido em 10/08/2026, o
 * `Last-Modified` do Transfermarkt é a hora de RENDERIZAÇÃO da página, não a da
 * última alteração. Com o conteúdo idêntico, 100 s depois ele já tinha pulado
 * de 14:23:00 para 14:25:00 (o TTL de 60 s do CloudFront na frente deles) e o
 * `If-Modified-Since` voltou 200, não 304. Requisição condicional não economiza
 * nada aqui; comparar o que já foi baixado, sim.
 *
 * `JSON.stringify` é estável para o que passa por aqui: os parsers montam os
 * objetos sempre na mesma ordem de campos, então chaves iguais geram bytes
 * iguais. Um falso "mudou" custaria uma regravação, não um erro.
 */
async function hashDoValor(valor: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(valor ?? null));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Teto da validade adaptativa — ver `tm_cache_gravar` em `006_espelho.sql`.
 *
 * Cada conferência que não acha diferença dobra a validade lógica da chave, e
 * este é o limite: uma semana. Ele existe para que nenhuma chave saia do
 * radar de vez, mesmo que o conteúdo dela tenha ficado congelado por engano
 * nosso (parser quebrado devolvendo sempre a mesma estrutura, por exemplo).
 */
const TETO_VALIDADE = 7 * 24 * 3600;

interface DoBanco<T> {
  valor: T;
  salvoEm: number;
  frescoAte: number;
}

async function lerDoBanco<T>(chave: string): Promise<DoBanco<T> | null> {
  if (!dbAtual || NAO_PERSISTIR.test(chave)) return null;
  try {
    // `verificado_em` é da migração 006; enquanto ela não for aplicada, o
    // PostgREST recusa a coluna e derruba o SELECT inteiro. Sem esta volta o
    // L3 pararia de ser LIDO, que é o mesmo que não existir — e só se notaria
    // na próxima queda do Transfermarkt.
    const ler = (colunas: string) =>
      dbAtual!.from(TABELA).select(colunas).eq('chave', chave).maybeSingle();

    let {data, error} = await ler('payload, fresco_ate, verificado_em');
    if (error) ({data, error} = await ler('payload, fresco_ate, updated_at'));
    if (error || !data) return null;

    const linha = data as unknown as {
      payload: {v: T};
      fresco_ate: string;
      verificado_em?: string;
      updated_at?: string;
    };

    // `verificado_em`, e NÃO `updated_at`: desde a migração 006 o `updated_at`
    // é a data da última MUDANÇA de conteúdo, e a página usa isto para escrever
    // "Dados de …". A carreira de um aposentado não muda há dois anos e está
    // perfeitamente atual — carimbá-la com 2024 assustaria o visitante à toa.
    // O que ele quer saber é quando conferimos pela última vez.
    const salvoEm = Date.parse(linha.verificado_em ?? linha.updated_at ?? '');
    const frescoAte = Date.parse(linha.fresco_ate);
    if (Number.isNaN(salvoEm) || Number.isNaN(frescoAte)) return null;

    // o valor vem embrulhado em {v: …} porque `payload` é NOT NULL e várias
    // consultas legitimamente devolvem `null` (getPlayerCareer, getPlayerGameLog)
    return {valor: linha.payload.v, salvoEm, frescoAte};
  } catch {
    return null;
  }
}

/**
 * Grava no L3 comparando conteúdo, e devolve se algo mudou de fato.
 *
 * Quem decide é a função `tm_cache_gravar` no Postgres, numa ida só: hash
 * igual ao que está lá significa não reescrever o payload (uma chave estável de
 * 300 KB seria regravada inteira toda noite à toa), não mexer no `updated_at`
 * — que passa a ser a data da última mudança DE VERDADE, e é isso que a página
 * quer dizer em "Dados de …" — e dobrar a validade lógica da chave.
 *
 * `null` quando não deu para saber (banco desligado, payload grande demais,
 * erro): quem chama trata como "não sei", nunca como "não mudou".
 */
async function gravarNoBanco(
  chave: string,
  ttlSeconds: number,
  valor: unknown,
): Promise<boolean | null> {
  if (!dbAtual || NAO_PERSISTIR.test(chave)) return null;
  try {
    if (JSON.stringify(valor ?? null).length > MAX_PAYLOAD) return null;

    const {data, error} = await dbAtual.rpc('tm_cache_gravar', {
      p_chave: chave,
      p_payload: {v: valor ?? null},
      p_hash: await hashDoValor(valor),
      p_ttl_s: Math.round(ttlSeconds),
      p_teto_s: TETO_VALIDADE,
    });

    // A função é da migração 006. Enquanto ela não for aplicada — ou nos
    // minutos em que o PostgREST ainda está com o schema velho em cache — a
    // chamada falha, e sem esta volta o L3 pararia de ser gravado INTEIRO: a
    // camada que existe justamente para o site sobreviver à queda da origem
    // sumiria em silêncio, e só se notaria na próxima queda. O upsert antigo
    // não sabe comparar conteúdo, mas grava — que é o que não pode faltar.
    if (error) {
      await dbAtual.from(TABELA).upsert(
        {
          chave,
          payload: {v: valor ?? null},
          fresco_ate: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        {onConflict: 'chave'},
      );
      return null;
    }

    // `returns table` chega como array de uma linha
    const linha = Array.isArray(data) ? data[0] : data;
    return (linha as {mudou_out?: boolean} | null)?.mudou_out ?? null;
  } catch {
    // gravar no cache nunca pode derrubar a resposta
    return null;
  }
}

/** grava no L3 sem segurar a resposta */
function persistir(chave: string, ttlSeconds: number, valor: unknown): void {
  waitUntilAtual?.(gravarNoBanco(chave, ttlSeconds, valor));
}

/**
 * Remove do L3 as entradas que guardaram estrutura vazia.
 *
 * POR QUE PRECISA EXISTIR: em 06/08/2026 o Transfermarkt entrou em manutenção
 * respondendo HTTP 200 com uma página de aviso. Os parsers a digeriram e
 * devolveram `{name: '', players: []}`, que `cached()` gravou como valor bom —
 * só `undefined` significa "não guarde isto". Resultado: a lista de clubes da
 * Série A ficou vazia e toda página de clube passou a devolver 502 em 1,7s,
 * sem sequer consultar a origem. A manutenção durou minutos; o cache esticaria
 * o efeito por até 6 horas (a validade lógica) sozinho.
 *
 * As guardas em `tmHtml` e em `CLUBE.buscar` impedem novos envenenamentos. Esta
 * função limpa os que já estão gravados — e continua valendo como rede: rodada
 * no aquecimento diário, ela devolve à origem qualquer chave que tenha ficado
 * vazia por um motivo que ainda não conhecemos.
 *
 * SÓ MEXE em `club:` e `league:`, porque só nelas o vazio é impossível de ser
 * legítimo: todo clube tem elenco e toda competição tem clubes. Chaves como
 * `pinjuries:` ou `clubtr:` são legitimamente vazias o tempo todo (jogador sem
 * lesão, clube sem contratação na janela) e apagá-las só geraria raspagem à toa.
 *
 * O payload é inspecionado em JS, e não por filtro JSON no PostgREST, porque a
 * regra é por formato e precisa ser óbvia de ler — o volume aqui é de dezenas
 * de linhas, não de milhares.
 */
export interface ResumoExpurgo {
  inspecionadas: number;
  removidas: string[];
}

/** o valor não traz informação nenhuma — ver `expurgarVazias` */
function vazia(chave: string, valor: unknown): boolean {
  if (valor === null || valor === undefined) return true;
  if (typeof valor !== 'object') return false;
  const v = valor as Record<string, unknown>;

  if (chave.startsWith('club:')) {
    const players = v.players;
    return !v.name && (!Array.isArray(players) || players.length === 0);
  }
  if (chave.startsWith('league:')) {
    const clubs = v.clubs;
    return !Array.isArray(clubs) || clubs.length === 0;
  }
  return false;
}

export async function expurgarVazias(db: Db | null): Promise<ResumoExpurgo> {
  const vazio: ResumoExpurgo = {inspecionadas: 0, removidas: []};
  if (!db) return vazio;

  try {
    const {data, error} = await db
      .from(TABELA)
      .select('chave, payload')
      .or('chave.like.club:%,chave.like.league:%');
    if (error || !data) return vazio;

    const removidas = (data as {chave: string; payload: {v: unknown}}[])
      .filter((l) => vazia(l.chave, l.payload?.v))
      .map((l) => l.chave);

    if (removidas.length) {
      await db.from(TABELA).delete().in('chave', removidas);

      // As três camadas guardam cópias independentes: apagar só o L3 deixaria a
      // Cache API servindo o mesmo vazio, e o L3 seria repovoado a partir dela
      // na primeira leitura. O L2 é por PoP — este laço limpa o PoP que atendeu
      // esta chamada, e os demais se resolvem quando a entrada vence lá.
      const cache = await openCache();
      for (const c of removidas) {
        memory.delete(c);
        if (cache) await cache.delete(cacheUrl(c)).catch(() => false);
      }
    }

    return {inspecionadas: data.length, removidas};
  } catch {
    return vazio;
  }
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
        await gravarNoBanco(key, ttlSeconds, value);
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
  // o job de espelho reusa os getters das páginas, mas precisa do caminho da
  // origem — ver `ativarModoEspelho`
  if (modoEspelho) {
    // o L1 continua valendo, e isso importa: `perf`, `career` e `starts` são
    // três getters montados em cima da MESMA chave `perfraw:`. Ignorar a
    // memória aqui compraria o mesmo JSON três vezes por jogador — 30% de
    // requisições a mais, cobradas de um terceiro, sem nenhum ganho
    const hit = memory.get(key);
    if (hit && hit.exp > Date.now()) {
      return {valor: hit.value as T, salvoEm: hit.salvoEm, fresco: true};
    }
    const agora = Date.now();
    const {valor} = await renovarRegistro(key, ttlSeconds, fn);
    return {valor, salvoEm: agora, fresco: true};
  }

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
    persistir(key, ttlSeconds, value);
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
  const {valor} = await renovarRegistro(key, ttlSeconds, fn);
  return valor;
}

/** o que `renovar()` descobriu, para o job noturno poder relatar */
export interface Renovacao<T> {
  valor: T;
  /** true quando o conteúdo mudou; null quando não deu para saber */
  mudou: boolean | null;
}

/** o mesmo que `renovar()`, dizendo se o conteúdo mudou de fato */
export async function renovarRegistro<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<Renovacao<T>> {
  const agora = Date.now();
  const value = await fn();

  if (value === undefined) return {valor: value, mudou: null};

  remember(key, ttlSeconds, value, agora);
  const cache = await openCache();
  if (cache) await guardar(cache, key, ttlSeconds, value, agora);
  return {valor: value, mudou: await gravarNoBanco(key, ttlSeconds, value)};
}

/**
 * MODO ESPELHO — desliga a leitura de cache, ligado só pelo job de espelho.
 *
 * O job (`scripts/espelho.ts`) chama os MESMOS getters de `index.ts` que as
 * páginas chamam, porque duplicar as duas dezenas de raspagens numa segunda
 * implementação seria garantir que elas divirjam. Só que os getters usam
 * `cached()`, e `cached()` com cópia fresca no banco devolve a cópia sem ir à
 * origem — o job não atualizaria nada, apenas leria de volta o que ele mesmo
 * gravou ontem.
 *
 * Com a chave ligada, `cached()`/`cachedRegistro()` passam a se comportar como
 * `renovar()`: sempre origem, sempre gravação com comparação de conteúdo. É um
 * booleano de módulo em vez de um parâmetro em vinte assinaturas porque o
 * processo do job é dedicado — ele liga isto na primeira linha e nunca
 * desliga, e nada mais roda dentro dele.
 *
 * NUNCA deve ser ligado no Worker: uma requisição de visitante com isto ligado
 * perderia as três camadas de cache de uma vez.
 */
let modoEspelho = false;

export function ativarModoEspelho(): void {
  modoEspelho = true;
}

/**
 * Disjuntor da origem.
 *
 * Quando o Transfermarkt cai, ele não recusa a conexão: aceita o TLS e segura
 * a requisição sem devolver um byte até estourar o `AbortSignal.timeout`.
 * Medido em 06/08/2026, com o site deles fora do ar — inclusive o `robots.txt`
 * e o `.de`: cada página de clube sem cópia em cache gastava 20s de Worker
 * para terminar em 502.
 *
 * Sem disjuntor, cada visitante paga esses 20s por página e o Worker fica com
 * dezenas de requisições penduradas que não tinham chance de dar certo. Depois
 * de `FALHAS_ATE_ABRIR` falhas seguidas as chamadas passam a estourar na hora
 * durante `JANELA_ABERTO`, o que devolve a decisão para as camadas de cache e
 * para o fallback da página — que é onde ela deve ser tomada.
 *
 * A primeira chamada depois da janela passa: é ela que descobre que a origem
 * voltou, e um acerto zera a contagem.
 *
 * O estado é de módulo, ou seja, POR ISOLATE — dois isolates abrem o disjuntor
 * separadamente. Deixar assim é deliberado: compartilhar isso exigiria um
 * Durable Object, e o ganho que importa (não pendurar 20s repetidos no mesmo
 * isolate quente) já vem daqui.
 */
const FALHAS_ATE_ABRIR = 3;
const JANELA_ABERTO = 60_000;

let falhasSeguidas = 0;
let abertoAte = 0;

/** distingue "a origem está fora" de "a origem respondeu um erro" */
export class OrigemIndisponivel extends Error {
  constructor(causa?: string) {
    super(`Transfermarkt indisponível${causa ? `: ${causa}` : ''}`);
    this.name = 'OrigemIndisponivel';
  }
}

function registrarFalha(): void {
  if (++falhasSeguidas >= FALHAS_ATE_ABRIR) {
    abertoAte = Date.now() + JANELA_ABERTO;
  }
}

function registrarAcerto(): void {
  falhasSeguidas = 0;
  abertoAte = 0;
}

/**
 * Ritmo mínimo entre duas requisições à origem, e o contador delas.
 *
 * Zero por padrão: no Worker cada requisição de visitante dispara poucas
 * raspagens e atrasá-las só pioraria o TTFB de quem está esperando. Quem liga
 * isto é o job de espelho (`scripts/espelho.ts`), que é a única parte do
 * sistema que consulta o Transfermarkt em rajada de milhares — ali o ritmo
 * precisa ficar no nível de um humano navegando rápido, e o contador é o que
 * permite ao job parar dentro de um orçamento em vez de "até acabar".
 *
 * Fica aqui, no ponto por onde TODA requisição à origem passa, e não espalhado
 * em pausas dentro do job: assim uma chamada nova em `index.ts` já nasce sob
 * o mesmo ritmo, sem ninguém precisar lembrar disso.
 */
let intervaloMinimo = 0;
let ultimaRequisicao = 0;
let requisicoes = 0;

export function definirRitmo(ms: number): void {
  intervaloMinimo = Math.max(0, ms);
}

/**
 * Fila de um só, para o ritmo valer também quando as chamadas são paralelas.
 *
 * Vários getters de `index.ts` disparam `Promise.all` (a briefing de uma
 * partida, as estatísticas de uma liga). Sem esta serialização todas leriam o
 * mesmo `ultimaRequisicao`, calculariam a mesma espera e sairiam JUNTAS depois
 * dela — o intervalo viraria decoração e a rajada continuaria de pé.
 */
let filaRitmo: Promise<void> = Promise.resolve();

function aguardarVez(): Promise<void> {
  if (intervaloMinimo <= 0) return Promise.resolve();
  const minha = filaRitmo.then(async () => {
    const espera = ultimaRequisicao + intervaloMinimo - Date.now();
    if (espera > 0) await new Promise((r) => setTimeout(r, espera));
    ultimaRequisicao = Date.now();
  });
  // a fila nunca pode ficar rejeitada, ou toda requisição seguinte herdaria o
  // erro de uma anterior que não tinha nada a ver com ela
  filaRitmo = minha.catch(() => {});
  return minha;
}

/** quantas requisições à origem este processo já fez */
export function requisicoesFeitas(): number {
  return requisicoes;
}

/** o fetch da origem com o disjuntor em volta, comum aos dois hosts */
async function comDisjuntor(
  entrada: string,
  init: RequestInit,
): Promise<Response> {
  if (Date.now() < abertoAte) {
    throw new OrigemIndisponivel('disjuntor aberto');
  }

  await aguardarVez();
  requisicoes++;

  let res: Response;
  try {
    res = await fetch(entrada, init);
  } catch (e) {
    // só falha de rede/timeout abre o disjuntor: um 404 é a origem funcionando
    registrarFalha();
    throw new OrigemIndisponivel((e as Error).message);
  }

  registrarAcerto();
  return res;
}

async function tmFetch(path: string, accept: string): Promise<Response> {
  const res = await comDisjuntor(`${BASE}${path}`, {
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

/**
 * A página de manutenção do Transfermarkt.
 *
 * ELA VEM COM HTTP 200. Medido em 06/08/2026: 20 KB, sem tabela de elenco, sem
 * cabeçalho de clube. Os parsers a digerem sem reclamar e devolvem estrutura
 * vazia — `{name: '', players: []}` — que `cached()` grava como valor legítimo,
 * porque só `undefined` significa "não guarde isto".
 *
 * O estrago não é a indisponibilidade: é o cache. A lista de clubes da Série A
 * ficou vazia e TODA página de clube passou a devolver 502 em 1,7s, sem sequer
 * consultar a origem — servindo o vazio guardado, com 6h de validade lógica e 7
 * dias de retenção no L3. Ou seja, a manutenção deles durava minutos e o nosso
 * cache prolongava o efeito por horas.
 *
 * Tratar como falha é o que devolve o comportamento correto: a exceção sobe,
 * nada é gravado, e as camadas continuam servindo a cópia boa de antes.
 */
const MANUTENCAO = /<title>\s*Transfermarkt Maintenance\s*<\/title>/i;

export async function tmHtml(path: string): Promise<string> {
  const res = await tmFetch(path, 'text/html,application/xhtml+xml');
  const html = await res.text();
  if (MANUTENCAO.test(html)) {
    // conta para o disjuntor: manutenção é a origem indisponível, e insistir
    // em cada clube da série só rende vinte cópias da mesma página de aviso
    registrarFalha();
    throw new OrigemIndisponivel('em manutenção');
  }
  return html;
}

export async function tmJson<T>(path: string): Promise<T> {
  const res = await tmFetch(path, 'application/json');
  return res.json() as Promise<T>;
}

/** API JSON moderna do Transfermarkt (usada pelos web components do site) */
const API_BASE = 'https://tmapi.transfermarkt.technology';

export async function tmApiJson<T>(path: string): Promise<T> {
  // mesmo disjuntor do host de HTML: quando o Transfermarkt cai, cai junto —
  // medido no mesmo incidente, a API JSON travava exatamente igual
  const res = await comDisjuntor(`${API_BASE}${path}`, {
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
