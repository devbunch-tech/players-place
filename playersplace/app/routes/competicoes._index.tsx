import {Link, useSearchParams} from 'react-router';
import type {Route} from './+types/competicoes._index';
import {LEAGUES, REGIONS} from '~/lib/tm/leagues';
import {ChipLink, LeagueLogo} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';

export const meta: Route.MetaFunction = () => [
  {title: 'Competições · Players Place'},
];

export default function Competicoes() {
  const [params] = useSearchParams();
  const regiao = params.get('regiao');
  const filtered = regiao ? LEAGUES.filter((l) => l.region === regiao) : LEAGUES;

  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Competições
      </h1>
      <p className="mt-1 text-sm text-muted">
        15 ligas conectadas — clubes, elencos e valores em tempo real.
      </p>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <ChipLink to="/competicoes" active={!regiao}>
          Todas
        </ChipLink>
        {REGIONS.map((r) => (
          <ChipLink
            key={r}
            to={`/competicoes?regiao=${encodeURIComponent(r)}`}
            active={regiao === r}
          >
            {r}
          </ChipLink>
        ))}
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-card border border-line bg-card">
          {filtered.map((l) => (
            <Link
              key={l.code}
              to={`/competicoes/${l.code}`}
              className="flex items-center gap-4 border-b border-innerline px-4 py-3.5 last:border-b-0 hover:bg-hoverrow"
            >
              <LeagueLogo
                code={l.code}
                name={l.name}
                size={44}
                fallbackColor={l.color}
                fallbackShort={l.short}
              />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-bold">{l.name}</div>
                <div className="mt-0.5 text-xs text-faint">
                  {l.flag} {l.country} · {l.region}
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-faint" aria-hidden>
                <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          ))}
        </div>
        <aside className="space-y-6">
          <ProCard />
          <AdSlot />
        </aside>
      </div>
    </div>
  );
}
