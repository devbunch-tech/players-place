import {Link} from 'react-router';
import type {Route} from './+types/competicoes.$code';
import {findLeague, leagueLogo} from '~/lib/tm/leagues';
import {
  getLeagueOverview,
  getLeagueStandings,
  getLeagueStats,
  getLeagueTopPlayers,
  getRoundFixtures,
} from '~/lib/tm';
import {euroToMillions, sumValues} from '~/lib/format';
import {
  Avatar,
  BackLink,
  Crest,
  LeagueLogo,
  SectionTitle,
  StatTile,
} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {StatLeaders} from '~/components/StatLeaders';
import {RoundFixtures, RoundNav} from '~/components/RoundFixtures';
import {breadcrumbLd, canonical, ldJson, semPontoFinal, seo} from '~/lib/seo';

export const meta: Route.MetaFunction = ({data, params}) => {
  // código canônico (ver o loader): a canônica precisa apontar para uma URL
  // que funcione, e /competicoes/TDEC não funciona
  const code =
    data?.code ?? findLeague(params.code ?? '')?.code ?? (params.code ?? '');
  // ?rodada= troca só o bloco de jogos: a página continua sendo a mesma
  // competição, então a canônica aponta sempre para a versão sem parâmetro
  const url = canonical(`/competicoes/${code}`);

  if (!data) {
    return seo({
      title: 'Competição',
      description:
        'Tabela de classificação, artilheiros, clubes e valores de mercado da competição.',
      url,
    });
  }

  const {overview, league, totalValue, totalPlayers} = data;
  const onde = league ? ` (${league.country})` : '';

  return [
    ...seo({
      title: `${overview.name} — tabela, clubes e valores de mercado`,
      description: `${overview.name}${onde}, temporada ${overview.season}: classificação, artilheiros, ${overview.clubs.length} clubes, ${totalPlayers} jogadores e ${semPontoFinal(totalValue)} em valor de mercado.`,
      url,
      // sem logo próprio de propósito: competição sem licença de imagem
      // devolve um PNG transparente no CDN do Transfermarkt, e o card sairia
      // em branco. A arte da marca é sempre visível.
    }),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      {name: 'Competições', path: '/competicoes'},
      {name: overview.name, path: `/competicoes/${code}`},
    ]),
    ldJson({
      '@context': 'https://schema.org',
      '@type': 'SportsOrganization',
      name: overview.name,
      sport: 'Futebol',
      url,
      logo: leagueLogo(code),
      ...(league ? {location: {'@type': 'Country', name: league.country}} : {}),
    }),
  ];
};

export async function loader({params, request}: Route.LoaderArgs) {
  const rodada =
    Number(new URL(request.url).searchParams.get('rodada')) || null;
  const league = findLeague(params.code) ?? null;
  // o código canônico da lista, e não o da URL: o Transfermarkt diferencia
  // caixa (TDeC ≠ TDEC), então normalizar para maiúsculas quebrava o Peru
  const code = league?.code ?? params.code.toUpperCase();
  const [overview, standings, topPlayers, stats, round] = await Promise.all([
    getLeagueOverview(code).catch(() => null),
    getLeagueStandings(code).catch(() => []),
    getLeagueTopPlayers(code).catch(() => []),
    // estatísticas são complemento: se falharem, a página da liga continua
    getLeagueStats(code).catch(() => ({scorers: [], assists: []})),
    getRoundFixtures(code, rodada).catch(() => null),
  ]);
  if (!overview || overview.clubs.length === 0) {
    throw new Response('Não foi possível carregar esta competição agora.', {
      status: 502,
    });
  }
  const clubsSorted = [...overview.clubs].sort(
    (a, b) =>
      (euroToMillions(b.totalValue) ?? 0) - (euroToMillions(a.totalValue) ?? 0),
  );
  const totalPlayers = overview.clubs.reduce(
    (acc, c) => acc + (parseInt(c.squad, 10) || 0),
    0,
  );
  return {
    code,
    league,
    overview,
    clubsSorted,
    standings,
    topPlayers: topPlayers.slice(0, 10),
    stats,
    round,
    totalValue: sumValues(overview.clubs.map((c) => c.totalValue)),
    totalPlayers,
  };
}

export default function Competicao({loaderData}: Route.ComponentProps) {
  const {
    code,
    league,
    overview,
    clubsSorted,
    standings,
    topPlayers,
    totalValue,
    totalPlayers,
    stats,
    round,
  } = loaderData;

  return (
    <div className="pp-in">
      <BackLink to="/competicoes" label="Competições" />

      <div className="flex items-center gap-4">
        <LeagueLogo
          code={code}
          name={overview.name}
          size={56}
          fallbackColor={league?.color ?? '#0E4632'}
          fallbackShort={league?.short}
        />
        <div>
          <h1 className="font-display text-[24px] leading-tight font-extrabold tracking-tight sm:text-[28px]">
            {overview.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted">
            {league ? `${league.flag} ${league.country}` : 'Temporada'}
            {overview.season ? ` · ${overview.season}` : ''}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <StatTile label="Valor total" value={totalValue} />
        <StatTile label="Clubes" value={String(overview.clubs.length)} />
        <StatTile label="Jogadores" value={String(totalPlayers || '—')} />
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
        {/* min-w-0 obrigatório: sem ele a tabela de artilheiros estica a
            coluna e a página ganha scroll horizontal no mobile */}
        <div className="min-w-0 space-y-10">
          {round?.totalRounds ? (
            <section>
              <SectionTitle
                action={
                  <RoundNav
                    rodada={round}
                    href={(n) => `/competicoes/${code}?rodada=${n}`}
                  />
                }
              >
                Jogos da rodada
              </SectionTitle>
              <RoundFixtures round={round.round} fixtures={round.fixtures} />
            </section>
          ) : null}

          <section>
            <SectionTitle>Clubes mais valiosos</SectionTitle>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {clubsSorted.map((c, i) => (
                <Link
                  key={c.id}
                  to={`/clubes/${c.id}`}
                  className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0 hover:bg-hoverrow"
                >
                  <span className="w-5 text-center text-xs font-bold text-faint tabular-nums">
                    {i + 1}
                  </span>
                  <Crest src={c.crest} name={c.name} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold">{c.name}</div>
                    <div className="text-xs text-faint">
                      {c.squad} jogadores · idade média {c.avgAge || '—'}
                    </div>
                  </div>
                  <span className="text-sm font-extrabold tabular-nums">
                    {c.totalValue}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {standings.length > 0 ? (
            <section>
              <SectionTitle>Classificação</SectionTitle>
              <div className="space-y-6">
                {standings.map((g, gi) => (
                  <div
                    key={gi}
                    className="overflow-hidden rounded-card border border-line bg-card"
                  >
                    {g.title && standings.length > 1 ? (
                      <div className="border-b border-innerline px-4 py-2.5 text-xs font-bold tracking-wide text-muted uppercase">
                        {g.title}
                      </div>
                    ) : null}
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[560px] text-[13px] tabular-nums">
                        <thead>
                          <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                            <th className="px-3 py-2.5 text-center">#</th>
                            <th className="px-3 py-2.5">Clube</th>
                            <th className="px-3 py-2.5 text-center">J</th>
                            <th className="px-3 py-2.5 text-center">V</th>
                            <th className="px-3 py-2.5 text-center">E</th>
                            <th className="px-3 py-2.5 text-center">D</th>
                            <th className="px-3 py-2.5 text-center">Gols</th>
                            <th className="px-3 py-2.5 text-center">+/-</th>
                            <th className="px-3 py-2.5 text-center">Pts</th>
                          </tr>
                        </thead>
                        <tbody>
                          {g.rows.map((r) => (
                            <tr
                              key={`${r.pos}-${r.clubId}`}
                              className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                            >
                              <td className="px-3 py-2.5 text-center font-bold text-muted">
                                {r.pos}
                              </td>
                              <td className="px-3 py-2.5">
                                {r.clubId ? (
                                  <Link
                                    to={`/clubes/${r.clubId}`}
                                    className="flex items-center gap-2 font-semibold hover:text-pitch"
                                  >
                                    <Crest
                                      src={r.crest}
                                      name={r.club}
                                      size={18}
                                    />
                                    {r.club}
                                  </Link>
                                ) : (
                                  r.club
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.played}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.won}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.draw}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.lost}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.goals}
                              </td>
                              <td className="px-3 py-2.5 text-center text-muted">
                                {r.diff}
                              </td>
                              <td className="px-3 py-2.5 text-center font-extrabold">
                                {r.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <StatLeaders
            title="Artilheiros"
            rows={stats.scorers}
            metricLabel="G"
          />
          <StatLeaders
            title="Líderes de assistência"
            rows={stats.assists}
            metricLabel="A"
          />
        </div>

        <aside className="min-w-0 space-y-6">
          {topPlayers.length > 0 ? (
            <section className="rounded-card border border-line bg-card p-4">
              <h2 className="mb-2 font-display text-base font-extrabold tracking-tight">
                Jogadores mais valiosos
              </h2>
              {topPlayers.map((p, i) => (
                <Link
                  key={p.id}
                  to={`/jogadores/${p.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-hoverrow"
                >
                  <span className="w-4 text-center text-xs font-bold text-faint tabular-nums">
                    {i + 1}
                  </span>
                  <Avatar src={p.photo} name={p.name} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold">
                      {p.name}
                    </div>
                    <div className="truncate text-xs text-faint">
                      {p.club?.name} · {p.position}
                    </div>
                  </div>
                  <span className="text-[13px] font-extrabold tabular-nums">
                    {p.value}
                  </span>
                </Link>
              ))}
            </section>
          ) : null}
          <AdSlot />
          <ProCard />
        </aside>
      </div>
    </div>
  );
}
