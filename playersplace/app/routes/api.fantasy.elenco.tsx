/**
 * Elenco disponível de um clube para a escalação da rodada.
 *
 * Carregado sob demanda, um clube por vez: o campeonato inteiro seriam 40+
 * requisições ao Transfermarkt numa só request do worker.
 */
import {getClubSquadAvailable} from '~/lib/tm';
import type {Route} from './+types/api.fantasy.elenco';

export async function loader({request}: Route.LoaderArgs) {
  const clube = new URL(request.url).searchParams.get('clube') ?? '';
  if (!/^\d+$/.test(clube)) {
    return Response.json({erro: 'clube inválido'}, {status: 400});
  }

  try {
    const {clubId, clubName, available, out} =
      await getClubSquadAvailable(clube);
    return Response.json(
      {clubId, clubName, available, out},
      {headers: {'Cache-Control': 'public, max-age=300'}},
    );
  } catch {
    return Response.json(
      {erro: 'não foi possível carregar o elenco agora'},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
