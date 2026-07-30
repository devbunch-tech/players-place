/**
 * Preparação de um jogo da rodada: quem está em dúvida, quem está suspenso e
 * quem está pendurado nos dois clubes.
 *
 * Carregado sob demanda, um jogo por vez. São 3 requisições ao Transfermarkt
 * (a ficha do jogo e a página de desfalques de cada clube); a rodada inteira
 * de uma vez seriam 30 e o worker tem limite de subrequests.
 */
import {getMatchBriefing} from '~/lib/tm';
import type {Route} from './+types/api.jogo';

export async function loader({request}: Route.LoaderArgs) {
  const q = new URL(request.url).searchParams;
  const id = q.get('id') ?? '';
  const casa = q.get('casa') ?? '';
  const fora = q.get('fora') ?? '';
  if (![id, casa, fora].every((v) => /^\d+$/.test(v))) {
    return Response.json({erro: 'jogo inválido'}, {status: 400});
  }

  try {
    return Response.json(await getMatchBriefing(id, casa, fora), {
      headers: {'Cache-Control': 'public, max-age=600'},
    });
  } catch {
    return Response.json(
      {erro: 'não foi possível carregar a preparação do jogo agora'},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
