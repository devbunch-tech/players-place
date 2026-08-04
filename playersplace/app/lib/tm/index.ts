/**
 * Serviço de dados do Players Place — consultas ao Transfermarkt
 * com cache em memória por rota.
 */
import {
  cached,
  cachedRegistro,
  tmApiJson,
  tmHtml,
  tmJson,
  type Registro,
} from './client';
import {ehSuspensao, positionMeta} from './positions';
import {
  parseClub,
  parseClubAbsences,
  parseClubFixtures,
  parseClubTransfers,
  parseLeagueOverview,
  parseMarketPlayers,
  parsePlayer,
  parsePlayerInjuries,
  parseMatchGoals,
  parseRoundFirstKickoff,
  parseMatchPreview,
  parseRoundCount,
  parseRoundFixtures,
  parseRoundMatches,
  parseRumors,
  parseSuspensionRisk,
  parseSearch,
  parseStandings,
  parseStatLeaders,
  parseTransfers,
  parseValueRanking,
  type ClubAbsence,
  type ClubMatch,
  type StatLeaderRow,
  type ClubProfile,
  type ClubTransfers,
  type LeagueOverview,
  type MatchPreview,
  type MarketPlayerPage,
  type MarketPlayerRow,
  type PlayerInjury,
  type PlayerProfile,
  type RankedPlayer,
  type RoundFixture,
  type RumorClub,
  type SuspensionRisk,
  type SearchResults,
  type StandingsGroup,
  type TransferRow,
} from './parse';

export * from './leagues';
export * from './parse';
export * from './positions';

export type {Registro};

const HOUR = 3600;

/** escudo de clube/seleção no CDN do Transfermarkt */
export function clubCrest(id: string | number): string {
  return `https://tmssl.akamaized.net/images/wappen/medium/${id}.png`;
}

// ---------- APIs JSON internas do Transfermarkt (ceapi) ----------
export interface CeapiTransfer {
  url: string;
  date: string;
  dateUnformatted: string;
  season: string;
  marketValue: string;
  fee: string;
  from: {href: string; clubName: string; 'clubEmblem-1x'?: string};
  to: {href: string; clubName: string; 'clubEmblem-1x'?: string};
}

export interface MarketValuePoint {
  x: number;
  y: number;
  mw: string;
  datum_mw: string;
  verein: string;
  age: string;
}

export interface MarketValueGraph {
  list: MarketValuePoint[];
  current: string;
  highest: string;
  highest_date: string;
  last_change: string;
}

/** a competição com a procedência — ver `getPlayerRegistro` */
export function getLeagueOverviewRegistro(
  code: string,
): Promise<Registro<LeagueOverview>> {
  return cachedRegistro(`league:${code}`, 6 * HOUR, async () =>
    parseLeagueOverview(await tmHtml(`/-/startseite/wettbewerb/${code}`)),
  );
}

export async function getLeagueOverview(code: string): Promise<LeagueOverview> {
  return (await getLeagueOverviewRegistro(code)).valor;
}

export function getLeagueStandings(code: string): Promise<StandingsGroup[]> {
  return cached(`standings:${code}`, HOUR, async () =>
    parseStandings(await tmHtml(`/-/tabelle/wettbewerb/${code}`)),
  );
}

export function getLeagueTopPlayers(code: string): Promise<RankedPlayer[]> {
  return cached(`leaguetop:${code}`, 6 * HOUR, async () =>
    parseValueRanking(await tmHtml(`/-/marktwerte/wettbewerb/${code}`)),
  );
}

export function getGlobalTopPlayers(): Promise<RankedPlayer[]> {
  return cached('globaltop', 6 * HOUR, async () =>
    parseValueRanking(
      await tmHtml('/spieler-statistik/wertvollstespieler/marktwertetop'),
    ),
  );
}

/** o elenco do clube com a procedência — ver `getPlayerRegistro` */
export function getClubRegistro(id: string): Promise<Registro<ClubProfile>> {
  return cachedRegistro(`club:${id}`, 6 * HOUR, async () =>
    parseClub(await tmHtml(`/-/startseite/verein/${id}`)),
  );
}

export async function getClub(id: string): Promise<ClubProfile> {
  return (await getClubRegistro(id)).valor;
}

export interface RodadaInfo {
  /** número da rodada corrente */
  round: number;
  /** saison_id do Transfermarkt: o ano de início da temporada */
  season: number;
  /** primeiro jogo da rodada, em UTC; null quando não foi possível ler */
  firstKickoff: Date | null;
}

/**
 * `saison_id` da temporada em curso, deduzido do rótulo que o Transfermarkt
 * exibe na competição.
 *
 * As duas convenções não podem ser tratadas igual: liga de ano-calendário
 * (Brasil) mostra "2026" e o `saison_id` é **2025**; liga que atravessa o ano
 * (Europa) mostra "26/27" e o `saison_id` é **2026**. Fixar `ano - 1` para
 * todo mundo — como era antes — jogava as ligas europeias na temporada
 * passada durante o recesso: em julho/2026 a Premier League abria na rodada 1
 * de agosto/**2025**, um campeonato já encerrado.
 */
function seasonId(label: string): number {
  const split = label.match(/(\d{2,4})\s*\/\s*\d{2}/);
  if (split) {
    return split[1].length === 4 ? Number(split[1]) : 2000 + Number(split[1]);
  }
  const ano = label.match(/(\d{4})/);
  return (ano ? Number(ano[1]) : new Date().getUTCFullYear()) - 1;
}

/**
 * Rodada corrente do campeonato e quando ela começa.
 *
 * O Transfermarkt não publica "rodada atual" num campo próprio: inferimos
 * pelo maior número de jogos já disputados na tabela. Com jogos atrasados a
 * conta erra para cima, então o prazo lido aqui deve ser conferido antes de
 * valer como fechamento oficial.
 */
export function getRodadaAtual(code: string): Promise<RodadaInfo> {
  return cached(`rodada:${code}`, HOUR, async () => {
    const [standings, overview] = await Promise.all([
      getLeagueStandings(code).catch(() => []),
      getLeagueOverview(code).catch(() => null),
    ]);
    const jogos = standings.flatMap((g) => g.rows).map((r) => Number(r.played) || 0);
    const round = jogos.length ? Math.max(...jogos) + 1 : 1;
    const season = seasonId(overview?.season ?? '');

    const firstKickoff = await tmHtml(
      `/-/spieltag/wettbewerb/${code}/saison_id/${season}/spieltag/${round}`,
    )
      .then(parseRoundFirstKickoff)
      .catch(() => null);

    return {round, season, firstKickoff};
  });
}

export interface RoundResults {
  /** todos os jogos da rodada terminaram */
  complete: boolean;
  jogos: number;
  encerrados: number;
  /** playerId → gols e assistências na rodada */
  stats: Record<string, {goals: number; assists: number}>;
}

/**
 * Resultado consolidado de uma rodada, para a apuração.
 *
 * Lê as súmulas — 1 requisição pela página da rodada + 1 por jogo (10 no
 * Brasileirão). Fazer jogador a jogador seriam centenas, o que não caberia
 * no limite de subrequests de uma request do worker.
 *
 * Sem cache de propósito: apuração precisa do estado atual, e ela roda uma
 * vez por rodada.
 */
export async function getRoundResults(
  code: string,
  season: number,
  round: number,
): Promise<RoundResults> {
  const html = await tmHtml(
    `/-/spieltag/wettbewerb/${code}/saison_id/${season}/spieltag/${round}`,
  );
  const jogos = parseRoundMatches(html);
  const encerrados = jogos.filter((j) => j.finished);

  const vazio: RoundResults = {
    complete: false,
    jogos: jogos.length,
    encerrados: encerrados.length,
    stats: {},
  };
  if (!jogos.length || encerrados.length !== jogos.length) return vazio;

  const sumulas = await Promise.all(
    encerrados.map((j) =>
      tmHtml(`/spielbericht/index/spielbericht/${j.reportId}`)
        .then(parseMatchGoals)
        .catch(() => []),
    ),
  );

  const stats: RoundResults['stats'] = {};
  const bump = (id: string, campo: 'goals' | 'assists') => {
    stats[id] ??= {goals: 0, assists: 0};
    stats[id][campo] += 1;
  };

  for (const eventos of sumulas) {
    for (const e of eventos) {
      // gol contra não credita gol a quem marcou
      if (!e.ownGoal) bump(e.scorerId, 'goals');
      if (e.assistId) bump(e.assistId, 'assists');
    }
  }

  return {complete: true, jogos: jogos.length, encerrados: encerrados.length, stats};
}

export function getClubAbsences(id: string): Promise<ClubAbsence[]> {
  return cached(`absences:${id}`, 2 * HOUR, async () =>
    parseClubAbsences(await tmHtml(`/-/sperrenundverletzungen/verein/${id}`)),
  );
}

export interface ClubUnavailable {
  suspended: ClubAbsence[];
  injured: ClubAbsence[];
  risk: SuspensionRisk[];
}

/**
 * Quem está fora e quem está pendurado, numa consulta só.
 *
 * As duas informações moram na mesma página do Transfermarkt (caixas
 * "Suspensões e lesões" e "Em risco de suspensão"), então buscá-la uma vez e
 * rodar os dois parsers economiza metade das requisições de um confronto.
 */
export function getClubUnavailable(id: string): Promise<ClubUnavailable> {
  return cached(`unavail:${id}`, 2 * HOUR, async () => {
    const html = await tmHtml(`/-/sperrenundverletzungen/verein/${id}`);
    const todos = parseClubAbsences(html);
    const suspenso = (a: ClubAbsence) => ehSuspensao(a.reason);
    return {
      suspended: todos.filter(suspenso),
      injured: todos.filter((a) => !suspenso(a)),
      risk: parseSuspensionRisk(html),
    };
  });
}

export interface RoundFixtures {
  /** rodada exibida */
  round: number;
  /** rodada corrente do campeonato, para marcar onde o usuário está */
  currentRound: number;
  season: number;
  /** total de rodadas da temporada, do seletor do Transfermarkt */
  totalRounds: number;
  fixtures: RoundFixture[];
}

/**
 * Jogos de uma rodada. Sem `round`, a rodada corrente.
 *
 * Cada rodada tem cache próprio: navegar para a seguinte e voltar não
 * refaz a consulta.
 */
export function getRoundFixtures(
  code: string,
  round?: number | null,
): Promise<RoundFixtures> {
  const pedida = round && round > 0 ? Math.floor(round) : null;
  return cached(`fixtures:${code}:${pedida ?? 'atual'}`, HOUR, async () => {
    const atual = await getRodadaAtual(code);
    const n = pedida ?? atual.round;
    const html = await tmHtml(
      `/-/spieltag/wettbewerb/${code}/saison_id/${atual.season}/spieltag/${n}`,
    ).catch(() => '');

    return {
      round: n,
      currentRound: atual.round,
      season: atual.season,
      totalRounds: html ? parseRoundCount(html) : 0,
      fixtures: html ? parseRoundFixtures(html) : [],
    };
  });
}

export interface BriefingClub {
  id: string;
  suspended: ClubAbsence[];
  /** demais desfalques (lesões e afins) — nada é descartado */
  injured: ClubAbsence[];
  risk: SuspensionRisk[];
}

export interface MatchBriefing {
  preview: MatchPreview;
  home: BriefingClub;
  away: BriefingClub;
}

/**
 * Tudo que dá para saber sobre um jogo antes dele acontecer: dúvidas,
 * suspensos e pendurados dos dois lados.
 *
 * São 3 requisições (a ficha do jogo e a página de desfalques de cada clube),
 * por isso é carregado sob demanda, um jogo por vez — a rodada inteira de uma
 * vez seriam 30 e o worker tem limite de subrequests.
 */
export async function getMatchBriefing(
  matchId: string,
  homeId: string,
  awayId: string,
): Promise<MatchBriefing> {
  const vazio: ClubUnavailable = {suspended: [], injured: [], risk: []};
  const [preview, home, away] = await Promise.all([
    cached(`preview:${matchId}`, HOUR, async () =>
      parseMatchPreview(
        await tmHtml(`/spielbericht/index/spielbericht/${matchId}`),
      ),
    ).catch(
      (): MatchPreview => ({stadium: null, referee: null, doubts: []}),
    ),
    getClubUnavailable(homeId).catch(() => vazio),
    getClubUnavailable(awayId).catch(() => vazio),
  ]);

  return {
    preview,
    home: {id: homeId, ...home},
    away: {id: awayId, ...away},
  };
}

export interface FantasyPlayer {
  id: string;
  name: string;
  position: string;
  number: string;
  photo: string | null;
  age: number | null;
  value: string;
}

export interface ClubSquadAvailability {
  clubId: string;
  clubName: string;
  available: FantasyPlayer[];
  /** quem ficou de fora e por quê — mostrado ao usuário para dar contexto */
  out: ClubAbsence[];
}

/**
 * Elenco de um clube já sem os desfalques, para montar a escalação.
 *
 * Carregar de clube em clube (2 requests) em vez do campeonato inteiro (40+)
 * é intencional: cabe no limite de subrequests do worker e, no celular,
 * escolher dentro de um elenco é melhor que rolar 700 jogadores.
 */
export function getClubSquadAvailable(
  id: string,
): Promise<ClubSquadAvailability> {
  return cached(`squadavail:${id}`, 2 * HOUR, async () => {
    const [club, out] = await Promise.all([
      getClub(id),
      getClubAbsences(id).catch(() => [] as ClubAbsence[]),
    ]);
    const fora = new Set(out.map((a) => a.playerId));

    return {
      clubId: id,
      clubName: club.name,
      available: club.players
        .filter((p) => !fora.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          position: p.position,
          number: p.number,
          photo: p.photo,
          age: p.age,
          value: p.value,
        })),
      out,
    };
  });
}

export interface LeagueStats {
  scorers: StatLeaderRow[];
  assists: StatLeaderRow[];
}

/**
 * Estatísticas da competição: artilheiros e líderes de assistência.
 *
 * O Transfermarkt não publica ranking de cartões, desarmes, passes errados,
 * defesas nem chances perdidas por competição — só gols, assistências e tempo
 * de jogo. Essas quatro dependeriam de outra fonte de dados.
 */
export function getLeagueStats(code: string, limit = 10): Promise<LeagueStats> {
  return cached(`leaguestats:${code}:${limit}`, 6 * HOUR, async () => {
    const [scorers, assists] = await Promise.all([
      tmHtml(`/-/torschuetzenliste/wettbewerb/${code}`)
        .then(parseStatLeaders)
        .catch(() => []),
      tmHtml(`/-/assistliste/wettbewerb/${code}`)
        .then(parseStatLeaders)
        .catch(() => []),
    ]);
    return {
      scorers: scorers.slice(0, limit),
      assists: assists.slice(0, limit),
    };
  });
}

export interface ClubForm {
  last: ClubMatch[];
  next: ClubMatch[];
}

/** aaaammdd de hoje, para separar jogos disputados de futuros */
function todayKey(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * Últimos 3 e próximos 3 jogos do clube, somando todas as competições.
 *
 * O placar é o que separa disputado de futuro. Jogos sem placar cuja data já
 * passou (adiados, cancelados) ficam de fora dos dois lados — apareceriam
 * como "próximo jogo" numa data que não existe mais.
 */
export function getClubForm(id: string): Promise<ClubForm> {
  return cached(`clubform:${id}`, 2 * HOUR, async () => {
    const all = parseClubFixtures(await tmHtml(`/-/spielplan/verein/${id}`));
    const hoje = todayKey();

    const last = all
      .filter((m) => m.score)
      .sort((a, b) => b.sortKey.localeCompare(a.sortKey))
      .slice(0, 3);

    const next = all
      .filter((m) => !m.score && m.sortKey >= hoje)
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .slice(0, 3);

    return {last, next};
  });
}

/**
 * Entradas e saídas de um clube numa temporada. Sem `season` o Transfermarkt
 * devolve a temporada corrente (e o `select` da página nos dá a lista toda).
 */
export function getClubTransfers(
  id: string,
  season?: string | null,
): Promise<ClubTransfers> {
  return cached(`clubtr:${id}:${season ?? 'atual'}`, 6 * HOUR, async () =>
    parseClubTransfers(
      await tmHtml(
        season
          ? `/-/transfers/verein/${id}/saison_id/${season}`
          : `/-/transfers/verein/${id}`,
      ),
    ),
  );
}

/**
 * A ficha do jogador junto com a procedência do dado.
 *
 * A página do jogador usa esta variante porque é ela que decide se a página
 * existe: quando a origem falha, o que salva a visita é a cópia guardada — e o
 * visitante merece saber de quando ela é.
 */
export function getPlayerRegistro(
  id: string,
): Promise<Registro<PlayerProfile>> {
  return cachedRegistro(`player:${id}`, 6 * HOUR, async () =>
    parsePlayer(await tmHtml(`/-/profil/spieler/${id}`)),
  );
}

export async function getPlayer(id: string): Promise<PlayerProfile> {
  return (await getPlayerRegistro(id)).valor;
}

/**
 * Histórico de lesões da carreira.
 *
 * TTL longo porque é passado: só muda quando o jogador se lesiona de novo, e
 * a lesão em curso vem de outra fonte (a página de desfalques do clube, que
 * tem previsão de retorno — ver `getClubAbsences`).
 */
export function getPlayerInjuries(id: string): Promise<PlayerInjury[]> {
  return cached(`pinjuries:${id}`, 12 * HOUR, async () =>
    parsePlayerInjuries(await tmHtml(`/-/verletzungen/spieler/${id}`)),
  );
}

export function getPlayerTransfers(id: string): Promise<CeapiTransfer[]> {
  return cached(`ptransfers:${id}`, 6 * HOUR, async () => {
    const data = await tmJson<{transfers: CeapiTransfer[]}>(
      `/ceapi/transferHistory/list/${id}`,
    );
    return data.transfers ?? [];
  });
}

export function getPlayerMarketValueGraph(
  id: string,
): Promise<MarketValueGraph | null> {
  return cached(`pmv:${id}`, 6 * HOUR, async () => {
    try {
      const data = await tmJson<MarketValueGraph>(
        `/ceapi/marketValueDevelopment/graph/${id}`,
      );
      return data?.list?.length ? data : null;
    } catch {
      return null;
    }
  });
}

// ---------- Desempenho por temporada (tmapi.transfermarkt.technology) ----------
interface ApiSeasonPerfItem {
  generalInformation: {
    seasonId: number;
    competitionId: string;
    clubId: string;
    season: {display: string};
  };
  statistics: {
    goalStatistics: {
      goalsSum: number;
      assistsSum: number;
      opponentGoalsOnThePitch: number;
    };
    cardStatistics: {
      yellowCardNetSum: number;
      yellowRedCardsCount: number;
      redCardsCount: number;
    };
    playingTimeStatistics: {
      playedMinutesSum: number;
      startingCount: number;
      appearancesCount: number;
    };
  };
}

export interface CompetitionPerf {
  competitionId: string;
  name: string;
  games: number;
  goals: number;
  assists: number;
  conceded: number;
  starts: number;
  yellow: number;
  red: number;
  minutes: number;
}

export interface SeasonPerf {
  seasonId: number;
  label: string;
  rows: CompetitionPerf[];
  total: Omit<CompetitionPerf, 'competitionId' | 'name'>;
}

const MAX_SEASONS = 5;

/** resposta bruta de desempenho por temporada, reaproveitada pelos agregados */
function getRawSeasonPerformance(id: string): Promise<ApiSeasonPerfItem[]> {
  return cached(`perfraw:${id}`, 6 * HOUR, async () => {
    const res = await tmApiJson<{
      success: boolean;
      data?: {performance?: ApiSeasonPerfItem[]};
    }>(`/player/${id}/performance-season`);
    return res.data?.performance ?? [];
  });
}

/** a URL de `ids[]=` cresce rápido; consultamos em lotes */
async function fetchInChunks<T>(
  path: string,
  ids: string[],
  size = 60,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const qs = ids
      .slice(i, i + size)
      .map((v) => `ids[]=${encodeURIComponent(v)}`)
      .join('&');
    try {
      const res = await tmApiJson<{data?: T[]}>(`${path}?${qs}`);
      out.push(...(res.data ?? []));
    } catch {
      // lote indisponível — seguimos com o que der
    }
  }
  return out;
}

interface ApiClub {
  id: string;
  name: string;
  baseDetails?: {shortName?: string; isNationalTeam?: boolean};
}

/** nomes de clubes/seleções por id */
async function fetchClubNames(ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  for (const c of await fetchInChunks<ApiClub>('/clubs', ids)) {
    names.set(c.id, c.baseDetails?.shortName || c.name);
  }
  return names;
}

/** nomes de competições por id */
async function fetchCompetitionNames(
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!ids.length) return names;
  for (const c of await fetchInChunks<{id: string; name: string}>(
    '/competitions',
    ids,
  )) {
    names.set(c.id, c.name);
  }
  return names;
}

export function getPlayerPerformance(id: string): Promise<SeasonPerf[]> {
  return cached(`perf:${id}`, 6 * HOUR, async () => {
    const items = await getRawSeasonPerformance(id);

    // agrega por temporada → competição (um jogador pode repetir a mesma
    // competição na temporada ao trocar de clube)
    const bySeason = new Map<
      number,
      {labels: string[]; comps: Map<string, CompetitionPerf>}
    >();
    for (const it of items) {
      const pt = it.statistics.playingTimeStatistics;
      if (!pt.appearancesCount) continue;
      const sid = it.generalInformation.seasonId;
      const cid = it.generalInformation.competitionId;
      let season = bySeason.get(sid);
      if (!season) {
        season = {labels: [], comps: new Map()};
        bySeason.set(sid, season);
      }
      season.labels.push(it.generalInformation.season.display);
      let comp = season.comps.get(cid);
      if (!comp) {
        comp = {
          competitionId: cid,
          name: cid,
          games: 0,
          goals: 0,
          assists: 0,
          conceded: 0,
          starts: 0,
          yellow: 0,
          red: 0,
          minutes: 0,
        };
        season.comps.set(cid, comp);
      }
      comp.games += pt.appearancesCount;
      comp.starts += pt.startingCount;
      comp.minutes += pt.playedMinutesSum;
      comp.goals += it.statistics.goalStatistics.goalsSum;
      comp.assists += it.statistics.goalStatistics.assistsSum;
      comp.conceded += it.statistics.goalStatistics.opponentGoalsOnThePitch;
      comp.yellow += it.statistics.cardStatistics.yellowCardNetSum;
      comp.red +=
        it.statistics.cardStatistics.redCardsCount +
        it.statistics.cardStatistics.yellowRedCardsCount;
    }

    const seasonIds = [...bySeason.keys()]
      .sort((a, b) => b - a)
      .slice(0, MAX_SEASONS);

    // nomes das competições envolvidas
    const compIds = new Set<string>();
    for (const sid of seasonIds) {
      for (const cid of bySeason.get(sid)!.comps.keys()) compIds.add(cid);
    }
    // sem nomes, exibimos o código da competição
    const names = await fetchCompetitionNames([...compIds]);

    return seasonIds.map((sid) => {
      const season = bySeason.get(sid)!;
      // rótulo mais frequente entre as competições da temporada
      const counts = new Map<string, number>();
      for (const l of season.labels) counts.set(l, (counts.get(l) ?? 0) + 1);
      const label = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const rows = [...season.comps.values()]
        .map((c) => ({...c, name: names.get(c.competitionId) ?? c.competitionId}))
        .sort((a, b) => b.minutes - a.minutes);
      const total = rows.reduce(
        (acc, c) => ({
          games: acc.games + c.games,
          goals: acc.goals + c.goals,
          assists: acc.assists + c.assists,
          conceded: acc.conceded + c.conceded,
          starts: acc.starts + c.starts,
          yellow: acc.yellow + c.yellow,
          red: acc.red + c.red,
          minutes: acc.minutes + c.minutes,
        }),
        {games: 0, goals: 0, assists: 0, conceded: 0, starts: 0, yellow: 0, red: 0, minutes: 0},
      );
      return {seasonId: sid, label, rows, total};
    });
  });
}

// ---------- Carreira completa (por competição e por clube) ----------
export interface CareerRow {
  /** id da competição ou do clube, conforme a lista */
  key: string;
  name: string;
  games: number;
  goals: number;
  assists: number;
  conceded: number;
  starts: number;
  minutes: number;
}

export type CareerTotal = Omit<CareerRow, 'key' | 'name'>;

export interface PlayerCareer {
  competitions: CareerRow[];
  clubs: CareerRow[];
  total: CareerTotal;
}

const emptyTotal = (): CareerTotal => ({
  games: 0,
  goals: 0,
  assists: 0,
  conceded: 0,
  starts: 0,
  minutes: 0,
});

/** minutos em campo por gol marcado — null quando o jogador não marcou */
export function minutesPerGoal(row: CareerTotal): number | null {
  return row.goals > 0 ? Math.round(row.minutes / row.goals) : null;
}

/**
 * Totais de toda a carreira somados por competição e por clube —
 * alimenta os blocos "Desempenho por competição" e "Desempenho por clube".
 */
export function getPlayerCareer(id: string): Promise<PlayerCareer | null> {
  return cached(`career:${id}`, 6 * HOUR, async () => {
    const items = await getRawSeasonPerformance(id);
    if (!items.length) return null;

    const byComp = new Map<string, CareerTotal>();
    const byClub = new Map<string, CareerTotal>();
    const total = emptyTotal();

    for (const it of items) {
      const pt = it.statistics.playingTimeStatistics;
      if (!pt.appearancesCount) continue;
      const add = (bucket: Map<string, CareerTotal>, key: string) => {
        let row = bucket.get(key);
        if (!row) bucket.set(key, (row = emptyTotal()));
        return row;
      };
      for (const row of [
        add(byComp, it.generalInformation.competitionId),
        add(byClub, it.generalInformation.clubId),
        total,
      ]) {
        row.games += pt.appearancesCount;
        row.starts += pt.startingCount;
        row.minutes += pt.playedMinutesSum;
        row.goals += it.statistics.goalStatistics.goalsSum;
        row.assists += it.statistics.goalStatistics.assistsSum;
        row.conceded += it.statistics.goalStatistics.opponentGoalsOnThePitch;
      }
    }

    const [compNames, clubNames] = await Promise.all([
      fetchCompetitionNames([...byComp.keys()]),
      fetchClubNames([...byClub.keys()]),
    ]);

    const toRows = (
      bucket: Map<string, CareerTotal>,
      names: Map<string, string>,
    ): CareerRow[] =>
      [...bucket.entries()]
        .map(([key, v]) => ({key, name: names.get(key) ?? key, ...v}))
        .sort((a, b) => b.games - a.games || b.minutes - a.minutes);

    return {
      competitions: toRows(byComp, compNames),
      clubs: toRows(byClub, clubNames),
      total,
    };
  });
}

// ---------- Titularidades por temporada ----------
export interface SeasonClubStarts {
  seasonId: number;
  label: string;
  clubId: string;
  clubName: string;
  games: number;
  starts: number;
  minutes: number;
  goals: number;
  assists: number;
}

/**
 * Quantas vezes o jogador começou como titular em cada clube, temporada a
 * temporada. Uma temporada pode render mais de uma linha quando houve
 * transferência no meio do ano.
 */
export function getPlayerStartsBySeason(
  id: string,
): Promise<SeasonClubStarts[]> {
  return cached(`starts:${id}`, 6 * HOUR, async () => {
    const items = await getRawSeasonPerformance(id);
    if (!items.length) return [];

    // uma mesma temporada aparece como "2019" nas ligas de ano-calendário e
    // "18/19" nas europeias; fixamos o rótulo mais frequente de cada seasonId
    const labelVotes = new Map<number, Map<string, number>>();
    for (const it of items) {
      if (!it.statistics.playingTimeStatistics.appearancesCount) continue;
      const {seasonId, season} = it.generalInformation;
      let votes = labelVotes.get(seasonId);
      if (!votes) labelVotes.set(seasonId, (votes = new Map()));
      votes.set(season.display, (votes.get(season.display) ?? 0) + 1);
    }
    const labelOf = (seasonId: number, fallback: string) => {
      const votes = labelVotes.get(seasonId);
      if (!votes) return fallback;
      return [...votes.entries()].sort((a, b) => b[1] - a[1])[0][0];
    };

    const bucket = new Map<
      string,
      Omit<SeasonClubStarts, 'clubName'> & {clubName?: string}
    >();
    for (const it of items) {
      const pt = it.statistics.playingTimeStatistics;
      if (!pt.appearancesCount) continue;
      const {seasonId, clubId, season} = it.generalInformation;
      const key = `${seasonId}:${clubId}`;
      let row = bucket.get(key);
      if (!row) {
        row = {
          seasonId,
          label: labelOf(seasonId, season.display),
          clubId,
          games: 0,
          starts: 0,
          minutes: 0,
          goals: 0,
          assists: 0,
        };
        bucket.set(key, row);
      }
      row.games += pt.appearancesCount;
      row.starts += pt.startingCount;
      row.minutes += pt.playedMinutesSum;
      row.goals += it.statistics.goalStatistics.goalsSum;
      row.assists += it.statistics.goalStatistics.assistsSum;
    }

    const names = await fetchClubNames([
      ...new Set([...bucket.values()].map((r) => r.clubId)),
    ]);
    return [...bucket.values()]
      .map((r) => ({...r, clubName: names.get(r.clubId) ?? r.clubId}))
      .sort((a, b) => b.seasonId - a.seasonId || b.games - a.games);
  });
}

// ---------- Carreira na seleção ----------
interface ApiNationalCareer {
  clubId: string;
  gamesPlayed: number;
  goalsScored: number;
  shirtNumber: number | null;
  isCaptain: boolean;
  debut: string | null;
  careerState: string;
}

export interface NationalTeamRow {
  clubId: string;
  name: string;
  games: number;
  goals: number;
  shirtNumber: number | null;
  isCaptain: boolean;
  /** data de estreia em dd/mm/aaaa */
  debut: string | null;
  current: boolean;
}

const isoToBr = (iso: string | null): string | null => {
  const m = iso?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : null;
};

/** dd/mm/aa — formato usado nas súmulas do Transfermarkt */
const isoToBrShort = (iso: string | null): string | null => {
  const m = iso?.match(/^(\d{2})(\d{2})-(\d{2})-(\d{2})/);
  return m ? `${m[4]}/${m[3]}/${m[2]}` : null;
};

export function getPlayerNationalCareer(id: string): Promise<NationalTeamRow[]> {
  return cached(`nat:${id}`, 6 * HOUR, async () => {
    const res = await tmApiJson<{data?: {history?: ApiNationalCareer[]}}>(
      `/player/${id}/national-career-history`,
    );
    const history = res.data?.history ?? [];
    if (!history.length) return [];
    const names = await fetchClubNames(history.map((h) => h.clubId));
    return history
      .map((h) => ({
        clubId: h.clubId,
        name: names.get(h.clubId) ?? h.clubId,
        games: h.gamesPlayed,
        goals: h.goalsScored,
        shirtNumber: h.shirtNumber || null,
        isCaptain: h.isCaptain,
        debut: isoToBr(h.debut),
        current: h.careerState === 'CURRENT_NATIONAL_PLAYER',
      }))
      .sort(
        (a, b) => Number(b.current) - Number(a.current) || b.games - a.games,
      );
  });
}

// ---------- Jogo a jogo + posições em que jogou ----------
interface ApiGameItem {
  gameInformation: {
    gameId: string;
    competitionId: string;
    seasonId: number;
    gameDay: number | null;
    date: {dateTimeUTC: string};
    season: {display: string};
  };
  clubsInformation: {
    club: {
      venue: string;
      clubId: string;
      goalsTotal: number;
      opponentGoalsTotal: number;
      clubRank: number | null;
    };
    opponent: {clubId: string; clubRank: number | null};
  };
  statistics: {
    generalStatistics: {participationState: string; positionId: number | null};
    goalStatistics: {
      goalsScoredTotal: number;
      assists: number;
      opponentGoalsOnThePitch: number;
    };
    cardStatistics: {yellowCardNet: number};
    playingTimeStatistics: {playedMinutes: number | null};
  };
}

export type GameState = 'played' | 'squad' | 'out' | 'injured' | 'absent';

export interface GameRow {
  gameId: string;
  matchDay: number | null;
  /** dd/mm/aa */
  date: string | null;
  /** C (casa), F (fora) ou D (campo neutro) */
  venue: string;
  clubRank: number | null;
  opponentId: string;
  opponentName: string;
  opponentRank: number | null;
  score: string;
  /** V/E/D do ponto de vista do time do jogador */
  outcome: 'V' | 'E' | 'D';
  state: GameState;
  position: string | null;
  goals: number;
  assists: number;
  yellow: number;
  minutes: number | null;
}

export interface GameCompetitionGroup {
  competitionId: string;
  name: string;
  rows: GameRow[];
}

export interface SeasonGames {
  seasonId: number;
  label: string;
  groups: GameCompetitionGroup[];
}

export interface PositionPerf {
  positionId: number;
  games: number;
  goals: number;
  assists: number;
  conceded: number;
  cleanSheets: number;
}

export interface PlayerGameLog {
  positions: PositionPerf[];
  seasons: SeasonGames[];
}

const GAME_STATES: Record<string, GameState> = {
  played: 'played',
  'in squad': 'squad',
  'not in squad': 'out',
  injured: 'injured',
  absent: 'absent',
};

const VENUES: Record<string, string> = {home: 'C', away: 'F', neutral: 'D'};

/** quantas temporadas de súmula enviamos ao navegador */
const MAX_GAME_SEASONS = 5;

/**
 * Súmula jogo a jogo das últimas temporadas e agregado de posições
 * de toda a carreira — ambos derivados da mesma resposta da API.
 */
export function getPlayerGameLog(id: string): Promise<PlayerGameLog | null> {
  return cached(`games:${id}`, 6 * HOUR, async () => {
    const res = await tmApiJson<{data?: {performance?: ApiGameItem[]}}>(
      `/player/${id}/performance-game`,
    );
    const items = res.data?.performance ?? [];
    if (!items.length) return null;

    // posições consideram apenas jogos disputados, em toda a carreira
    const byPosition = new Map<number, PositionPerf>();
    for (const it of items) {
      const g = it.statistics.generalStatistics;
      if (g.participationState !== 'played' || !g.positionId) continue;
      let p = byPosition.get(g.positionId);
      if (!p) {
        p = {
          positionId: g.positionId,
          games: 0,
          goals: 0,
          assists: 0,
          conceded: 0,
          cleanSheets: 0,
        };
        byPosition.set(g.positionId, p);
      }
      const conceded = it.statistics.goalStatistics.opponentGoalsOnThePitch;
      p.games += 1;
      p.goals += it.statistics.goalStatistics.goalsScoredTotal;
      p.assists += it.statistics.goalStatistics.assists;
      p.conceded += conceded;
      if (conceded === 0) p.cleanSheets += 1;
    }

    // súmula das temporadas mais recentes
    const seasonIds = [
      ...new Set(items.map((it) => it.gameInformation.seasonId)),
    ]
      .sort((a, b) => b - a)
      .slice(0, MAX_GAME_SEASONS);
    const recent = items.filter((it) =>
      seasonIds.includes(it.gameInformation.seasonId),
    );

    const [compNames, clubNames] = await Promise.all([
      fetchCompetitionNames([
        ...new Set(recent.map((it) => it.gameInformation.competitionId)),
      ]),
      fetchClubNames([
        ...new Set(recent.map((it) => it.clubsInformation.opponent.clubId)),
      ]),
    ]);

    const seasons: SeasonGames[] = seasonIds.map((sid) => {
      const games = recent.filter((it) => it.gameInformation.seasonId === sid);
      const groups = new Map<string, GameRow[]>();
      for (const it of games) {
        const gi = it.gameInformation;
        const club = it.clubsInformation.club;
        const opp = it.clubsInformation.opponent;
        const stats = it.statistics;
        const outcome =
          club.goalsTotal > club.opponentGoalsTotal
            ? 'V'
            : club.goalsTotal < club.opponentGoalsTotal
              ? 'D'
              : 'E';
        const row: GameRow = {
          gameId: gi.gameId,
          matchDay: gi.gameDay || null,
          date: isoToBrShort(gi.date?.dateTimeUTC ?? null),
          venue: VENUES[club.venue] ?? '',
          clubRank: club.clubRank,
          opponentId: opp.clubId,
          opponentName: clubNames.get(opp.clubId) ?? opp.clubId,
          opponentRank: opp.clubRank,
          score: `${club.goalsTotal}:${club.opponentGoalsTotal}`,
          outcome,
          state:
            GAME_STATES[stats.generalStatistics.participationState] ?? 'out',
          position: stats.generalStatistics.positionId
            ? (positionMeta(stats.generalStatistics.positionId)?.short ?? null)
            : null,
          goals: stats.goalStatistics.goalsScoredTotal ?? 0,
          assists: stats.goalStatistics.assists ?? 0,
          yellow: stats.cardStatistics.yellowCardNet ?? 0,
          minutes: stats.playingTimeStatistics.playedMinutes,
        };
        const list = groups.get(gi.competitionId);
        if (list) list.push(row);
        else groups.set(gi.competitionId, [row]);
      }
      return {
        seasonId: sid,
        label: games[0]?.gameInformation.season.display ?? String(sid),
        groups: [...groups.entries()]
          .map(([competitionId, rows]) => ({
            competitionId,
            name: compNames.get(competitionId) ?? competitionId,
            rows: rows.sort((a, b) => (a.matchDay ?? 0) - (b.matchDay ?? 0)),
          }))
          .sort((a, b) => b.rows.length - a.rows.length),
      };
    });

    return {
      positions: [...byPosition.values()].sort((a, b) => b.games - a.games),
      seasons,
    };
  });
}

export function searchAll(q: string): Promise<SearchResults> {
  const query = q.trim().slice(0, 60);
  return cached(`search:${query.toLowerCase()}`, HOUR / 4, async () =>
    parseSearch(
      await tmHtml(
        `/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(query)}`,
      ),
    ),
  );
}

export function getLatestTransfers(): Promise<TransferRow[]> {
  return cached('latesttransfers', HOUR / 2, async () =>
    parseTransfers(await tmHtml('/statistik/neuestetransfers')),
  );
}

export function getTransferRecords(): Promise<TransferRow[]> {
  return cached('transferrecords', 24 * HOUR, async () =>
    parseTransfers(await tmHtml('/transfers/transferrekorde/statistik')),
  );
}

// ---------- Mercado: contratos a terminar / livres para assinar ----------

/** quantos jogadores mostramos por página no Players Place */
export const MARKET_PER_PAGE = 15;

export interface MarketList {
  rows: MarketPlayerRow[];
  page: number;
  totalPages: number;
  /** título da lista no Transfermarkt (traz o ano dos contratos, p.ex.) */
  title: string;
  /** nacionalidades disponíveis no filtro desta lista */
  countries: {id: string; name: string}[];
  /** nacionalidade em uso (id de país do Transfermarkt) ou null */
  country: string | null;
}

/** id de país do TM; qualquer outra coisa vira "sem filtro" */
const landId = (v: string | null | undefined): string | null =>
  v && /^\d+$/.test(v) ? v : null;

/** uma página da origem, do jeito que o Transfermarkt a pagina */
function sourcePage(
  path: string,
  n: number,
  country: string | null,
): Promise<MarketPlayerPage> {
  const qs = new URLSearchParams();
  if (country) qs.set('land_id', country);
  if (n > 1) qs.set('page', String(n));
  const query = qs.toString();
  // as opções de país só interessam na página 1 — parsear em todas inflaria
  // o cache com as ~250 nacionalidades repetidas em cada entrada
  return cached(`market:${path}:${country ?? ''}:${n}`, 6 * HOUR, async () =>
    parseMarketPlayers(
      await tmHtml(query ? `${path}?${query}` : path),
      n === 1,
    ),
  );
}

/**
 * O Transfermarkt pagina estas listas com tamanho próprio (25 em contratos a
 * terminar, 50 em jogadores sem contrato) e nós queremos 15 por página. Em vez
 * de fixar esses números, medimos o tamanho na página 1 — que sempre buscamos,
 * porque é dela que sai o título e o total de páginas da origem — e recortamos
 * a janela pedida das páginas de origem que a cobrem (uma ou duas).
 *
 * `totalPages` é deliberadamente conservador: conta só os itens garantidos
 * pelas páginas cheias da origem, para que nenhuma página nossa apareça vazia.
 */
async function marketList(
  path: string,
  page: number,
  nationality?: string | null,
): Promise<MarketList> {
  const country = landId(nationality);
  const first = await sourcePage(path, 1, country);
  const {countries} = first;
  const size = first.rows.length;
  if (!size) {
    return {
      rows: [],
      page: 1,
      totalPages: 1,
      title: first.title,
      countries,
      country,
    };
  }

  const totalPages =
    Math.floor(((first.lastPage - 1) * size) / MARKET_PER_PAGE) + 1;
  const p = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);

  const start = (p - 1) * MARKET_PER_PAGE;
  const from = Math.floor(start / size) + 1;
  const to = Math.floor((start + MARKET_PER_PAGE - 1) / size) + 1;

  const pages = await Promise.all(
    Array.from({length: to - from + 1}, (_, i) =>
      from + i === 1
        ? Promise.resolve(first)
        : sourcePage(path, from + i, country),
    ),
  );
  const offset = start - (from - 1) * size;
  const rows = pages
    .flatMap((sp) => sp.rows)
    .slice(offset, offset + MARKET_PER_PAGE);

  return {rows, page: p, totalPages, title: first.title, countries, country};
}

/** clubes ligados a um jogador nos rumores abertos do Transfermarkt */
export function getPlayerRumors(id: string): Promise<RumorClub[]> {
  return cached(`rumors:${id}`, 6 * HOUR, async () =>
    parseRumors(await tmHtml(`/-/geruechte/spieler/${id}`)),
  );
}

/**
 * Jogadores com contrato se encerrando, do mais valioso ao menos valioso, já
 * com os clubes interessados de cada um.
 *
 * A lista de origem só publica a contagem de rumores, então os clubes saem de
 * uma consulta por jogador — feitas em paralelo e só para quem tem rumor
 * aberto, o que na prática são ~10 das 15 linhas. Cada uma tem cache próprio de
 * 6h e falha em silêncio: rumor indisponível vira linha sem clube interessado,
 * nunca uma página quebrada.
 */
export async function getExpiringContracts(
  page = 1,
  nationality?: string | null,
): Promise<MarketList> {
  const list = await marketList('/statistik/endendevertraege', page, nationality);
  const rows = await Promise.all(
    list.rows.map(async (row) => {
      if (!(Number(row.rumors) > 0)) return row;
      const interested = await getPlayerRumors(row.id).catch(() => []);
      return {...row, interested};
    }),
  );
  return {...list, rows};
}

/** jogadores sem contrato — livres para assinar com qualquer clube */
export function getFreeAgents(
  page = 1,
  nationality?: string | null,
): Promise<MarketList> {
  return marketList('/statistik/vertragslosespieler', page, nationality);
}
