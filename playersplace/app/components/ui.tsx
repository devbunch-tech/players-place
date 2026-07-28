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

export function EmptyNote({children}: {children: React.ReactNode}) {
  return (
    <div className="rounded-card border border-line bg-card p-6 text-center text-sm text-muted">
      {children}
    </div>
  );
}
