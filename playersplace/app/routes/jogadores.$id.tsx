import {Link} from 'react-router';
import type {Route} from './+types/jogadores.$id';
import {
  ehSuspensao,
  getClubAbsences,
  getPlayer,
  getPlayerCareer,
  getPlayerInjuries,
  getPlayerGameLog,
  getPlayerMarketValueGraph,
  getPlayerNationalCareer,
  getPlayerPerformance,
  getPlayerStartsBySeason,
  getPlayerTransfers,
} from '~/lib/tm';
import {Avatar, BackLink, SectionTitle} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {Sparkline} from '~/components/Sparkline';
import {PerformancePanel} from '~/components/Performance';
import {PositionsPitch} from '~/components/PositionsPitch';
import {MatchLog} from '~/components/MatchLog';
import {StartsPanel} from '~/components/Starts';
import {InjuryHistory, InjuryStatus} from '~/components/Injuries';
import {Highlights} from '~/components/Highlights';
import {
  CareerByClub,
  CareerTotalsTable,
  NationalTeamCareer,
} from '~/components/CareerPanels';
import {VideoAnalysis} from '~/components/VideoAnalysis';
import {getSponsorVideos} from '~/lib/sponsors';
import {getPlayerHighlight} from '~/lib/youtube';
import {breadcrumbLd, canonical, ldJson, semPontoFinal, seo} from '~/lib/seo';

/** "05/02/1992 (33)" → "1992-02-05"; qualquer outro formato vira null */
function birthDateISO(nascIdade: string | undefined): string | null {
  const m = nascIdade?.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export const meta: Route.MetaFunction = ({data, params}) => {
  const url = canonical(`/jogadores/${data?.id ?? params.id}`);

  if (!data) {
    return seo({
      title: 'Jogador',
      description:
        'Valor de mercado, histórico de valorização, transferências e desempenho por temporada.',
      url,
    });
  }

  const {player} = data;
  const posicao = player.info['Posição']?.split(' - ').pop() ?? null;
  const idade = player.info['Nasc./Idade']?.match(/\((\d+)\)/)?.[1] ?? null;
  const nacionalidade = player.info['Nacionalidade'] ?? null;
  const nascimento = birthDateISO(player.info['Nasc./Idade']);

  const ficha = [posicao, idade ? `${idade} anos` : null, nacionalidade]
    .filter(Boolean)
    .join(', ');
  // parênteses em vez de "do/da": nome de clube não tem gênero previsível
  const clube = player.club ? ` (${player.club.name})` : '';

  return [
    ...seo({
      title: `${player.name} — valor de mercado, estatísticas e transferências`,
      description: `${player.name}${clube}${ficha ? `: ${ficha}` : ''}. Valor de mercado ${semPontoFinal(player.marketValue)}, histórico de valorização, transferências e estatísticas por temporada.`,
      url,
      image: player.photo,
      imageAlt: `Foto de ${player.name}`,
      type: 'profile',
    }),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      ...(player.club
        ? [{name: player.club.name, path: `/clubes/${player.club.id}`}]
        : []),
      {name: player.name, path: `/jogadores/${data.id}`},
    ]),
    ldJson({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: player.name,
      url,
      ...(player.photo ? {image: player.photo} : {}),
      ...(posicao ? {jobTitle: posicao} : {}),
      ...(nacionalidade ? {nationality: nacionalidade} : {}),
      ...(nascimento ? {birthDate: nascimento} : {}),
      ...(player.info['Altura'] ? {height: player.info['Altura']} : {}),
      ...(player.club
        ? {
            memberOf: {
              '@type': 'SportsTeam',
              name: player.club.name,
              sport: 'Futebol',
              url: canonical(`/clubes/${player.club.id}`),
            },
          }
        : {}),
    }),
  ];
};

export async function loader({params, context}: Route.LoaderArgs) {
  const [
    player,
    transfers,
    mv,
    performance,
    career,
    national,
    gameLog,
    starts,
    injuries,
  ] = await Promise.all([
    getPlayer(params.id).catch(() => null),
    getPlayerTransfers(params.id).catch(() => []),
    getPlayerMarketValueGraph(params.id),
    getPlayerPerformance(params.id).catch(() => []),
    getPlayerCareer(params.id).catch(() => null),
    getPlayerNationalCareer(params.id).catch(() => []),
    getPlayerGameLog(params.id).catch(() => null),
    getPlayerStartsBySeason(params.id).catch(() => []),
    getPlayerInjuries(params.id).catch(() => []),
  ]);
  if (!player || !player.name) {
    throw new Response('Não foi possível carregar este jogador agora.', {
      status: 502,
    });
  }

  // A lesão EM CURSO só existe na página de desfalques do clube — é a única
  // com previsão de retorno. Depende do `player`, então vem depois do bloco
  // acima; o cache de 2h é o mesmo que o Fantasy já aquece.
  const [absence, highlight] = await Promise.all([
    player.club
      ? getClubAbsences(player.club.id)
          .then(
            (todos) =>
              todos.find(
                (a) => a.playerId === params.id && !ehSuspensao(a.reason),
              ) ?? null,
          )
          .catch(() => null)
      : Promise.resolve(null),
    // depende do nome, então só pode rodar depois do `player`
    getPlayerHighlight(
      params.id,
      player.name,
      context.env.YOUTUBE_API_KEY,
      player.club?.name,
    ),
  ]);

  // variação percentual entre os dois últimos pontos do histórico
  let delta: number | null = null;
  if (mv && mv.list.length >= 2) {
    const prev = mv.list[mv.list.length - 2].y;
    const curr = mv.list[mv.list.length - 1].y;
    if (prev > 0) delta = ((curr - prev) / prev) * 100;
  }

  const points =
    mv?.list.map((p) => ({
      t: p.x,
      v: p.y,
      label: p.mw,
      date: p.datum_mw,
      club: p.verein,
    })) ?? [];

  return {
    id: params.id,
    player,
    transfers: transfers.slice(0, 14),
    mv,
    points,
    delta,
    performance,
    career,
    national,
    gameLog,
    starts,
    injuries,
    absence,
    highlight,
    videos: getSponsorVideos(params.id),
  };
}

const INFO_KEYS = [
  'Nasc./Idade',
  'Nacionalidade',
  'Altura',
  'Posição',
  'Pé',
  'Clube atual',
  'Contrato até',
  'Empresários',
  'Fornecedor',
];

export default function Jogador({loaderData}: Route.ComponentProps) {
  const {
    id,
    player,
    transfers,
    mv,
    points,
    delta,
    performance,
    career,
    national,
    gameLog,
    starts,
    injuries,
    absence,
    highlight,
    videos,
  } = loaderData;
  const isGoalkeeper = Boolean(player.info['Posição']?.includes('Goleiro'));
  const meta = [
    player.info['Posição']?.split(' - ').pop(),
    player.info['Nasc./Idade']?.match(/\((\d+)\)/)?.[1]
      ? `${player.info['Nasc./Idade'].match(/\((\d+)\)/)?.[1]} anos`
      : null,
    player.info['Nacionalidade'],
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="pp-in">
      <BackLink
        to={player.club ? `/clubes/${player.club.id}` : '/'}
        label={player.club?.name ?? 'Início'}
      />

      <div className="flex items-center gap-4">
        <Avatar src={player.photo} name={player.name} size={76} />
        <div className="min-w-0">
          <h1 className="font-display text-[24px] leading-tight font-extrabold tracking-tight sm:text-[28px]">
            {player.name}{' '}
            {player.number ? (
              <span className="align-middle text-base font-bold text-faint">
                {player.number}
              </span>
            ) : null}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {player.club ? (
              <Link
                to={`/clubes/${player.club.id}`}
                className="font-semibold text-pitch hover:text-linkhover"
              >
                {player.club.name}
              </Link>
            ) : null}
            {meta ? (player.club ? ` · ${meta}` : meta) : ''}
          </p>
        </div>
        <Link
          to={`/comparar?p=${id}`}
          className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-[13px] font-semibold text-muted hover:bg-hoverrow sm:px-4"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 4v16M15 4v16M4 9h5M15 15h5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
          Comparar
        </Link>
      </div>

      {/* logo abaixo do nome: estar fora por lesão é a primeira coisa que quem
          abre a página do jogador precisa saber */}
      <InjuryStatus absence={absence} />

      {/* min-w-0 nas colunas: sem isso o min-content das tabelas largas
          estica o grid e a página inteira rola na horizontal no celular */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          <section className="rounded-card bg-pitch p-5 text-white">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
                  Valor de mercado
                </div>
                <div className="mt-1 font-display text-[36px] leading-none font-extrabold tracking-tight tabular-nums">
                  {mv?.current ?? player.marketValue ?? '—'}
                </div>
              </div>
              {delta !== null && Math.abs(delta) >= 0.1 ? (
                <span
                  className={`rounded-md px-2 py-1 text-xs font-bold tabular-nums ${
                    delta > 0 ? 'bg-lime/15 text-lime' : 'bg-white/10 text-[#F8B4A8]'
                  }`}
                >
                  {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}% vs. anterior
                </span>
              ) : null}
            </div>
            {points.length >= 2 ? (
              <div className="mt-4">
                <Sparkline points={points} />
              </div>
            ) : null}
            {mv ? (
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/60">
                <span>
                  Mais alto: <strong className="text-white/90">{mv.highest}</strong>{' '}
                  ({mv.highest_date})
                </span>
                <span>Última alteração: {mv.last_change}</span>
              </div>
            ) : null}
          </section>

          {performance.length > 0 ? (
            <PerformancePanel
              seasons={performance}
              isGoalkeeper={isGoalkeeper}
            />
          ) : null}

          {starts.length > 0 ? <StartsPanel rows={starts} /> : null}

          <InjuryHistory rows={injuries} />

          {gameLog?.seasons.length ? (
            <MatchLog seasons={gameLog.seasons} />
          ) : null}

          {career ? (
            <CareerTotalsTable career={career} isGoalkeeper={isGoalkeeper} />
          ) : null}

          <Highlights video={highlight} playerName={player.name} />

          <VideoAnalysis videos={videos} />

          {transfers.length > 0 ? (
            <section>
              <SectionTitle>Histórico de transferências</SectionTitle>
              <div className="overflow-hidden rounded-card border border-line bg-card">
                {transfers.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0"
                  >
                    <div className="w-12 shrink-0">
                      <div className="text-xs font-bold tabular-nums">{t.season}</div>
                      <div className="text-[10px] text-faint tabular-nums">{t.date}</div>
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-xs">
                      {t.from['clubEmblem-1x'] ? (
                        <img
                          src={t.from['clubEmblem-1x']}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-4 w-4 object-contain"
                        />
                      ) : null}
                      <span className="max-w-[110px] truncate text-muted">
                        {t.from.clubName}
                      </span>
                      <span className="text-faint">→</span>
                      {t.to['clubEmblem-1x'] ? (
                        <img
                          src={t.to['clubEmblem-1x']}
                          alt=""
                          referrerPolicy="no-referrer"
                          className="h-4 w-4 object-contain"
                        />
                      ) : null}
                      <span className="max-w-[110px] truncate font-semibold text-ink">
                        {t.to.clubName}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[13px] font-extrabold tabular-nums">
                        {t.fee || '—'}
                      </div>
                      {t.marketValue ? (
                        <div className="text-[10px] text-faint tabular-nums">
                          VDM {t.marketValue}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-card border border-line bg-card p-4">
            <h2 className="mb-3 font-display text-base font-extrabold tracking-tight">
              Ficha
            </h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {INFO_KEYS.filter((k) => player.info[k]).map((k) => (
                <div key={k}>
                  <dt className="text-[10px] font-bold tracking-wide text-faint uppercase">
                    {k}
                  </dt>
                  <dd className="mt-0.5 text-[13px] font-semibold">
                    {player.info[k]}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {gameLog?.positions.length ? (
            <PositionsPitch
              positions={gameLog.positions}
              isGoalkeeper={isGoalkeeper}
            />
          ) : null}

          <AdSlot />

          {career?.clubs.length ? <CareerByClub rows={career.clubs} /> : null}

          {national.length > 0 ? <NationalTeamCareer rows={national} /> : null}

          <ProCard />
        </aside>
      </div>
    </div>
  );
}
