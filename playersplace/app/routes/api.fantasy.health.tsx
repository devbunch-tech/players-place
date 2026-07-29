/**
 * Diagnóstico da conexão com o Supabase.
 *
 * TEMPORÁRIA: existe para confirmar que as variáveis foram cadastradas no
 * Oxygen e que o schema rodou. Deve ser removida assim que o Game Fantasy
 * estiver de pé — ela não expõe dado nenhum, mas também não serve a usuário.
 *
 * Nunca devolve a chave nem parte dela.
 */
import {createDb, dbConfigured} from '~/lib/db';
import type {Route} from './+types/api.fantasy.health';

export async function loader({context}: Route.LoaderArgs) {
  const configured = dbConfigured(context.env);
  if (!configured) {
    return Response.json({
      configured: false,
      detalhe:
        'SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY não estão no ambiente.',
    });
  }

  const db = createDb(context.env);
  if (!db) return Response.json({configured: true, cliente: false});

  // A última é um controle: se ela também vier "ok", o diagnóstico está
  // engolindo erro e nenhum resultado acima pode ser levado a sério.
  const tabelas = [
    'fantasy_rounds',
    'fantasy_entries',
    'fantasy_picks',
    '__controle_tabela_inexistente',
  ];
  const resultado: Record<string, string> = {};

  for (const t of [...tabelas, 'fantasy_monthly_ranking']) {
    const r = await db.from(t).select('*').limit(1);
    resultado[t] = JSON.stringify({
      status: r.status,
      statusText: r.statusText,
      erro: r.error ? r.error.message : null,
      linhas: Array.isArray(r.data) ? r.data.length : null,
    });
  }

  // confere se a URL cadastrada é mesmo um projeto Supabase, sem revelar
  // o host completo
  const host = (() => {
    try {
      return new URL(context.env.SUPABASE_URL!).hostname.replace(
        /^[^.]+/,
        '***',
      );
    } catch {
      return 'URL INVÁLIDA';
    }
  })();

  // presença e tamanho do token de apuração — nunca o valor. Serve para
  // distinguir "variável não cadastrada" de "cadastrada com outro valor".
  const tokenApuracao = context.env.FANTASY_APURACAO_TOKEN;
  const apuracao = {
    variavelPresente: Boolean(tokenApuracao),
    tamanho: tokenApuracao?.length ?? 0,
    temEspacoOuQuebra: tokenApuracao ? /\s/.test(tokenApuracao) : false,
  };

  return Response.json({
    configured: true,
    cliente: true,
    host,
    apuracao,
    tabelas: resultado,
  });
}
