/**
 * Apuração de rodada.
 *
 * Regra do gatilho: a rodada só é apurada quando o ÚLTIMO jogo dela já tem
 * placar. Enquanto houver um "-:-" na página da rodada, nada é gravado —
 * apurar antes puniria quem apostou em jogador que ainda vai entrar em campo.
 *
 * Protegida por token porque cada chamada custa ~11 requisições ao
 * Transfermarkt (a página da rodada + uma súmula por jogo). Sem
 * FANTASY_APURACAO_TOKEN no ambiente a rota fica desligada.
 *
 * Idempotente: `scored_at` na tabela de rodadas impede apurar duas vezes.
 *
 * Uso:
 *   POST /api/fantasy/apurar            → apura a rodada pendente mais antiga
 *   POST /api/fantasy/apurar?round=21   → apura uma rodada específica
 *   header: x-fantasy-token: <token>
 */
import {getRodadaAtual, getRoundResults} from '~/lib/tm';
import {createDb} from '~/lib/db';
import {apurarRodada} from '~/lib/fantasy.server';
import type {Route} from './+types/api.fantasy.apurar';

const LIGA = 'BRA1';

function autorizado(request: Request, env: Env): boolean {
  const esperado = env.FANTASY_APURACAO_TOKEN;
  if (!esperado) return false;
  const recebido =
    request.headers.get('x-fantasy-token') ??
    new URL(request.url).searchParams.get('token');
  return recebido === esperado;
}

export async function action({request, context}: Route.ActionArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = createDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const url = new URL(request.url);
  const pedida = Number(url.searchParams.get('round'));

  let season: number;
  let round: number;

  if (Number.isInteger(pedida) && pedida > 0) {
    round = pedida;
    season = Number(url.searchParams.get('season')) || (await getRodadaAtual(LIGA)).season;
  } else {
    // rodada pendente mais antiga: já tem prazo vencido e ainda não foi apurada
    const {data} = await db
      .from('fantasy_rounds')
      .select('season, round, deadline_at')
      .eq('competition_code', LIGA)
      .is('scored_at', null)
      .lt('deadline_at', new Date().toISOString())
      .order('round', {ascending: true})
      .limit(1)
      .maybeSingle();

    if (!data) {
      return Response.json({ok: false, motivo: 'nenhuma-rodada-pendente'});
    }
    season = data.season;
    round = data.round;
  }

  const resultado = await getRoundResults(LIGA, season, round);

  if (!resultado.complete) {
    return Response.json({
      ok: false,
      motivo: 'rodada-em-andamento',
      round,
      jogos: resultado.jogos,
      encerrados: resultado.encerrados,
    });
  }

  const r = await apurarRodada(db, LIGA, season, round, resultado.stats);

  return Response.json({
    ...r,
    round,
    season,
    jogadoresComEvento: Object.keys(resultado.stats).length,
  });
}

/** GET só informa o estado, sem gravar nada — útil para conferir o gatilho. */
export async function loader({request, context}: Route.LoaderArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const url = new URL(request.url);
  const atual = await getRodadaAtual(LIGA);
  const round = Number(url.searchParams.get('round')) || atual.round;
  const resultado = await getRoundResults(LIGA, atual.season, round);

  return Response.json({
    round,
    season: atual.season,
    jogos: resultado.jogos,
    encerrados: resultado.encerrados,
    prontaParaApurar: resultado.complete,
    jogadoresComEvento: Object.keys(resultado.stats).length,
  });
}
