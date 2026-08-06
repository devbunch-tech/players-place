import {useCallback, useState} from 'react';
import {Link} from 'react-router';
import {leagueLogo} from '~/lib/tm/leagues';

/**
 * O Transfermarkt devolve 200 com 0 byte para escudos/logos inexistentes.
 * O navegador trata isso como carregamento bem-sucedido de uma imagem 0×0,
 * então além do `onError` conferimos `naturalWidth` no mount (imagem que já
 * chegou antes da hidratação) e no `onLoad` (imagens `lazy`).
 */
function useBrokenImage() {
  const [broken, setBroken] = useState(false);
  const check = (node: HTMLImageElement | null) => {
    if (node?.complete && node.naturalWidth === 0) setBroken(true);
  };
  const ref = useCallback((node: HTMLImageElement | null) => check(node), []);
  return {
    broken,
    ref,
    onError: () => setBroken(true),
    onLoad: (e: React.SyntheticEvent<HTMLImageElement>) => check(e.currentTarget),
  };
}

/** Quadrado colorido com sigla — escudos/competições sem imagem licenciada */
export function Monogram({
  text,
  color,
  size = 44,
  radius = 12,
}: {
  text: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center font-display font-extrabold text-white select-none"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: color,
        fontSize: size * 0.36,
        letterSpacing: '-0.02em',
      }}
    >
      {text}
    </span>
  );
}

/** Logo oficial da competição, com fallback para o monograma colorido */
export function LeagueLogo({
  code,
  name,
  size = 44,
  fallbackColor = '#0E4632',
  fallbackShort,
}: {
  code: string;
  name: string;
  size?: number;
  fallbackColor?: string;
  fallbackShort?: string;
}) {
  const img = useBrokenImage();
  if (img.broken) {
    return (
      <Monogram
        text={fallbackShort ?? name.slice(0, 2).toUpperCase()}
        color={fallbackColor}
        size={size}
        radius={Math.round(size * 0.27)}
      />
    );
  }
  return (
    <img
      ref={img.ref}
      src={leagueLogo(code)}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={img.onError}
      onLoad={img.onLoad}
      className="shrink-0 object-contain"
      style={{width: size, height: size}}
    />
  );
}

/** Foto de jogador com fallback de iniciais */
export function Avatar({
  src,
  name,
  size = 38,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-avatarbg font-semibold text-muted select-none"
      style={{width: size, height: size, fontSize: size * 0.34}}
    >
      {initials}
      {src ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : null}
    </span>
  );
}

/** Escudo de clube (imagem do Transfermarkt) */
export function Crest({
  src,
  name,
  size = 24,
}: {
  src?: string | null;
  name: string;
  size?: number;
}) {
  const img = useBrokenImage();
  if (!src || img.broken) {
    return (
      <Monogram
        text={name.slice(0, 2).toUpperCase()}
        color="#70776B"
        size={size}
        radius={6}
      />
    );
  }
  return (
    <img
      ref={img.ref}
      src={src}
      alt={name}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={img.onError}
      onLoad={img.onLoad}
      className="shrink-0 object-contain"
      style={{width: size, height: size}}
    />
  );
}

export function StatTile({label, value}: {label: string; value: string}) {
  return (
    <div className="rounded-card border border-line bg-card px-4 py-3">
      <div className="text-[10px] font-bold tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      <div className="mt-1 font-display text-xl font-extrabold tracking-tight tabular-nums">
        {value}
      </div>
    </div>
  );
}

export function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="font-display text-lg font-extrabold tracking-tight">
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Tag de taxa/estado de transferência */
export function FeeTag({fee}: {fee: string}) {
  const isMoney = fee.includes('€');
  const label = isMoney ? fee : fee || '—';
  return (
    <span
      className={`rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap tabular-nums ${
        isMoney ? 'bg-upbg text-up' : 'bg-soft text-muted'
      }`}
    >
      {label}
    </span>
  );
}

export function BackLink({to, label}: {to: string; label: string}) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex h-9 items-center gap-2 rounded-full border border-line bg-card px-4 text-[13px] font-semibold text-muted hover:bg-hoverrow"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {label}
    </Link>
  );
}

/**
 * Aviso discreto de que a página está servindo a cópia guardada.
 *
 * Só aparece quando o dado está vencido — ou seja, quando o Transfermarkt não
 * respondeu a tempo e a atualização está acontecendo em segundo plano. Com o
 * dado fresco não há nada a dizer, e o componente some.
 */
export function DadosSalvos({em}: {em: string | null}) {
  if (!em) return null;
  return (
    <p className="mt-2 flex items-center gap-1.5 text-[11px] text-faint">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 7v5l3 2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Dados de {em} · atualizando em segundo plano
    </p>
  );
}

/** Chip de filtro em forma de link (estado ativo: bg ink) */
export function ChipLink({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      preventScrollReset
      className={`inline-flex h-9 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold whitespace-nowrap transition-colors ${
        active
          ? 'bg-ink text-white'
          : 'border border-line bg-card text-muted hover:bg-hoverrow'
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * Janela de páginas ao redor da atual, sempre com a primeira e a última.
 * `null` marca onde entra a reticência.
 */
function pageWindow(
  page: number,
  total: number,
  span = 1,
): {key: string; page: number | null}[] {
  const wanted = new Set<number>([1, total]);
  for (let p = page - span; p <= page + span; p++) {
    if (p >= 1 && p <= total) wanted.add(p);
  }
  const pages = [...wanted].sort((a, b) => a - b);
  const out: {key: string; page: number | null}[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push({key: `gap-${p}`, page: null});
    out.push({key: String(p), page: p});
  });
  return out;
}

/** Paginador em links — `href(p)` monta a URL de cada página */
export function Pager({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (p: number) => string;
}) {
  if (totalPages <= 1) return null;
  const step =
    'inline-flex h-9 min-w-9 items-center justify-center rounded-[11px] px-3 text-[13px] font-semibold tabular-nums';
  return (
    <nav
      aria-label="Paginação"
      className="mt-4 flex flex-wrap items-center justify-center gap-1.5"
    >
      {page > 1 ? (
        <Link
          to={href(page - 1)}
          preventScrollReset
          rel="prev"
          className={`${step} border border-line bg-card text-muted hover:bg-hoverrow`}
        >
          Anterior
        </Link>
      ) : (
        <span className={`${step} border border-line bg-card text-faint opacity-50`}>
          Anterior
        </span>
      )}

      {/* no mobile os números não cabem — vira "Página X de Y" */}
      <span className={`${step} text-muted sm:hidden`}>
        Página {page} de {totalPages}
      </span>

      <span className="hidden items-center gap-1.5 sm:flex">
        {pageWindow(page, totalPages).map(({key, page: p}) =>
          p === null ? (
            <span key={key} className={`${step} text-faint`}>
              …
            </span>
          ) : p === page ? (
            <span key={key} aria-current="page" className={`${step} bg-ink text-white`}>
              {p}
            </span>
          ) : (
            <Link
              key={key}
              to={href(p)}
              preventScrollReset
              className={`${step} border border-line bg-card text-muted hover:bg-hoverrow`}
            >
              {p}
            </Link>
          ),
        )}
      </span>

      {page < totalPages ? (
        <Link
          to={href(page + 1)}
          preventScrollReset
          rel="next"
          className={`${step} border border-line bg-card text-muted hover:bg-hoverrow`}
        >
          Próxima
        </Link>
      ) : (
        <span className={`${step} border border-line bg-card text-faint opacity-50`}>
          Próxima
        </span>
      )}
    </nav>
  );
}

export function EmptyNote({children}: {children: React.ReactNode}) {
  return (
    <div className="rounded-card border border-line bg-card p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Esqueletos
 *
 * Cada painel pesado da página do jogador desce em streaming e mostra um destes
 * enquanto não chega. Duas regras que valem para todos:
 *
 *  1. o esqueleto ocupa a MESMA altura do conteúdo real. Um placeholder mais
 *     baixo faz a página pular quando o painel chega, o que é pior do que a
 *     espera que ele veio disfarçar.
 *  2. `aria-hidden` + `role="status"` no contêiner: o leitor de tela ouve
 *     "carregando", não a barra cinza repetida quinze vezes.
 * ------------------------------------------------------------------------ */

/** barra cinza pulsante — a peça de que os outros esqueletos são feitos */
export function Skeleton({
  className = '',
  arredondado = 'rounded-md',
}: {
  className?: string;
  arredondado?: string;
}) {
  return (
    <div
      className={`pp-pulse bg-soft ${arredondado} ${className}`}
      aria-hidden
    />
  );
}

/** embrulho comum: título de seção real + corpo em esqueleto */
export function SkeletonSecao({
  titulo,
  children,
  rotulo,
}: {
  titulo: string;
  children: React.ReactNode;
  /** o que o leitor de tela ouve; por padrão, o próprio título */
  rotulo?: string;
}) {
  return (
    <section role="status" aria-live="polite" aria-busy="true">
      <SectionTitle>{titulo}</SectionTitle>
      <span className="sr-only">
        Carregando {rotulo ?? titulo.toLowerCase()}…
      </span>
      {children}
    </section>
  );
}

/** tabela em esqueleto — o caso mais comum (desempenho, jogos, carreira) */
export function SkeletonTabela({
  titulo,
  linhas = 6,
  colunas = 5,
}: {
  titulo: string;
  linhas?: number;
  colunas?: number;
}) {
  return (
    <SkeletonSecao titulo={titulo}>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="flex gap-3 border-b border-innerline px-4 py-3">
          {Array.from({length: colunas}, (_, i) => (
            <Skeleton
              key={i}
              className={`h-3 ${i === 0 ? 'flex-[2]' : 'flex-1'}`}
            />
          ))}
        </div>
        {Array.from({length: linhas}, (_, l) => (
          <div
            key={l}
            className="flex items-center gap-3 border-b border-innerline px-4 py-3.5 last:border-b-0"
          >
            {Array.from({length: colunas}, (_, c) => (
              <Skeleton
                key={c}
                className={`h-3.5 ${c === 0 ? 'flex-[2]' : 'flex-1'}`}
              />
            ))}
          </div>
        ))}
      </div>
    </SkeletonSecao>
  );
}

/** cartão da coluna lateral (ficha, posições, carreira por clube) */
export function SkeletonCartao({
  titulo,
  linhas = 4,
}: {
  titulo: string;
  linhas?: number;
}) {
  return (
    <section
      className="rounded-card border border-line bg-card p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <h2 className="mb-3 font-display text-base font-extrabold tracking-tight">
        {titulo}
      </h2>
      <span className="sr-only">Carregando {titulo.toLowerCase()}…</span>
      <div className="space-y-3">
        {Array.from({length: linhas}, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-2.5 w-16" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** lista de linhas com avatar — transferências, destaques, elenco */
export function SkeletonLista({
  titulo,
  linhas = 5,
}: {
  titulo: string;
  linhas?: number;
}) {
  return (
    <SkeletonSecao titulo={titulo}>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {Array.from({length: linhas}, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0"
          >
            <Skeleton className="h-8 w-8 shrink-0" arredondado="rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-2.5 w-1/4" />
            </div>
            <Skeleton className="h-3.5 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </SkeletonSecao>
  );
}

/**
 * Bloco livre, para os painéis que não são nem tabela nem lista (gráfico de
 * valorização, vídeo, campinho de posições).
 */
export function SkeletonBloco({
  titulo,
  altura = 'h-40',
}: {
  titulo: string;
  altura?: string;
}) {
  return (
    <SkeletonSecao titulo={titulo}>
      <Skeleton
        className={`w-full ${altura} border border-line`}
        arredondado="rounded-card"
      />
    </SkeletonSecao>
  );
}
