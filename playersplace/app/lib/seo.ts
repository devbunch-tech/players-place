/**
 * Metadados de SEO — a fonte única de `<title>`, description, canonical,
 * Open Graph, Twitter Card e JSON-LD do site.
 *
 * Por que centralizado: no React Router só o `meta` da rota **mais profunda**
 * é renderizado — assim que uma rota filha exporta o seu, o do root é
 * descartado inteiro. Não existe herança nem merge automático, então cada
 * página precisa emitir o conjunto completo de tags. Este módulo é esse
 * conjunto; as rotas só descrevem o que é específico delas.
 */
import type {MetaDescriptor} from 'react-router';

export const SITE_NAME = 'Players Place';

/**
 * Domínio canônico. Toda URL absoluta (canonical, og:url, sitemap, JSON-LD)
 * sai daqui — é o que evita o Google enxergar o mesmo conteúdo em
 * `playersplace.com.br`, `www.playersplace.com.br` e no domínio do Oxygen
 * como três páginas diferentes.
 *
 * Não é variável de ambiente de propósito: `meta()` roda também no navegador,
 * onde `context.env` não existe, e um canonical que muda entre servidor e
 * cliente é pior do que um valor fixo.
 */
export const SITE_URL = 'https://www.playersplace.com.br';

/** host do domínio canônico, usado por robots.txt para reconhecer preview */
export const SITE_HOST = new URL(SITE_URL).host;

/** arte 1200×630 usada quando a página não tem imagem própria */
export const OG_IMAGE = `${SITE_URL}/og-players-place.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export const SITE_DESCRIPTION =
  'Valores de mercado, elencos, transferências e estatísticas das principais ligas do mundo, em tempo real e em português.';

/**
 * Regras para o robô quando a página é indexável. `max-image-preview:large`
 * libera a miniatura grande no Google Imagens e no Discover.
 */
const ROBOTS_INDEX =
  'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

/** páginas de resultado/ferramenta: fora do índice, mas os links contam */
const ROBOTS_NOINDEX = 'noindex, follow';

/** limite prático do trecho exibido pelo Google */
const DESCRIPTION_MAX = 160;

/** corta no espaço anterior ao limite, sem cortar palavra no meio */
export function truncate(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ')) || cut}…`;
}

/**
 * Tira o ponto final de um valor vindo do Transfermarkt ("€8,00 mi.") para
 * ele poder ser costurado no meio de uma frase sem virar ponto duplo.
 */
export function semPontoFinal(value: string): string {
  return value.trim().replace(/\.$/, '');
}

/** URL absoluta no domínio canônico, a partir de um caminho iniciado por "/" */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

/**
 * URL canônica da página.
 *
 * Só os parâmetros passados aqui entram — o resto da query (filtros, rodada,
 * temporada, paginação de aba) é deliberadamente descartado para que variações
 * da mesma página apontem todas para um endereço só, em vez de competirem
 * entre si no índice.
 */
export function canonical(
  pathname: string,
  params?: Record<string, string | number | null | undefined>,
): string {
  const url = new URL(pathname, SITE_URL);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== null && value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export interface SeoInput {
  /** parte específica da página — a marca é anexada automaticamente */
  title: string;
  description: string;
  /**
   * URL canônica absoluta; monte com `canonical()`. Omitir só faz sentido em
   * página de erro, onde apontar uma canônica seria afirmar que aquele
   * endereço existe.
   */
  url?: string;
  /** imagem de compartilhamento; sem ela vai a arte padrão da marca */
  image?: string | null;
  imageAlt?: string;
  /**
   * `large` é a arte 1200×630; `small` é para foto de jogador e escudo de
   * clube, que são quadrados pequenos e ficam deformados no card grande.
   */
  card?: 'large' | 'small';
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
  /** quando o título já traz a marca por extenso (home, páginas de venda) */
  brandInTitle?: boolean;
}

/** Conjunto completo de tags de uma página. */
export function seo({
  title,
  description,
  url,
  image,
  imageAlt,
  card,
  type = 'website',
  noindex = false,
  brandInTitle = false,
}: SeoInput): MetaDescriptor[] {
  const fullTitle = brandInTitle ? title : `${title} · ${SITE_NAME}`;
  const desc = truncate(description);
  const shareImage = image || OG_IMAGE;
  const isDefaultArt = shareImage === OG_IMAGE;
  const twitterCard =
    (card ?? (isDefaultArt ? 'large' : 'small')) === 'large'
      ? 'summary_large_image'
      : 'summary';

  const tags: MetaDescriptor[] = [
    {title: fullTitle},
    {name: 'description', content: desc},
    {name: 'robots', content: noindex ? ROBOTS_NOINDEX : ROBOTS_INDEX},
    ...(url
      ? ([
          {tagName: 'link', rel: 'canonical', href: url},
          {property: 'og:url', content: url},
        ] as MetaDescriptor[])
      : []),

    {property: 'og:site_name', content: SITE_NAME},
    {property: 'og:locale', content: 'pt_BR'},
    {property: 'og:type', content: type},
    {property: 'og:title', content: fullTitle},
    {property: 'og:description', content: desc},
    {property: 'og:image', content: shareImage},
    {property: 'og:image:alt', content: imageAlt ?? fullTitle},

    {name: 'twitter:card', content: twitterCard},
    {name: 'twitter:title', content: fullTitle},
    {name: 'twitter:description', content: desc},
    {name: 'twitter:image', content: shareImage},
    {name: 'twitter:image:alt', content: imageAlt ?? fullTitle},
  ];

  if (isDefaultArt) {
    tags.push(
      {property: 'og:image:width', content: String(OG_IMAGE_WIDTH)},
      {property: 'og:image:height', content: String(OG_IMAGE_HEIGHT)},
      {property: 'og:image:type', content: 'image/png'},
    );
  }

  return tags;
}

/** Envelope de um bloco JSON-LD dentro do array de `meta`. */
export function ldJson(data: Record<string, unknown>): MetaDescriptor {
  return {'script:ld+json': data};
}

/**
 * Trilha de navegação. O Google usa para trocar a URL crua pelo caminho
 * legível no resultado da busca — vale para jogador, clube e competição, que
 * são páginas profundas.
 */
export function breadcrumbLd(
  items: Array<{name: string; path: string}>,
): MetaDescriptor {
  return ldJson({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  });
}

/** Identidade da marca — vai só na home, para não repetir em todo o site. */
export function organizationLd(): MetaDescriptor {
  return ldJson({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organizacao`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${SITE_URL}/icone-app-512.png`,
      width: 512,
      height: 512,
    },
    description: SITE_DESCRIPTION,
    email: 'anuncie@playersplace.com.br',
    areaServed: 'BR',
  });
}

/**
 * Site + caixa de busca. É o que habilita o campo de pesquisa do próprio site
 * dentro do resultado do Google (sitelinks searchbox).
 */
export function websiteLd(): MetaDescriptor {
  return ldJson({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#site`,
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: 'pt-BR',
    description: SITE_DESCRIPTION,
    publisher: {'@id': `${SITE_URL}/#organizacao`},
    potentialAction: {
      '@type': 'SearchAction',
      target: {
        '@type': 'EntryPoint',
        urlTemplate: `${SITE_URL}/busca?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
  });
}
