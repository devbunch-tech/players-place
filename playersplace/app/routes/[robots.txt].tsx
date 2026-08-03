/**
 * robots.txt sensível ao host.
 *
 * O app responde no domínio final e também no do Oxygen
 * (`*.o2.myshopify.dev`), que é ambiente de teste. Servir o mesmo "pode
 * indexar" nos dois colocaria o conteúdo duas vezes no Google, competindo
 * consigo mesmo — por isso qualquer host que não seja o de produção recebe
 * bloqueio total.
 */
import {SITE_URL} from '~/lib/seo';

/** aceita o apex e o www; o resto é preview */
function isProduction(host: string): boolean {
  const domain = host.split(':')[0].toLowerCase();
  return domain === 'playersplace.com.br' || domain === 'www.playersplace.com.br';
}

/**
 * Caminhos que não devem consumir rastreio: rotas de dados, área logada,
 * ponte de checkout e as páginas marcadas como noindex (busca e comparação
 * geram infinitas combinações de query).
 */
const DISALLOW = [
  '/api/',
  '/account/',
  '/comprar',
  '/busca',
  '/comparar',
  '/fantasy/escalar',
  '/fantasy/perfil',
  '/fantasy/apelido',
];

export function loader({request}: {request: Request}) {
  const production = isProduction(new URL(request.url).host);

  const body = production
    ? [
        'User-agent: *',
        ...DISALLOW.map((p) => `Disallow: ${p}`),
        '',
        `Sitemap: ${SITE_URL}/sitemap.xml`,
        '',
      ].join('\n')
    : ['# ambiente de teste — fora do índice', 'User-agent: *', 'Disallow: /', ''].join(
        '\n',
      );

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
