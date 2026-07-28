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
        // o que sobrou do TTL: a entrada pode estar quase vencendo
        const age = Number(stored.headers.get('age') ?? 0);
        remember(key, Math.max(0, ttlSeconds - age), value);
        return value;
      }
    } catch {
      // entrada corrompida ou Cache API indisponível — busca na origem
    }
  }

  const value = await fn();
  remember(key, ttlSeconds, value);

  if (cache && value !== undefined) {
    try {
      await cache.put(
        cacheUrl(key),
        new Response(JSON.stringify(value), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': `public, max-age=${ttlSeconds}`,
          },
        }),
      );
    } catch {
      // falha ao gravar no cache nunca deve derrubar a resposta
    }
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
