/**
 * Índice de sitemaps — o único endereço que precisa ser informado ao Google
 * Search Console. Ele aponta para os arquivos que carregam as URLs de fato.
 */
import {LEAGUES} from '~/lib/tm/leagues';
import {sitemapIndex} from '~/lib/sitemap';

export function loader() {
  return sitemapIndex([
    '/sitemap/paginas',
    '/sitemap/competicoes',
    // um arquivo por liga: o elenco de clubes vem do Transfermarkt, e juntar
    // as 15 numa requisição só estouraria o limite de subrequests do worker
    ...LEAGUES.map((l) => `/sitemap/clubes/${l.code}`),
  ]);
}
