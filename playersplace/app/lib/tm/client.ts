/**
 * Cliente HTTP para o Transfermarkt (transfermarkt.com.br).
 *
 * Todas as consultas passam por um cache em memória com TTL para
 * não sobrecarregar o site de origem — cada página consultada uma
 * vez fica disponível para todos os visitantes até expirar.
 */
const BASE = 'https://www.transfermarkt.com.br';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const memory = new Map<string, {exp: number; value: unknown}>();
const MAX_ENTRIES = 500;

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  const hit = memory.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const value = await fn();
  if (memory.size >= MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest) memory.delete(oldest);
  }
  memory.set(key, {exp: Date.now() + ttlSeconds * 1000, value});
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
