import {Suspense} from 'react';
import {Await, Link} from 'react-router';
import type {Route} from './+types/clubes.$id';
import {findLeague} from '~/lib/tm/leagues';
import {getClubRegistro, getClubForm, getClubTransfers} from '~/lib/tm';
import {emSegundoPlano} from '~/lib/tm/client';
import {getDb} from '~/lib/db';
import {gravarElencoBase} from '~/lib/jogadores.server';
import {euroToMillions, rotuloAtualizacao} from '~/lib/format';
import {
  Avatar,
  BackLink,
  Crest,
  SectionTitle,
  Skeleton,
  SkeletonLista,
  StatTile,
} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ClubSignings} from '~/components/ClubSignings';
import {ClubFormSection} from '~/components/ClubForm';
import {ProCard} from '~/components/ProCard';
import {breadcrumbLd, canonical, ldJson, semPontoFinal, seo} from '~/lib/seo';

export const meta: Route.MetaFunction = ({data, params}) => {
  // ?temporada= é um recorte das contratações dentro da mesma página do clube
  const url = canonical(`/clubes/${data?.id ?? params.id}`);

  if (!data) {
    return seo({
      title: 'Clube',
      description:
        'Elenco completo, valores de mercado, contratações e calendário do clube.',
      url,
    });
  }

  const {club, league, avgAge} = data;
  // parênteses em vez de "da/do": nome de competição não tem gênero previsível
  const naLiga = club.league ? ` (${club.league.name})` : '';

  return [
    ...seo({
      title: `${club.name} — elenco, valores de mercado e contratações`,
      description: `${club.name}${naLiga}: elenco com ${club.players.length} jogadores, ${semPontoFinal(club.totalValue)} em valor de mercado e média de idade de ${avgAge} anos. Contratações, calendário e resultados.`,
      url,
      image: club.crest,
      imageAlt: `Escudo do ${club.name}`,
    }),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      {name: 'Competições', path: '/competicoes'},
      ...(club.league
        ? [{name: club.league.name, path: `/competicoes/${club.league.code}`}]
        : []),
      {name: club.name, path: `/clubes/${data.id}`},
    ]),
    ldJson({
      '@context': 'https://schema.org',
      '@type': 'SportsTeam',
      name: club.name,
      sport: 'Futebol',
      url,
      ...(club.crest ? {logo: club.crest} : {}),
      ...(club.league
        ? {
            memberOf: {
              '@type': 'SportsOrganization',
              name: club.league.name,
              url: canonical(`/competicoes/${club.league.code}`),
            },
          }
        : {}),
      ...(league ? {location: {'@type': 'Country', name: league.country}} : {}),
      // o elenco em `athlete` é o que liga a entidade do clube às páginas
      // dos jogadores para o robô — 30 é folga suficiente para qualquer elenco
      athlete: club.players.slice(0, 30).map((p) => ({
        '@type': 'Person',
        name: p.name,
        url: canonical(`/jogadores/${p.id}`),
      })),
    }),
  ];
};

export async function loader({params, request, context}: Route.LoaderArgs) {
  const season = new URL(request.url).searchParams.get('temporada');

  // as três partem juntas; só o elenco é esperado, porque é dele que saem o
  // título, o valor total e a tabela — o resto desce em streaming
  const transfers = getClubTransfers(
    params.id,
    /^\d+$/.test(season ?? '') ? season : null,
  ).catch(() => null);
  // os jogos são complemento: se a origem falhar, a página do clube continua
  const form = getClubForm(params.id).catch(() => ({last: [], next: []}));

  const registro = await getClubRegistro(params.id).catch(() => null);
  const club = registro?.valor;
  // 502 só quando não há cópia salva em nenhuma camada E a origem falhou
  if (!club || !club.name) {
    throw new Response('Não foi possível carregar este clube agora.', {
      status: 502,
    });
  }
  const league = club.league ? (findLeague(club.league.code) ?? null) : null;

  // Alimenta a base de jogadores com o elenco que acabamos de ler. Sai de
  // graça — o dado já está aqui — e é o que mantém a `jogadores_base` viva
  // para clubes fora do aquecimento diário, ou se o job parar de rodar.
  emSegundoPlano(
    gravarElencoBase(getDb(context.env), {
      clubeId: params.id,
      ligaCode: club.league?.code ?? null,
      club,
    }),
  );

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
    atualizadoEm: registro.fresco ? null : rotuloAtualizacao(registro.salvoEm),
    league,
    avgAge,
    foreigners,
    highlights,
    transfers,
    form,
  };
}

export default function Clube({loaderData}: Route.ComponentProps) {
  const {
    id,
    club,
    atualizadoEm,
    league,
    avgAge,
    foreigners,
    highlights,
    transfers,
    form,
  } = loaderData;

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
        {/* o rótulo diz a verdade sobre a idade do dado: quando a origem não
            respondeu, esta página está servindo a cópia guardada */}
        <div className="mt-2 text-xs text-white/60">
          fonte: Transfermarkt ·{' '}
          {atualizadoEm ? `dados de ${atualizadoEm}` : 'atualizado hoje'}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Jogadores" value={String(club.players.length)} />
        <StatTile label="Idade média" value={avgAge} />
        <StatTile
          label="Estrangeiros"
          value={foreigners === null ? '—' : String(foreigners)}
        />
        {/* o único número que não sai do elenco: espera a raspagem das
            contratações, então mostra uma barra no lugar do valor */}
        <Suspense fallback={<StatTileCarregando label="Contratações" />}>
          <Await resolve={transfers}>
            {(t) => (
              <StatTile
                label={`Contratações ${t?.seasonLabel ?? ''}`.trim()}
                value={
                  t
                    ? String(
                        t.arrivals.filter((a) => a.kind !== 'retorno').length,
                      )
                    : '—'
                }
              />
            )}
          </Await>
        </Suspense>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {/* os dois blocos de jogos vêm da mesma raspagem, então dividem um
              `Suspense` só: separá-los faria um aparecer sozinho e a coluna
              pular duas vezes em vez de uma */}
          <Suspense
            fallback={
              <>
                <SkeletonLista titulo="Últimos jogos" linhas={5} />
                <SkeletonLista titulo="Próximos jogos" linhas={3} />
              </>
            }
          >
            <Await resolve={form}>
              {(f) => (
                <>
                  <ClubFormSection
                    title="Últimos jogos"
                    matches={f.last}
                    empty="Nenhum jogo disputado encontrado para este clube."
                  />
                  <ClubFormSection
                    title="Próximos jogos"
                    matches={f.next}
                    empty="Nenhum jogo futuro agendado no momento."
                  />
                </>
              )}
            </Await>
          </Suspense>

          <Suspense
            fallback={<SkeletonLista titulo="Contratações" linhas={4} />}
          >
            <Await resolve={transfers}>
              {(t) => (t ? <ClubSignings clubId={id} transfers={t} /> : null)}
            </Await>
          </Suspense>

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

/**
 * Um `StatTile` com o rótulo real e o número ainda em esqueleto.
 *
 * Mantém a mesma caixa e a mesma altura do valor final, para o bloco de quatro
 * números não reflowar quando o último chegar.
 */
function StatTileCarregando({label}: {label: string}) {
  return (
    <div
      className="rounded-card border border-line bg-card px-4 py-3"
      role="status"
      aria-busy="true"
    >
      <div className="text-[10px] font-bold tracking-[0.12em] text-faint uppercase">
        {label}
      </div>
      <span className="sr-only">Carregando {label.toLowerCase()}…</span>
      <div className="mt-1 flex h-7 items-center">
        <Skeleton className="h-5 w-10" />
      </div>
    </div>
  );
}
