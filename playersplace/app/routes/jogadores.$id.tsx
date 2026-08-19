/**
 * Página do jogador.
 *
 * O QUE MUDOU E POR QUÊ
 *
 * Antes o loader fazia `await Promise.all` de nove raspagens e só então
 * renderizava: a página inteira esperava pelo painel mais lento, e enquanto
 * isso o visitante via o véu de carregamento cobrindo tudo. Nada aparecia até
 * tudo estar pronto.
 *
 * Agora o loader espera UMA coisa: a linha do jogador em `jogadores_base`
 * (~30 ms, consulta por chave primária — ver `lib/jogadores.server.ts`). Com
 * ela dá para pintar o cabeçalho, o valor de mercado e a barra de dados na
 * primeira leva de HTML. As nove raspagens continuam partindo juntas, mas vão
 * para o cliente como promessas: cada painel desce quando fica pronto, dentro
 * do seu próprio `<Suspense>`, e mostra um esqueleto do tamanho certo até lá.
 *
 * A base cobre Série A e Série B. Fora dela — ou com a base fria — o loader
 * cai no caminho antigo: espera a ficha do Transfermarkt e segue igual. É por
 * isso que `topo` existe: ela normaliza as duas origens numa forma só, e o
 * componente não precisa saber de qual das duas veio.
 */
import {Suspense} from 'react';
import {Await, Link} from 'react-router';
import type {Route} from './+types/jogadores.$id';
import {
  ehSuspensao,
  getClubAbsences,
  getPlayerRegistro,
  getPlayerCareer,
  getPlayerConcededAsStarter,
  getPlayerGoalKinds,
  getPlayerInjuries,
  getPlayerGameLog,
  getPlayerMarketValueGraph,
  getPlayerNationalCareer,
  getPlayerPerformance,
  getPlayerStartsBySeason,
  getPlayerTransfers,
  setorDaPosicao,
  type PlayerProfile,
} from '~/lib/tm';
import {getDb} from '~/lib/db';
import {lerJogadorBase, type JogadorBase} from '~/lib/jogadores.server';
import {
  Avatar,
  BackLink,
  DadosSalvos,
  SecaoIndisponivel,
  SectionTitle,
  Skeleton,
  SkeletonBloco,
  SkeletonCartao,
  SkeletonLista,
  SkeletonTabela,
} from '~/components/ui';
import {rotuloAtualizacao} from '~/lib/format';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {Sparkline} from '~/components/Sparkline';
import {PerformancePanel} from '~/components/Performance';
import {PositionsPitch} from '~/components/PositionsPitch';
import {MatchLog} from '~/components/MatchLog';
import {StartsPanel} from '~/components/Starts';
import {ConcededPanel} from '~/components/Conceded';
import {GoalKindsPanel} from '~/components/GoalKinds';
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

/**
 * A parte da página que sai na primeira leva de HTML, vinda da base ou da
 * ficha raspada — o componente e o `meta()` só conhecem esta forma.
 */
interface Topo {
  nome: string;
  foto: string | null;
  numero: string;
  posicao: string;
  idade: number | null;
  nacionalidade: string;
  nascimento: string | null;
  valor: string;
  clube: {id: string; nome: string} | null;
  goleiro: boolean;
  /**
   * Zagueiro, lateral ou líbero. Decide o painel de gols sofridos: para um
   * atacante o mesmo número existe e não descreve nada.
   */
  defensor: boolean;
  /**
   * Centroavante, ponta ou segundo-atacante. Decide o painel de tipos de gol:
   * a distribuição só descreve alguém com gols o bastante para ter uma, e é
   * do atacante que se espera saber o repertório.
   */
  atacante: boolean;
}

function topoDaBase(b: JogadorBase): Topo {
  return {
    nome: b.nome,
    foto: b.foto,
    numero: b.numero,
    posicao: b.posicao,
    idade: b.idade,
    nacionalidade: b.nacionalidade,
    nascimento: b.nascimento || null,
    valor: b.valor,
    clube: b.clube ? {id: b.clube.id, nome: b.clube.nome} : null,
    goleiro: b.posicao.includes('Goleiro'),
    defensor: setorDaPosicao(b.posicao) === 'DEF',
    atacante: setorDaPosicao(b.posicao) === 'ATA',
  };
}

function topoDoPerfil(p: PlayerProfile): Topo {
  const nascIdade = p.info['Nasc./Idade'];
  const idade = Number(nascIdade?.match(/\((\d+)\)/)?.[1]);
  const posicao = p.info['Posição']?.split(' - ').pop() ?? '';
  return {
    nome: p.name,
    foto: p.photo,
    numero: p.number,
    posicao,
    idade: Number.isFinite(idade) ? idade : null,
    nacionalidade: p.info['Nacionalidade'] ?? '',
    nascimento: nascIdade ?? null,
    valor: p.marketValue,
    clube: p.club ? {id: p.club.id, nome: p.club.name} : null,
    goleiro: Boolean(p.info['Posição']?.includes('Goleiro')),
    defensor: setorDaPosicao(posicao) === 'DEF',
    atacante: setorDaPosicao(posicao) === 'ATA',
  };
}

/**
 * Depois disto o aviso "dados de …" aparece.
 *
 * O aquecimento roda todo dia, então uma linha com menos de 24 h é
 * simplesmente a linha de hoje — carimbar "dados de ontem às 06h" nela seria
 * ruído constante em toda página do Brasileirão.
 */
const AVISAR_BASE_APOS = 24 * 3600 * 1000;

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

  const {topo} = data;
  const nascimento = birthDateISO(topo.nascimento ?? undefined);

  const ficha = [
    topo.posicao || null,
    topo.idade ? `${topo.idade} anos` : null,
    topo.nacionalidade || null,
  ]
    .filter(Boolean)
    .join(', ');
  // parênteses em vez de "do/da": nome de clube não tem gênero previsível
  const clube = topo.clube ? ` (${topo.clube.nome})` : '';

  return [
    ...seo({
      title: `${topo.nome} — valor de mercado, estatísticas e transferências`,
      description: `${topo.nome}${clube}${ficha ? `: ${ficha}` : ''}. Valor de mercado ${semPontoFinal(topo.valor)}, histórico de valorização, transferências e estatísticas por temporada.`,
      url,
      image: topo.foto,
      imageAlt: `Foto de ${topo.nome}`,
      type: 'profile',
    }),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      ...(topo.clube
        ? [{name: topo.clube.nome, path: `/clubes/${topo.clube.id}`}]
        : []),
      {name: topo.nome, path: `/jogadores/${data.id}`},
    ]),
    ldJson({
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: topo.nome,
      url,
      ...(topo.foto ? {image: topo.foto} : {}),
      ...(topo.posicao ? {jobTitle: topo.posicao} : {}),
      ...(topo.nacionalidade ? {nationality: topo.nacionalidade} : {}),
      ...(nascimento ? {birthDate: nascimento} : {}),
      ...(topo.clube
        ? {
            memberOf: {
              '@type': 'SportsTeam',
              name: topo.clube.nome,
              sport: 'Futebol',
              url: canonical(`/clubes/${topo.clube.id}`),
            },
          }
        : {}),
    }),
  ];
};

export async function loader({params, context}: Route.LoaderArgs) {
  const id = params.id;

  // Todas as raspagens partem AGORA, juntas, como antes. A diferença é que o
  // loader espera no máximo uma delas: as outras viram promessas no payload e
  // o React Router as entrega por streaming conforme resolvem.
  //
  // O `.catch()` em cada uma não é opcional: promessa rejeitada sem tratamento
  // atravessa o streaming e derruba a rota inteira, em vez de esvaziar só o
  // painel que falhou.
  //
  // E ELE PRECISA SER O ÚLTIMO ELO DA CORRENTE. Aqui o `.catch()` vinha ANTES
  // do `.then()`, o que só protege a raspagem: se a transformação seguinte
  // lançasse, a promessa resultante rejeitava sem ninguém escutando — e o
  // estrago era o pior possível, porque acontece DEPOIS que o HTML começou a
  // ser enviado. Com os cabeçalhos já na rede, não dá para trocar o status:
  // o React Router renderiza o ErrorBoundary da rota no cliente e a página que
  // o visitante já estava lendo é substituída por um 500.
  const fichaPromise = getPlayerRegistro(id).catch(() => null);
  const transfersPromise = getPlayerTransfers(id)
    .then((t) => t.slice(0, 14))
    .catch(() => []);
  const performancePromise = getPlayerPerformance(id).catch(() => []);
  const careerPromise = getPlayerCareer(id).catch(() => null);
  const nationalPromise = getPlayerNationalCareer(id).catch(() => []);
  const gameLogPromise = getPlayerGameLog(id).catch(() => null);
  const startsPromise = getPlayerStartsBySeason(id).catch(() => []);
  const injuriesPromise = getPlayerInjuries(id).catch(() => []);

  // o gráfico e os números derivados dele viajam juntos: a conta é do
  // servidor, e mandar `list` cru obrigaria o componente a refazê-la
  const mvPromise = getPlayerMarketValueGraph(id)
    .then((mv) => {
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
      return {mv, points, delta};
    })
    // por último, e cobrindo a conta acima também: a forma devolvida é a mesma
    // que o painel espera, então ele cai no número da base sem saber de nada
    .catch(() => ({mv: null, points: [], delta: null}));

  // ÚNICO await do caminho feliz
  const base = await lerJogadorBase(getDb(context.env), id);

  // fora do Brasileirão (ou com a base fria) não há atalho: esperar a ficha é
  // o caminho antigo, e continua valendo
  const fichaAgora = base ? null : await fichaPromise;
  if (!base && !fichaAgora?.valor?.name) {
    // 502 só quando não há cópia em nenhuma das camadas de cache E a origem
    // também falhou — com o jogador já visto alguma vez, a página abre mesmo
    // com o Transfermarkt fora do ar
    throw new Response('Não foi possível carregar este jogador agora.', {
      status: 502,
    });
  }

  const topo = base
    ? topoDaBase(base)
    : topoDoPerfil(fichaAgora!.valor as PlayerProfile);

  const atualizadoEm = base
    ? Date.now() - base.atualizadoEm > AVISAR_BASE_APOS
      ? rotuloAtualizacao(base.atualizadoEm)
      : null
    : fichaAgora!.fresco
      ? null
      : rotuloAtualizacao(fichaAgora!.salvoEm);

  // dependem do clube, que agora vem do `topo` — então não precisam mais
  // esperar a ficha para começar
  const absencePromise = topo.clube
    ? getClubAbsences(topo.clube.id)
        .then(
          (todos) =>
            todos.find((a) => a.playerId === id && !ehSuspensao(a.reason)) ??
            null,
        )
        .catch(() => null)
    : Promise.resolve(null);

  // só para defensores, e por isso depois do `topo`: o agregado tem chave de
  // cache própria, e calculá-lo para um atacante gravaria uma linha que
  // nenhuma página vai ler. Sair aqui não atrasa nada — a resposta bruta é a
  // mesma da súmula de jogos, que já partiu lá em cima
  const concededPromise = topo.defensor
    ? getPlayerConcededAsStarter(id).catch(() => [])
    : Promise.resolve([]);

  // espelho do de cima, e pela mesma razão: a página de todos os gols é uma
  // raspagem própria (a maior da rota — o Messi passa de 1 MB de HTML), e
  // pedi-la para um zagueiro seria pagar por uma tabela que ninguém abre
  const goalKindsPromise = topo.atacante
    ? getPlayerGoalKinds(id).catch(() => null)
    : Promise.resolve(null);

  const highlightPromise = getPlayerHighlight(
    id,
    topo.nome,
    context.env.YOUTUBE_API_KEY,
    topo.clube?.nome,
  ).catch(() => null);

  return {
    id,
    topo,
    atualizadoEm,
    videos: getSponsorVideos(id),
    // daqui para baixo, tudo desce em streaming
    ficha: fichaPromise,
    transfers: transfersPromise,
    valorizacao: mvPromise,
    performance: performancePromise,
    career: careerPromise,
    national: nationalPromise,
    gameLog: gameLogPromise,
    starts: startsPromise,
    conceded: concededPromise,
    goalKinds: goalKindsPromise,
    injuries: injuriesPromise,
    absence: absencePromise,
    highlight: highlightPromise,
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
    topo,
    atualizadoEm,
    videos,
    ficha,
    transfers,
    valorizacao,
    performance,
    career,
    national,
    gameLog,
    starts,
    conceded,
    goalKinds,
    injuries,
    absence,
    highlight,
  } = loaderData;

  const meta = [
    topo.posicao || null,
    topo.idade ? `${topo.idade} anos` : null,
    topo.nacionalidade || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="pp-in">
      <BackLink
        to={topo.clube ? `/clubes/${topo.clube.id}` : '/'}
        label={topo.clube?.nome ?? 'Início'}
      />

      <div className="flex items-center gap-4">
        <Avatar src={topo.foto} name={topo.nome} size={76} />
        <div className="min-w-0">
          <h1 className="font-display text-[24px] leading-tight font-extrabold tracking-tight sm:text-[28px]">
            {topo.nome}{' '}
            {topo.numero ? (
              <span className="align-middle text-base font-bold text-faint">
                {topo.numero}
              </span>
            ) : null}
          </h1>
          <p className="mt-0.5 truncate text-sm text-muted">
            {topo.clube ? (
              <Link
                to={`/clubes/${topo.clube.id}`}
                className="font-semibold text-pitch hover:text-linkhover"
              >
                {topo.clube.nome}
              </Link>
            ) : null}
            {meta ? (topo.clube ? ` · ${meta}` : meta) : ''}
          </p>
        </div>
        <Link
          to={`/comparar?p=${id}`}
          className="ml-auto flex h-9 shrink-0 items-center gap-2 rounded-full border border-line bg-card px-3 text-[13px] font-semibold text-muted hover:bg-hoverrow sm:px-4"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
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

      <DadosSalvos em={atualizadoEm} />

      {/* Estar fora por lesão é a primeira coisa que quem abre a página precisa
          saber, mas o dado vem da página de desfalques do clube — outra
          raspagem. Sem fallback de propósito: um esqueleto aqui reservaria
          espaço para um aviso que, na maioria das vezes, não existe. */}
      <Suspense fallback={null}>
        {/* Fragmento vazio, e não `SecaoIndisponivel`: este bloco é um aviso
            que na maioria das páginas não existe. Anunciar "não consegui
            carregar o aviso de lesão" cria preocupação onde provavelmente não
            havia nada a dizer. O que ele não pode fazer é derrubar a página —
            e é disso que o errorElement cuida. */}
        <Await resolve={absence} errorElement={<></>}>
          {(a) => <InjuryStatus absence={a} />}
        </Await>
      </Suspense>

      {/* min-w-0 nas colunas: sem isso o min-content das tabelas largas
          estica o grid e a página inteira rola na horizontal no celular */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-10">
          {/* O número grande já está na base, então este bloco nunca fica em
              esqueleto: só o gráfico e as legendas entram depois. */}
          <section className="rounded-card bg-pitch p-5 text-white">
            <Suspense fallback={<ValorDeMercado valor={topo.valor} />}>
              {/* Mesmo componente do fallback: o número grande vem da base e
                  continua correto sem o gráfico. Uma mensagem de erro aqui
                  esconderia o dado principal, que não falhou. */}
              <Await
                resolve={valorizacao}
                errorElement={<ValorDeMercado valor={topo.valor} />}
              >
                {({mv, points, delta}) => (
                  <ValorDeMercado
                    valor={mv?.current ?? topo.valor}
                    delta={delta}
                    points={points}
                    mv={mv}
                  />
                )}
              </Await>
            </Suspense>
          </section>

          <Suspense
            fallback={
              <SkeletonTabela titulo="Desempenho" linhas={5} colunas={7} />
            }
          >
            <Await
              resolve={performance}
              errorElement={<SecaoIndisponivel titulo="Desempenho" />}
            >
              {(seasons) =>
                seasons.length > 0 ? (
                  <PerformancePanel
                    seasons={seasons}
                    isGoalkeeper={topo.goleiro}
                  />
                ) : null
              }
            </Await>
          </Suspense>

          <Suspense
            fallback={
              <SkeletonTabela titulo="Titularidades" linhas={4} colunas={4} />
            }
          >
            <Await
              resolve={starts}
              errorElement={<SecaoIndisponivel titulo="Titularidades" />}
            >
              {(rows) => (rows.length > 0 ? <StartsPanel rows={rows} /> : null)}
            </Await>
          </Suspense>

          {topo.defensor ? (
            <Suspense
              fallback={
                <SkeletonTabela
                  titulo="Gols sofridos como titular"
                  linhas={4}
                  colunas={7}
                />
              }
            >
              <Await
                resolve={conceded}
                errorElement={
                  <SecaoIndisponivel titulo="Gols sofridos como titular" />
                }
              >
                {(rows) =>
                  rows.length > 0 ? <ConcededPanel rows={rows} /> : null
                }
              </Await>
            </Suspense>
          ) : null}

          {topo.atacante ? (
            <Suspense
              fallback={
                <SkeletonTabela
                  titulo="Como ele faz os gols"
                  linhas={4}
                  colunas={8}
                />
              }
            >
              <Await
                resolve={goalKinds}
                errorElement={
                  <SecaoIndisponivel titulo="Como ele faz os gols" />
                }
              >
                {(data) => (data ? <GoalKindsPanel data={data} /> : null)}
              </Await>
            </Suspense>
          ) : null}

          <Suspense
            fallback={
              <SkeletonTabela
                titulo="Histórico de lesões"
                linhas={4}
                colunas={4}
              />
            }
          >
            <Await
              resolve={injuries}
              errorElement={<SecaoIndisponivel titulo="Histórico de lesões" />}
            >
              {(rows) => <InjuryHistory rows={rows} />}
            </Await>
          </Suspense>

          <Suspense
            fallback={<SkeletonTabela titulo="Jogos" linhas={8} colunas={6} />}
          >
            <Await
              resolve={gameLog}
              errorElement={<SecaoIndisponivel titulo="Jogos" />}
            >
              {(log) =>
                log?.seasons.length ? <MatchLog seasons={log.seasons} /> : null
              }
            </Await>
          </Suspense>

          <Suspense
            fallback={
              <SkeletonTabela titulo="Carreira" linhas={4} colunas={6} />
            }
          >
            <Await
              resolve={career}
              errorElement={<SecaoIndisponivel titulo="Carreira" />}
            >
              {(c) =>
                c ? (
                  <CareerTotalsTable career={c} isGoalkeeper={topo.goleiro} />
                ) : null
              }
            </Await>
          </Suspense>

          <Suspense
            fallback={
              <SkeletonBloco titulo="Melhores momentos" altura="h-56" />
            }
          >
            <Await
              resolve={highlight}
              errorElement={<Highlights video={null} playerName={topo.nome} />}
            >
              {(v) => <Highlights video={v} playerName={topo.nome} />}
            </Await>
          </Suspense>

          <VideoAnalysis videos={videos} />

          <Suspense
            fallback={
              <SkeletonLista titulo="Histórico de transferências" linhas={5} />
            }
          >
            <Await
              resolve={transfers}
              errorElement={
                <SecaoIndisponivel titulo="Histórico de transferências" />
              }
            >
              {(rows) =>
                rows.length > 0 ? <Transferencias rows={rows} /> : null
              }
            </Await>
          </Suspense>
        </div>

        <aside className="min-w-0 space-y-6">
          {/* A ficha completa (altura, pé, contrato, empresários) só existe na
              página do jogador no Transfermarkt — a base não a tem. O que a
              base tem já preenche o esqueleto abaixo com dado de verdade. */}
          <Suspense fallback={<FichaParcial topo={topo} />}>
            <Await resolve={ficha} errorElement={<FichaParcial topo={topo} />}>
              {(registro) =>
                registro?.valor ? (
                  <Ficha info={registro.valor.info} />
                ) : (
                  <FichaParcial topo={topo} />
                )
              }
            </Await>
          </Suspense>

          <Suspense fallback={<SkeletonCartao titulo="Posições" linhas={3} />}>
            <Await
              resolve={gameLog}
              errorElement={<SecaoIndisponivel titulo="Posições" />}
            >
              {(log) =>
                log?.positions.length ? (
                  <PositionsPitch
                    positions={log.positions}
                    isGoalkeeper={topo.goleiro}
                  />
                ) : null
              }
            </Await>
          </Suspense>

          <AdSlot />

          <Suspense
            fallback={<SkeletonCartao titulo="Carreira por clube" linhas={4} />}
          >
            <Await
              resolve={career}
              errorElement={<SecaoIndisponivel titulo="Carreira por clube" />}
            >
              {(c) =>
                c?.clubs.length ? <CareerByClub rows={c.clubs} /> : null
              }
            </Await>
          </Suspense>

          <Suspense fallback={<SkeletonCartao titulo="Seleção" linhas={3} />}>
            <Await
              resolve={national}
              errorElement={<SecaoIndisponivel titulo="Seleção" />}
            >
              {(rows) =>
                rows.length > 0 ? <NationalTeamCareer rows={rows} /> : null
              }
            </Await>
          </Suspense>

          <ProCard />
        </aside>
      </div>
    </div>
  );
}

/**
 * O painel de valor de mercado, com e sem o histórico.
 *
 * É o mesmo componente nos dois estados de propósito: o número grande vem da
 * base e não muda quando o gráfico chega, então usar um esqueleto aqui
 * esconderia a informação principal para depois revelá-la igual.
 */
function ValorDeMercado({
  valor,
  delta = null,
  points,
  mv,
}: {
  valor: string;
  delta?: number | null;
  points?: React.ComponentProps<typeof Sparkline>['points'];
  mv?: {highest: string; highest_date: string; last_change: string} | null;
}) {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
            Valor de mercado
          </div>
          <div className="mt-1 font-display text-[36px] leading-none font-extrabold tracking-tight tabular-nums">
            {valor || '—'}
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

      {points ? (
        points.length >= 2 ? (
          <div className="mt-4">
            <Sparkline points={points} />
          </div>
        ) : null
      ) : (
        // altura do Sparkline, para o gráfico não empurrar a página ao chegar
        <div
          className="pp-pulse mt-4 h-[72px] rounded-lg bg-white/10"
          aria-hidden
        />
      )}

      {mv ? (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/60">
          <span>
            Mais alto: <strong className="text-white/90">{mv.highest}</strong> (
            {mv.highest_date})
          </span>
          <span>Última alteração: {mv.last_change}</span>
        </div>
      ) : points ? null : (
        <div className="mt-3 flex gap-5" aria-hidden>
          <div className="pp-pulse h-3 w-40 rounded bg-white/10" />
          <div className="pp-pulse h-3 w-32 rounded bg-white/10" />
        </div>
      )}
    </>
  );
}

function Ficha({info}: {info: Record<string, string>}) {
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <h2 className="mb-3 font-display text-base font-extrabold tracking-tight">
        Ficha
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {INFO_KEYS.filter((k) => info[k]).map((k) => (
          <div key={k}>
            <dt className="text-[10px] font-bold tracking-wide text-faint uppercase">
              {k}
            </dt>
            <dd className="mt-0.5 text-[13px] font-semibold">{info[k]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * A ficha montada só com o que a base tem, enquanto a completa não chega.
 *
 * Preenche as linhas conhecidas com dado real e deixa as demais em esqueleto —
 * melhor do que um cartão inteiro cinza, e a altura já é aproximadamente a
 * final, então a troca não empurra a coluna.
 */
function FichaParcial({topo}: {topo: Topo}) {
  const conhecidos: [string, string][] = [
    ['Nasc./Idade', topo.nascimento ?? ''],
    ['Nacionalidade', topo.nacionalidade],
    ['Posição', topo.posicao],
    ['Clube atual', topo.clube?.nome ?? ''],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <section
      className="rounded-card border border-line bg-card p-4"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <h2 className="mb-3 font-display text-base font-extrabold tracking-tight">
        Ficha
      </h2>
      <span className="sr-only">Carregando ficha completa…</span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {conhecidos.map(([k, v]) => (
          <div key={k}>
            <dt className="text-[10px] font-bold tracking-wide text-faint uppercase">
              {k}
            </dt>
            <dd className="mt-0.5 text-[13px] font-semibold">{v}</dd>
          </div>
        ))}
        {['Altura', 'Pé', 'Contrato até', 'Empresários'].map((k) => (
          <div key={k}>
            <dt className="text-[10px] font-bold tracking-wide text-faint uppercase">
              {k}
            </dt>
            <dd className="mt-1">
              <Skeleton className="h-3.5 w-4/5" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Transferencias({
  rows,
}: {
  rows: Awaited<ReturnType<typeof getPlayerTransfers>>;
}) {
  return (
    <section>
      <SectionTitle>Histórico de transferências</SectionTitle>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {rows.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0"
          >
            <div className="w-12 shrink-0">
              <div className="text-xs font-bold tabular-nums">{t.season}</div>
              <div className="text-[10px] text-faint tabular-nums">
                {t.date}
              </div>
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
  );
}
