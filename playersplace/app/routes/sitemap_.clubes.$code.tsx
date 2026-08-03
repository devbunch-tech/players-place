/**
 * Clubes de uma competição.
 *
 * As páginas de jogador não entram em sitemap nenhum de propósito: são
 * dezenas de milhares de ids do Transfermarkt e enumerá-las custaria mais
 * requisições à origem do que o worker aguenta. O robô chega até elas pelo
 * elenco linkado na página do clube, que é justamente o que estes arquivos
 * garantem que seja rastreado.
 */
import type {Route} from './+types/sitemap_.clubes.$code';
import {findLeague} from '~/lib/tm/leagues';
import {getLeagueOverview} from '~/lib/tm';
import {urlset} from '~/lib/sitemap';

export async function loader({params}: Route.LoaderArgs) {
  const code = params.code.toUpperCase();
  if (!findLeague(code)) {
    throw new Response('Competição desconhecida.', {status: 404});
  }

  const overview = await getLeagueOverview(code).catch(() => null);

  return urlset(
    (overview?.clubs ?? []).map((club) => ({
      path: `/clubes/${club.id}`,
      changefreq: 'daily' as const,
      priority: 0.7,
    })),
    86400,
  );
}
