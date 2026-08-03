/**
 * Cliente HTTP para o Transfermarkt (transfermarkt.com.br).
 *
 * Todas as consultas passam por um cache com TTL para não sobrecarregar o
 * site de origem — cada página consultada uma vez fica disponível para
 * todos os visitantes até expirar. São duas camadas:
 *
 *  L1: `Map` no isolate. Só vale enquanto o isolate viver, o que no Oxygen
 *      é pouco, mas mata as chamadas repetidas dentro de uma requisição.
 *  L2: Cache API do Worker, compartilhada entre os isolates do mesmo PoP e
 *      persistente entre deploys. É esta que de fato segura o tráfego em
 *      produção. Guarda `Response`, então só serve para valores JSON —
 *      todos os retornos de `index.ts` são objetos/arrays/null puros.
 *
 * A Cache API não existe no `vite dev` puro (Node); ali o código cai
 * silenciosamente de volta para o L1.
 */
const BASE = 'https://www.transfermarkt.com.br';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const memory = new Map<string, {exp: number; value: unknown}>();
const MAX_ENTRIES = 500;

const CACHE_NAME = 'tm';
/** a Cache API indexa por URL, não por chave livre — daí a origem sintética */
const CACHE_ORIGIN = 'https://tm.playersplace.cache';

const cacheUrl = (key: string) => `${CACHE_ORIGIN}/${encodeURIComponent(key)}`;

function remember(key: string, ttlSeconds: number, value: unknown): void {
  if (memory.size >= MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(key, {exp: Date.now() + ttlSeconds * 1000, value});
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
      const value = await fn();
      remember(key, ttlSeconds, value);
      if (cache && value !== undefined) await guardar(cache, key, ttlSeconds, value);
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
): Promise<void> {
  try {
    await cache.put(
      cacheUrl(key),
      new Response(JSON.stringify(value), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': `public, max-age=${RETENCAO}`,
          [HEADER_FRESCO_ATE]: String(Date.now() + ttlSeconds * 1000),
        },
      }),
    );
  } catch {
    // falha ao gravar no cache nunca deve derrubar a resposta
  }
}

/**
 * Busca com cache de duas camadas e stale-while-revalidate.
 *
 * A cópia velha é devolvida na hora e a atualização acontece em segundo plano.
 * Isso existe por uma medição: em produção, a primeira visita a uma página de
 * competição chegou a **16 segundos** de TTFB (o loader dispara 5 raspagens em
 * paralelo), contra 0,2 s com cache quente. Sem esta função, todo primeiro
 * visitante depois de cada expiração pagava essa conta.
 */
export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;

  const cache = await openCache();

  if (cache) {
    try {
      const stored = await cache.match(cacheUrl(key));
      if (stored) {
        const value = (await stored.json()) as T;
        const frescoAte = Number(stored.headers.get(HEADER_FRESCO_ATE) ?? 0);
        const restante = Math.max(0, frescoAte - Date.now());

        if (restante > 0) {
          remember(key, restante / 1000, value);
        } else {
          // velha: entra no L1 por pouco tempo só para segurar as chamadas
          // repetidas desta mesma requisição enquanto a atualização não volta
          remember(key, 30, value);
          revalidarEmSegundoPlano(key, ttlSeconds, fn, cache);
        }
        return value;
      }
    } catch {
      // entrada corrompida ou Cache API indisponível — busca na origem
    }
  }

  // primeira visita absoluta a esta chave: não há o que servir, tem que esperar
  const value = await fn();
  remember(key, ttlSeconds, value);
  if (cache && value !== undefined) await guardar(cache, key, ttlSeconds, value);

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
