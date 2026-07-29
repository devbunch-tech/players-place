/**
 * Cliente do Supabase — a persistência do Game Fantasy.
 *
 * Usa a chave `service_role`, que ignora o Row Level Security do banco. Por
 * isso este módulo só pode ser importado por loader/action (servidor). Se a
 * chave chegasse ao navegador, qualquer visitante poderia ler e alterar as
 * escalações de todo mundo. Quem valida "este registro é deste cliente" é o
 * nosso código, sempre filtrando por `customer_id`.
 *
 * O runtime do Oxygen não abre socket TCP, então bibliotecas Postgres comuns
 * (`pg`, `postgres`) não funcionam aqui — o supabase-js fala HTTP e por isso
 * roda sem problema.
 */
import {createClient, type SupabaseClient} from '@supabase/supabase-js';

export type Db = SupabaseClient;

/**
 * Devolve o cliente, ou null quando as variáveis não estão cadastradas.
 * Null em vez de exceção de propósito: o resto do site não pode cair só
 * porque o banco do Fantasy não foi configurado.
 */
/**
 * Só o origin da URL do projeto.
 *
 * O supabase-js monta `${url}/rest/v1/...`. Se a variável vier com barra no
 * final ou com um caminho colado (`/rest/v1`), o resultado tem barra dupla e
 * o gateway devolve 404 "Invalid path specified in request URL" — que não
 * parece erro de configuração e custa caro para diagnosticar.
 */
function normalizeUrl(raw: string): string | null {
  try {
    return new URL(raw.trim()).origin;
  } catch {
    return null;
  }
}

export function createDb(env: Env): Db | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const url = env.SUPABASE_URL ? normalizeUrl(env.SUPABASE_URL) : null;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      // não há sessão de usuário do Supabase: quem autentica é a Shopify
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** true quando o banco está configurado neste ambiente */
export function dbConfigured(env: Env): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
}
