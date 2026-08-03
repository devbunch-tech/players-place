import {Link} from 'react-router';
import type {Route} from './+types/valores';
import {LEAGUES, findLeague} from '~/lib/tm/leagues';
import {getGlobalTopPlayers, getLeagueTopPlayers} from '~/lib/tm';
import {Avatar, ChipLink, EmptyNote} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {breadcrumbLd, canonical, seo} from '~/lib/seo';

export const meta: Route.MetaFunction = ({data}) => {
  const league = data?.league ?? null;
  // aqui o ?liga= entra na canônica: cada liga é um ranking diferente, com
  // conteúdo próprio, e não um filtro cosmético da mesma lista
  const url = canonical('/valores', {liga: league?.code});

  return [
    ...seo({
      title: league
        ? `Jogadores mais valiosos da ${league.name}`
        : 'Valores de mercado — os jogadores mais valiosos do mundo',
      description: league
        ? `Ranking dos 25 jogadores de maior valor de mercado da ${league.name} (${league.country}), com posição, idade, clube e valor atualizado.`
        : 'Ranking dos 25 jogadores de maior valor de mercado do futebol mundial, com posição, idade, clube e valor atualizado em tempo real.',
      url,
    }),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      {name: 'Valores de mercado', path: '/valores'},
      ...(league
        ? [{name: league.name, path: `/valores?liga=${league.code}`}]
        : []),
    ]),
  ];
};

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const liga = url.searchParams.get('liga')?.toUpperCase() ?? null;
  const league = liga ? (findLeague(liga) ?? null) : null;
  const players = await (league
    ? getLeagueTopPlayers(league.code)
    : getGlobalTopPlayers()
  ).catch(() => []);
  return {league, players: players.slice(0, 25)};
}

export default function Valores({loaderData}: Route.ComponentProps) {
  const {league, players} = loaderData;
  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Valores de mercado
      </h1>
      <p className="mt-1 text-sm text-muted">
        {league
          ? `Os jogadores mais valiosos: ${league.name}`
          : 'Os 25 jogadores mais valiosos do mundo'}
      </p>

      <div className="-mx-4 mt-5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        <ChipLink to="/valores" active={!league}>
          Top global
        </ChipLink>
        {LEAGUES.map((l) => (
          <ChipLink
            key={l.code}
            to={`/valores?liga=${l.code}`}
            active={league?.code === l.code}
          >
            {l.flag} {l.name}
          </ChipLink>
        ))}
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {players.length === 0 ? (
            <EmptyNote>
              Não foi possível carregar o ranking agora — tente novamente em
              instantes.
            </EmptyNote>
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-card">
              <div className="hidden grid-cols-[44px_1fr_180px_60px_110px] border-b border-innerline px-4 py-2.5 text-[11px] font-bold tracking-wide text-faint uppercase md:grid">
                <span>#</span>
                <span>Jogador</span>
                <span>Clube</span>
                <span className="text-center">Idade</span>
                <span className="text-right">Valor</span>
              </div>
              {players.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[28px_1fr_auto] items-center gap-2 border-b border-innerline px-4 py-2.5 last:border-b-0 hover:bg-hoverrow md:grid-cols-[44px_1fr_180px_60px_110px]"
                >
                  <span className="text-xs font-bold text-faint tabular-nums">
                    {p.rank}
                  </span>
                  <Link
                    to={`/jogadores/${p.id}`}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <Avatar src={p.photo} name={p.name} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold hover:text-pitch">
                        {p.name}
                      </span>
                      <span className="block truncate text-xs text-faint md:hidden">
                        {p.club?.name}
                        {p.position ? ` · ${p.position}` : ''}
                      </span>
                      <span className="hidden text-xs text-faint md:block">
                        {p.position}
                        {p.nationality ? ` · ${p.nationality.split(',')[0]}` : ''}
                      </span>
                    </span>
                  </Link>
                  <span className="hidden min-w-0 md:block">
                    {p.club?.id ? (
                      <Link
                        to={`/clubes/${p.club.id}`}
                        className="truncate text-[13px] font-semibold text-muted hover:text-pitch"
                      >
                        {p.club.name}
                      </Link>
                    ) : (
                      <span className="text-[13px] text-muted">{p.club?.name}</span>
                    )}
                  </span>
                  <span className="hidden text-center text-[13px] text-muted tabular-nums md:block">
                    {p.age || '—'}
                  </span>
                  <span className="text-right text-sm font-extrabold tabular-nums">
                    {p.value}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <ProCard />
          <AdSlot />
        </aside>
      </div>
    </div>
  );
}
