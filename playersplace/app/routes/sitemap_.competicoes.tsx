/** Uma entrada por competição conectada à plataforma. */
import {LEAGUES} from '~/lib/tm/leagues';
import {urlset} from '~/lib/sitemap';

export function loader() {
  return urlset(
    LEAGUES.map((l) => ({
      path: `/competicoes/${l.code}`,
      changefreq: 'daily' as const,
      priority: 0.8,
    })),
    86400,
  );
}
