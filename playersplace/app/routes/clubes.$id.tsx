import {Link} from 'react-router';
import type {Route} from './+types/clubes.$id';
import {findLeague} from '~/lib/tm/leagues';
import {getClub, getClubTransfers} from '~/lib/tm';
import {euroToMillions} from '~/lib/format';
import {Avatar, BackLink, Crest, SectionTitle, StatTile} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ClubSignings} from '~/components/ClubSignings';
import {ProCard} from '~/components/ProCard';

export const meta: Route.MetaFunction = ({data}) => [
  {title: data ? `${data.club.name} · Players Place` : 'Clube · Players Place'},
];

export async function loader({params, request}: Route.LoaderArgs) {
  const season = new URL(request.url).searchParams.get('temporada');
  const [club, transfers] = await Promise.all([
    getClub(params.id).catch(() => null),
    getClubTransfers(
      params.id,
      /^\d+$/.test(season ?? '') ? season : null,
    ).catch(() => null),
  ]);
  if (!club || !club.name) {
    throw new Response('Não foi possível carregar este clube agora.', {
      status: 502,
    });
  }
  const league = club.league ? (findLeague(club.league.code) ?? null) : null;

  const ages = club.players
    .map((p) => p.age)
    .filter((a): a is number => a !== null);
  const avgAge = ages.length
    ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)
    : '—';

  // estrangeiros: primeira nacionalidade diferente do país da liga
  // (fallback: nacionalidade mais comum do elenco)
  const firstNats = club.players.map(
    (p) => p.nationality.split(',')[0]?.trim() ?? '',
  );
  let homeCountry = league?.country ?? null;
  if (!homeCountry && firstNats.length) {
    const counts = new Map<string, number>();
    for (const n of firstNats) counts.set(n, (counts.get(n) ?? 0) + 1);
    homeCountry = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  const foreigners = homeCountry
    ? firstNats.filter((n) => n && n !== homeCountry).length
    : null;

  const highlights = [...club.players]
    .sort(
      (a, b) => (euroToMillions(b.value) ?? 0) - (euroToMillions(a.value) ?? 0),
    )
    .slice(0, 5);

  return {
    id: params.id,
    club,
    league,
    avgAge,
    foreigners,
    highlights,
    transfers,
  };
}

export default function Clube({loaderData}: Route.ComponentProps) {
  const {id, club, league, avgAge, foreigners, highlights, transfers} =
    loaderData;

  return (
    <div className="pp-in">
      <BackLink
        to={club.league ? `/competicoes/${club.league.code}` : '/competicoes'}
        label={club.league?.name ?? 'Competições'}
      />

      <div className="flex items-center gap-4">
        <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-card ring-4 ring-card">
          <Crest src={club.crest} name={club.name} size={52} />
        </span>
        <div>
          <h1 className="font-display text-[24px] leading-tight font-extrabold tracking-tight sm:text-[28px]">
            {club.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {club.league ? (
              <Link
                to={`/competicoes/${club.league.code}`}
                className="font-semibold text-pitch hover:text-linkhover"
              >
                {club.league.name}
              </Link>
            ) : null}
            {league ? ` · ${league.flag} ${league.country}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-card bg-pitch p-5 text-white">
        <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
          Valor do elenco
        </div>
        <div className="mt-1 font-display text-[32px] leading-none font-extrabold tracking-tight tabular-nums">
          {club.totalValue || '—'}
        </div>
        <div className="mt-2 text-xs text-white/60">
          fonte: Transfermarkt · atualizado hoje
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Jogadores" value={String(club.players.length)} />
        <StatTile label="Idade média" value={avgAge} />
        <StatTile
          label="Estrangeiros"
          value={foreigners === null ? '—' : String(foreigners)}
        />
        <StatTile
          label={`Contratações ${transfers?.seasonLabel ?? ''}`.trim()}
          value={
            transfers
              ? String(
                  transfers.arrivals.filter((a) => a.kind !== 'retorno').length,
                )
              : '—'
          }
        />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {transfers ? (
            <ClubSignings clubId={id} transfers={transfers} />
          ) : null}

          <section>
            <SectionTitle>Elenco</SectionTitle>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-[13px]">
                  <thead>
                    <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                      <th className="px-3 py-2.5 text-center">#</th>
                      <th className="px-3 py-2.5">Jogador</th>
                      <th className="px-3 py-2.5">Posição</th>
                      <th className="px-3 py-2.5 text-center">Idade</th>
                      <th className="px-3 py-2.5">Nacionalidade</th>
                      <th className="px-3 py-2.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {club.players.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                      >
                        <td className="px-3 py-2.5 text-center font-bold text-faint tabular-nums">
                          {p.number || '—'}
                        </td>
                        <td className="px-3 py-2.5">
                          <Link
                            to={`/jogadores/${p.id}`}
                            className="flex items-center gap-2.5 font-bold hover:text-pitch"
                          >
                            <Avatar src={p.photo} name={p.name} size={30} />
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-muted">{p.position}</td>
                        <td className="px-3 py-2.5 text-center text-muted tabular-nums">
                          {p.age ?? '—'}
                        </td>
                        <td className="px-3 py-2.5 text-muted">
                          {p.nationality}
                        </td>
                        <td className="px-3 py-2.5 text-right font-extrabold tabular-nums">
                          {p.value || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-2 font-display text-base font-extrabold tracking-tight">
              Destaques do elenco
            </h2>
            {highlights.map((p) => (
              <Link
                key={p.id}
                to={`/jogadores/${p.id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hoverrow"
              >
                <Avatar src={p.photo} name={p.name} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold">{p.name}</div>
                  <div className="truncate text-xs text-faint">
                    {p.position}
                  </div>
                </div>
                <span className="text-[13px] font-extrabold tabular-nums">
                  {p.value}
                </span>
              </Link>
            ))}
          </section>
          <AdSlot />
          <ProCard />
        </aside>
      </div>
    </div>
  );
}
