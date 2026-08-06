/**
 * Geração dos sitemaps.
 *
 * O site é dividido em vários arquivos em vez de um só porque as listas de
 * clubes dependem do Transfermarkt: um sitemap único obrigaria a consultar
 * todas as ligas na mesma requisição, o que estoura o limite de subrequests do
 * worker do Oxygen. Com um arquivo por liga, cada requisição faz uma consulta
 * e o índice em /sitemap.xml costura tudo.
 */
import {absoluteUrl} from './seo';

export type ChangeFreq =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface SitemapEntry {
  /** caminho iniciado por "/", com query string se fizer parte da canônica */
  path: string;
  changefreq?: ChangeFreq;
  /** 0.0–1.0; omitido usa o padrão 0.5 do protocolo */
  priority?: number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlResponse(body: string, maxAge: number): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': `public, max-age=${maxAge}, s-maxage=${maxAge}`,
    },
  });
}

/** Arquivo de URLs (`<urlset>`). */
export function urlset(entries: SitemapEntry[], maxAge = 3600): Response {
  const urls = entries
    .map((e) => {
      const parts = [`    <loc>${escapeXml(absoluteUrl(e.path))}</loc>`];
      if (e.changefreq) parts.push(`    <changefreq>${e.changefreq}</changefreq>`);
      if (e.priority !== undefined) {
        parts.push(`    <priority>${e.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
    maxAge,
  );
}

/** Índice que aponta para os demais arquivos (`<sitemapindex>`). */
export function sitemapIndex(paths: string[], maxAge = 3600): Response {
  const items = paths
    .map(
      (p) =>
        `  <sitemap>\n    <loc>${escapeXml(absoluteUrl(p))}</loc>\n  </sitemap>`,
    )
    .join('\n');

  return xmlResponse(
    `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`,
    maxAge,
  );
}
