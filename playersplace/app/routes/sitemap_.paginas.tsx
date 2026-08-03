/**
 * Páginas fixas do site. Só entram aqui os endereços que são canônicos de si
 * mesmos — busca, comparação e área logada ficam de fora porque estão
 * marcadas como noindex.
 */
import {LEAGUES} from '~/lib/tm/leagues';
import {urlset, type SitemapEntry} from '~/lib/sitemap';

export function loader() {
  const entries: SitemapEntry[] = [
    {path: '/', changefreq: 'daily', priority: 1.0},
    {path: '/valores', changefreq: 'daily', priority: 0.9},
    {path: '/transferencias', changefreq: 'daily', priority: 0.9},
    {path: '/competicoes', changefreq: 'weekly', priority: 0.8},
    {path: '/fantasy', changefreq: 'weekly', priority: 0.7},
    {path: '/fantasy/ranking', changefreq: 'daily', priority: 0.5},
    {path: '/pro', changefreq: 'monthly', priority: 0.5},
    {path: '/canais', changefreq: 'monthly', priority: 0.5},

    // cada aba de transferências é uma lista diferente, com canônica própria
    {path: '/transferencias?tab=recordes', changefreq: 'monthly', priority: 0.6},
    {path: '/transferencias?tab=contratos', changefreq: 'weekly', priority: 0.6},
    {path: '/transferencias?tab=livres', changefreq: 'weekly', priority: 0.6},

    // idem para o ranking de valores por liga
    ...LEAGUES.map((l): SitemapEntry => ({
      path: `/valores?liga=${l.code}`,
      changefreq: 'daily',
      priority: 0.7,
    })),
  ];

  return urlset(entries, 86400);
}
