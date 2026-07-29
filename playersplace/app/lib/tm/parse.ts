/**
 * Parsers do HTML do Transfermarkt.
 * Validados contra páginas reais (jul/2026) — ver design_handoff e README.
 */
import {parse, type HTMLElement} from 'node-html-parser';

export interface LeagueClubRow {
  id: string;
  name: string;
  crest: string | null;
  squad: string;
  avgAge: string;
  foreigners: string;
  avgValue: string;
  totalValue: string;
}

export interface LeagueOverview {
  name: string;
  season: string;
  clubs: LeagueClubRow[];
}

export interface StandingRow {
  pos: string;
  clubId: string | null;
  club: string;
  crest: string | null;
  played: string;
  won: string;
  draw: string;
  lost: string;
  goals: string;
  diff: string;
  points: string;
}

export interface StandingsGroup {
  title: string | null;
  rows: StandingRow[];
}

export interface SquadPlayer {
  id: string;
  name: string;
  photo: string | null;
  number: string;
  position: string;
  birth: string;
  age: number | null;
  nationality: string;
  value: string;
}

export interface ClubProfile {
  name: string;
  crest: string | null;
  league: {code: string; name: string} | null;
  totalValue: string;
  players: SquadPlayer[];
}

export interface PlayerProfile {
  name: string;
  number: string;
  photo: string | null;
  marketValue: string;
  club: {id: string; name: string} | null;
  league: string | null;
  info: Record<string, string>;
}

export interface RankedPlayer {
  rank: string;
  id: string;
  name: string;
  photo: string | null;
  position: string;
  age: string;
  nationality: string;
  club: {id: string | null; name: string} | null;
  value: string;
}

export interface TransferClub {
  id: string | null;
  name: string;
  crest: string | null;
}

export interface TransferRow {
  id: string;
  name: string;
  photo: string | null;
  position: string;
  from: TransferClub | null;
  to: TransferClub | null;
  fee: string;
}

export interface SearchResults {
  players: {
    id: string;
    name: string;
    photo: string | null;
    club: string;
    value: string;
  }[];
  clubs: {id: string; name: string; crest: string | null; country: string}[];
}

const idFrom = (href: string | undefined, kind: string): string | null => {
  const m = href?.match(new RegExp(`/${kind}/(\\d+)`));
  return m ? m[1] : null;
};
const clean = (s: string | undefined | null) =>
  (s ?? '').replace(/\s+/g, ' ').trim();
const hasClass = (el: HTMLElement | undefined, c: string) =>
  !!el?.classList?.contains(c);
const img = (el: HTMLElement | null | undefined) =>
  el?.getAttribute('data-src') || el?.getAttribute('src') || null;

/** idade a partir de "21/08/1995 (30)" */
export function ageFromBirth(birth: string): number | null {
  const m = birth.match(/\((\d+)\)/);
  return m ? Number(m[1]) : null;
}

// ---------- Liga: visão geral (clubes e valores) ----------
export function parseLeagueOverview(html: string): LeagueOverview {
  const root = parse(html);
  const name = clean(root.querySelector('.data-header__headline-wrapper')?.text);
  const title = clean(root.querySelector('title')?.text).replace(/\|.*/, '');
  const season = clean(title.replace(name, ''));
  const clubs: LeagueClubRow[] = [];
  for (const tr of root.querySelectorAll('table.items > tbody > tr')) {
    const link = tr.querySelector('td.hauptlink a[href*="/startseite/verein/"]');
    if (!link) continue;
    const id = idFrom(link.getAttribute('href'), 'verein');
    if (!id) continue;
    const tds = tr.querySelectorAll(':scope > td');
    const nums = tds.filter((t) => hasClass(t, 'zentriert') && !t.querySelector('img'));
    const rights = tds.filter((t) => hasClass(t, 'rechts'));
    clubs.push({
      id,
      name: clean(link.text),
      crest: img(tr.querySelector('img.tiny_wappen')),
      squad: clean(nums[0]?.text),
      avgAge: clean(nums[1]?.text),
      foreigners: clean(nums[2]?.text),
      avgValue: clean(rights[0]?.text),
      totalValue: clean(rights[rights.length - 1]?.text),
    });
  }
  return {name, season, clubs};
}

// ---------- Liga: classificação ----------
export function parseStandings(html: string): StandingsGroup[] {
  const root = parse(html);
  const groups: StandingsGroup[] = [];
  for (const box of root.querySelectorAll('div.box')) {
    const table = box.querySelector('table.items');
    if (!table) continue;
    const head = table.querySelectorAll('thead th').map((t) => clean(t.text));
    if (!head.some((h) => /Pts|Pontos/i.test(h))) continue;
    const title = clean(box.querySelector('h2, .table-header')?.text) || null;
    const rows: StandingRow[] = [];
    for (const tr of table.querySelectorAll('tbody tr')) {
      const clubLink = tr.querySelector('a[href*="/verein/"]');
      if (!clubLink) continue;
      const tds = tr.querySelectorAll(':scope > td').map((t) => clean(t.text));
      if (tds.length < 6) continue;
      rows.push({
        pos: tds[0],
        clubId: idFrom(clubLink.getAttribute('href'), 'verein'),
        club: clean(clubLink.getAttribute('title')) || clean(clubLink.text),
        crest: img(tr.querySelector('img')),
        played: tds[3] ?? '',
        won: tds[4] ?? '',
        draw: tds[5] ?? '',
        lost: tds[6] ?? '',
        goals: tds[7] ?? '',
        diff: tds[8] ?? '',
        points: tds[tds.length - 1] ?? '',
      });
    }
    if (rows.length) groups.push({title, rows});
  }
  return groups;
}

// ---------- Clube: perfil + elenco ----------
export function parseClub(html: string): ClubProfile {
  const root = parse(html);
  const name = clean(root.querySelector('.data-header__headline-wrapper')?.text);
  const crest = img(root.querySelector('.data-header__profile-container img'));
  const leagueLink =
    root.querySelector('.data-header__club a[href*="/wettbewerb/"]') ??
    root.querySelector('a[href*="/startseite/wettbewerb/"]');
  const leagueCode =
    leagueLink?.getAttribute('href')?.match(/wettbewerb\/([A-Z0-9]+)/)?.[1] ?? null;
  const totalValue = clean(root.querySelector('.data-header__market-value-wrapper')?.text)
    .replace(/Valor de mercado total.*/i, '')
    .trim();
  const players: SquadPlayer[] = [];
  for (const tr of root.querySelectorAll('table.items > tbody > tr')) {
    const link = tr.querySelector('a[href*="/profil/spieler/"]');
    if (!link) continue;
    const id = idFrom(link.getAttribute('href'), 'spieler');
    if (!id) continue;
    const inline = tr.querySelector('table.inline-table');
    const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
    const positionTitle = tr.querySelector('td.rueckennummer')?.getAttribute('title');
    const tds = tr.querySelectorAll(':scope > td');
    const zent = tds.filter(
      (t) => hasClass(t, 'zentriert') && !hasClass(t, 'rueckennummer'),
    );
    const birth = clean(zent[0]?.text);
    const nats = tr
      .querySelectorAll('td.zentriert img.flaggenrahmen')
      .map((f) => f.getAttribute('title'))
      .filter(Boolean) as string[];
    players.push({
      id,
      name: clean(link.text),
      photo: img(inline?.querySelector('img')),
      number: clean(tr.querySelector('.rn_nummer')?.text),
      position: clean(inlineRows[1]?.text) || positionTitle || '',
      birth,
      age: ageFromBirth(birth),
      nationality: nats.join(', '),
      value: clean(tr.querySelector('td.rechts')?.text),
    });
  }
  return {
    name,
    crest,
    league:
      leagueLink && leagueCode
        ? {code: leagueCode, name: clean(leagueLink.text)}
        : null,
    totalValue,
    players,
  };
}

// ---------- Jogador: perfil ----------
export function parsePlayer(html: string): PlayerProfile {
  const root = parse(html);
  const h1 = root.querySelector('h1.data-header__headline-wrapper');
  const number = clean(h1?.querySelector('.data-header__shirt-number')?.text);
  const name = clean(h1?.text).replace(number, '').trim();
  const photo = img(root.querySelector('.data-header__profile-container img'));
  const clubLink = root.querySelector('.data-header__club a[href*="/verein/"]');
  const clubId = clubLink ? idFrom(clubLink.getAttribute('href'), 'verein') : null;
  const leagueLink = root.querySelector('a[href*="/startseite/wettbewerb/"]');
  const mvRaw = clean(root.querySelector('.data-header__market-value-wrapper')?.text);
  const marketValue = mvRaw.split(/Última/i)[0].trim();
  const info: Record<string, string> = {};
  for (const r of root.querySelectorAll('.info-table span.info-table__content--regular')) {
    const sib = r.nextElementSibling;
    if (sib && hasClass(sib, 'info-table__content--bold')) {
      const key = clean(r.text).replace(/:$/, '');
      const value = clean(sib.text);
      if (key && value) info[key] = value;
    }
  }
  return {
    name,
    number,
    photo,
    marketValue,
    club: clubLink && clubId ? {id: clubId, name: clean(clubLink.text)} : null,
    league: leagueLink ? clean(leagueLink.text) || null : null,
    info,
  };
}

// ---------- Ranking de valores (liga ou global) ----------
export function parseValueRanking(html: string): RankedPlayer[] {
  const root = parse(html);
  const out: RankedPlayer[] = [];
  for (const tr of root.querySelectorAll('table.items > tbody > tr')) {
    const link = tr.querySelector('a[href*="/profil/spieler/"]');
    if (!link) continue;
    const id = idFrom(link.getAttribute('href'), 'spieler');
    if (!id) continue;
    const inline = tr.querySelector('table.inline-table');
    const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
    const tds = tr.querySelectorAll(':scope > td');
    const clubLink = tr.querySelector('a[href*="/startseite/verein/"]');
    const flags = tr
      .querySelectorAll('img.flaggenrahmen')
      .map((f) => f.getAttribute('title'))
      .filter(Boolean) as string[];
    out.push({
      rank: clean(tds[0]?.text),
      id,
      name: clean(link.text),
      photo: img(inline?.querySelector('img')),
      position: clean(inlineRows[1]?.text),
      age: clean(
        tds.filter(
          (t, i) => i > 0 && hasClass(t, 'zentriert') && /^\d+$/.test(clean(t.text)),
        )[0]?.text,
      ),
      nationality: flags.join(', '),
      club: clubLink
        ? {
            id: idFrom(clubLink.getAttribute('href'), 'verein'),
            name: clean(clubLink.getAttribute('title')) || clean(clubLink.text),
          }
        : null,
      value: clean(tr.querySelector('td.rechts')?.text),
    });
  }
  return out;
}

// ---------- Transferências (últimas / recordes) ----------
export function parseTransfers(html: string): TransferRow[] {
  const root = parse(html);
  const out: TransferRow[] = [];
  for (const tr of root.querySelectorAll('table.items > tbody > tr')) {
    const pLink = tr.querySelector('a[href*="/profil/spieler/"]');
    if (!pLink) continue;
    const id = idFrom(pLink.getAttribute('href'), 'spieler');
    if (!id) continue;
    // clubes de origem/destino: dedup por id preservando ordem no DOM,
    // usando o atributo title quando o link (escudo) não tem texto
    const clubs: TransferClub[] = [];
    for (const a of tr.querySelectorAll('a[href*="/verein/"]')) {
      const cid = idFrom(a.getAttribute('href'), 'verein');
      if (!cid) continue;
      const cname = clean(a.text) || clean(a.getAttribute('title'));
      const ccrest = img(a.querySelector('img'));
      const existing = clubs.find((c) => c.id === cid);
      if (existing) {
        if (!existing.name && cname) existing.name = cname;
        if (!existing.crest && ccrest) existing.crest = ccrest;
      } else {
        clubs.push({id: cid, name: cname, crest: ccrest});
      }
    }
    const inline = tr.querySelector('table.inline-table');
    const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
    const tds = tr.querySelectorAll(':scope > td');
    out.push({
      id,
      name: clean(pLink.text),
      photo: img(inline?.querySelector('img')),
      position: clean(inlineRows[1]?.text),
      from: clubs[0] ?? null,
      to: clubs[1] ?? null,
      fee: clean(tds[tds.length - 1]?.text),
    });
  }
  return out;
}

// ---------- Transferências de um clube (por temporada) ----------

/** como o jogador chegou ao clube */
export type ArrivalKind =
  | 'compra'
  | 'emprestimo'
  | 'gratis'
  | 'retorno'
  | 'indefinido';

export interface ClubArrival {
  id: string;
  name: string;
  photo: string | null;
  position: string;
  age: number | null;
  from: TransferClub | null;
  /** taxa como o Transfermarkt exibe ("€ 3.00 mi.", "Empréstimo", …) */
  fee: string;
  kind: ArrivalKind;
}

export interface ClubTransfers {
  /** id da temporada exibida (o `option[selected]` do seletor) */
  seasonId: string | null;
  /** rótulo da temporada exibida, ex.: "25/26" */
  seasonLabel: string;
  /**
   * Temporadas do seletor a partir da exibida — o Transfermarkt lista também
   * temporadas futuras (27/28, 26/27), que não interessam aqui.
   */
  seasons: {id: string; label: string}[];
  arrivals: ClubArrival[];
  departures: number;
}

/**
 * "Fim do empréstimo" precisa ser testado antes de "empréstimo": é um retorno,
 * não uma contratação — sem isso o Racing 25/26 contaria 29 reforços em vez de 13.
 */
function arrivalKind(fee: string): ArrivalKind {
  const f = fee.toLowerCase();
  if (/^fim d[oe] empr|fim de cess|end of loan|leihe ende/.test(f)) return 'retorno';
  if (/empr[ée]stimo|loan|leihe/.test(f)) return 'emprestimo';
  if (/custo zero|livre|gr[áa]tis|sem custo|free/.test(f)) return 'gratis';
  if (/€/.test(fee)) return 'compra';
  return 'indefinido';
}

/** clubes citados numa linha, sem repetir e completando nome/escudo */
function rowClubs(tr: HTMLElement): TransferClub[] {
  const clubs: TransferClub[] = [];
  for (const a of tr.querySelectorAll('a[href*="/verein/"]')) {
    const id = idFrom(a.getAttribute('href'), 'verein');
    if (!id) continue;
    const name = clean(a.text) || clean(a.getAttribute('title'));
    const crest = img(a.querySelector('img'));
    const existing = clubs.find((c) => c.id === id);
    if (existing) {
      if (!existing.name && name) existing.name = name;
      if (!existing.crest && crest) existing.crest = crest;
    } else {
      clubs.push({id, name, crest});
    }
  }
  return clubs;
}

function transferRows(box: HTMLElement | undefined): HTMLElement[] {
  return (box?.querySelectorAll('table.items > tbody > tr') ?? []).filter((r) =>
    r.querySelector('a[href*="/profil/spieler/"]'),
  );
}

export function parseClubTransfers(html: string): ClubTransfers {
  const root = parse(html);
  const boxes = root.querySelectorAll('div.box');
  const boxBy = (re: RegExp, fallback: number) =>
    boxes.find((b) => re.test(clean(b.querySelector('h2')?.text))) ??
    boxes[fallback];

  const seasonLabel = clean(boxes[0]?.querySelector('h2')?.text)
    .replace(/^transfer[êe]ncias\s*/i, '')
    .trim();

  const options = (
    root.querySelector('select[name="saison_id"]')?.querySelectorAll('option') ??
    []
  ).filter((o) => /^\d+$/.test(o.getAttribute('value') ?? ''));
  const selectedAt = options.findIndex((o) => o.hasAttribute('selected'));
  const seasonId =
    selectedAt >= 0 ? (options[selectedAt].getAttribute('value') ?? null) : null;
  const seasons = options
    .slice(Math.max(selectedAt, 0))
    .map((o) => ({id: o.getAttribute('value') ?? '', label: clean(o.text)}));

  const arrivals: ClubArrival[] = [];
  for (const tr of transferRows(boxBy(/entradas|zug[äa]nge|arrivals/i, 1))) {
    const link = tr.querySelector('a[href*="/profil/spieler/"]')!;
    const id = idFrom(link.getAttribute('href'), 'spieler');
    if (!id) continue;
    const inline = tr.querySelector('table.inline-table');
    const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
    const tds = tr.querySelectorAll(':scope > td');
    const fee = clean(tds[tds.length - 1]?.text);
    // o 1º clube da linha é sempre a origem (o clube da página não é linkado)
    arrivals.push({
      id,
      name: clean(link.text),
      photo: img(inline?.querySelector('img')),
      position: clean(inlineRows[1]?.text),
      age: Number(clean(tds[2]?.text)) || null,
      from: rowClubs(tr)[0] ?? null,
      fee,
      kind: arrivalKind(fee),
    });
  }

  return {
    seasonId,
    seasonLabel,
    seasons,
    arrivals,
    departures: transferRows(boxBy(/sa[íi]das|abg[äa]nge|departures/i, 2)).length,
  };
}

// ---------- Busca ----------
export function parseSearch(html: string): SearchResults {
  const root = parse(html);
  const players: SearchResults['players'] = [];
  const clubs: SearchResults['clubs'] = [];
  for (const box of root.querySelectorAll('div.box')) {
    const table = box.querySelector('table.items');
    if (!table) continue;
    for (const tr of table.querySelectorAll('tbody > tr')) {
      const pLink = tr.querySelector('a[href*="/profil/spieler/"]');
      const cLink = tr.querySelector('td.hauptlink a[href*="/startseite/verein/"]');
      if (pLink) {
        const id = idFrom(pLink.getAttribute('href'), 'spieler');
        if (!id) continue;
        const inline = tr.querySelector('table.inline-table');
        const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
        players.push({
          id,
          name: clean(pLink.text),
          photo: img(inline?.querySelector('img')),
          club: clean(inlineRows[1]?.text),
          value: clean(tr.querySelector('td.rechts')?.text),
        });
      } else if (cLink) {
        const id = idFrom(cLink.getAttribute('href'), 'verein');
        if (!id) continue;
        clubs.push({
          id,
          name: clean(cLink.text),
          crest: img(tr.querySelector('img')),
          country: clean(tr.querySelector('img.flaggenrahmen')?.getAttribute('title')),
        });
      }
    }
  }
  return {players: players.slice(0, 12), clubs: clubs.slice(0, 8)};
}

// ---------- rodada da competição ----------

/**
 * Horário do primeiro jogo de uma rodada, lido de
 * /-/spieltag/wettbewerb/{code}/saison_id/{season}/spieltag/{round}.
 *
 * A página espalha os jogos por blocos aninhados, então em vez de navegar a
 * árvore varremos o texto atrás de pares data+hora e ficamos com o menor.
 * Para "quando começa a rodada" isso basta e é bem mais resistente a mudança
 * de layout do que depender da posição das células.
 *
 * Os horários do Transfermarkt em português são de Brasília (UTC-3, sem
 * horário de verão desde 2019); devolvemos já em UTC.
 */
export function parseRoundFirstKickoff(html: string): Date | null {
  const texto = parse(html).textContent.replace(/\s+/g, ' ');
  const pares = [
    ...texto.matchAll(/(\d{2})\/(\d{2})\/(\d{4})\D{0,40}?(\d{2}):(\d{2})/g),
  ];
  if (!pares.length) return null;

  const datas = pares.map((m) => {
    const [, dia, mes, ano, hora, min] = m;
    return Date.UTC(
      Number(ano),
      Number(mes) - 1,
      Number(dia),
      Number(hora) + 3, // Brasília → UTC
      Number(min),
    );
  });

  return new Date(Math.min(...datas));
}

// ---------- apuração da rodada ----------

export interface RoundMatch {
  /** id da súmula: /spielbericht/index/spielbericht/{id} */
  reportId: string;
  /** "2:1" quando encerrado, "-:-" quando não */
  score: string;
  finished: boolean;
}

/**
 * Jogos de uma rodada, a partir da página /-/spieltag/....
 *
 * A rodada só é apurada quando TODOS voltam `finished`. Um único "-:-"
 * significa que ainda há jogo por acontecer — apurar ali daria pontuação
 * errada para quem apostou em quem ainda vai jogar.
 */
export function parseRoundMatches(html: string): RoundMatch[] {
  const root = parse(html);
  const vistos = new Set<string>();
  const out: RoundMatch[] = [];

  for (const a of root.querySelectorAll('a[href*="spielbericht"]')) {
    const texto = clean(a.textContent);
    // só o link do placar interessa; os outros são nav e escudo
    if (!/^(\d+:\d+|-:-)$/.test(texto)) continue;

    const reportId = a.getAttribute('href')?.match(/spielbericht\/(\d+)/)?.[1];
    if (!reportId || vistos.has(reportId)) continue;
    vistos.add(reportId);

    out.push({
      reportId,
      score: texto,
      finished: /^\d+:\d+$/.test(texto),
    });
  }

  return out;
}

export interface MatchEvent {
  scorerId: string;
  assistId: string | null;
  /** gol contra não conta como gol do autor */
  ownGoal: boolean;
}

/**
 * Gols e assistências de uma súmula.
 *
 * Cada ação do box "Gols" traz o autor e, quando houve, a assistência. O
 * primeiro link é o do escudo/foto e repete o autor, por isso deduplicamos
 * antes de decidir quem é quem.
 */
export function parseMatchGoals(html: string): MatchEvent[] {
  const root = parse(html);
  const out: MatchEvent[] = [];

  for (const box of root.querySelectorAll('div.box')) {
    const titulo = clean(box.querySelector('h2')?.textContent);
    if (!/^gols$/i.test(titulo)) continue;

    for (const acao of box.querySelectorAll('.sb-aktion')) {
      const texto = clean(acao.textContent);
      const ids: string[] = [];
      for (const a of acao.querySelectorAll('a[href*="/spieler/"]')) {
        const id = idFrom(a.getAttribute('href'), 'spieler');
        if (id && !ids.includes(id)) ids.push(id);
      }
      if (!ids.length) continue;

      const temAssistencia = /assist[êe]ncia:/i.test(texto);
      out.push({
        scorerId: ids[0],
        assistId: temAssistencia && ids[1] ? ids[1] : null,
        ownGoal: /gol contra/i.test(texto),
      });
    }
  }

  return out;
}

// ---------- desfalques do clube (suspensos e lesionados) ----------

export interface ClubAbsence {
  playerId: string;
  name: string;
  position: string;
  /** "Rotura do menisco", "Suspenso por cartões amarelos"… */
  reason: string;
  /** dd/mm/aaaa — quando começou */
  since: string;
  /** dd/mm/aaaa — previsão de retorno; vazio quando indefinido */
  until: string;
}

/**
 * Lê /-/sperrenundverletzungen/verein/{id}.
 *
 * A página tem dois blocos: "Suspensões e lesões" (quem está fora) e "Em
 * risco de suspensão" (quem ainda joga, mas pendurado). Só o primeiro
 * interessa — misturar os dois tiraria da escalação jogadores disponíveis.
 */
export function parseClubAbsences(html: string): ClubAbsence[] {
  const root = parse(html);
  const out: ClubAbsence[] = [];

  for (const box of root.querySelectorAll('div.box')) {
    const titulo = clean(box.querySelector('h2')?.textContent).toLowerCase();
    if (!titulo.includes('suspens') || titulo.includes('risco')) continue;

    const table = box.querySelector('table.items');
    if (!table) continue;

    for (const tr of table.querySelectorAll('tbody > tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 7) continue;

      const link = tr.querySelector('a[href*="/spieler/"]');
      const playerId = idFrom(link?.getAttribute('href'), 'spieler');
      if (!playerId) continue;

      out.push({
        playerId,
        name: clean(link?.textContent),
        position: clean(tds[3].textContent),
        reason: clean(tds[5].textContent),
        since: clean(tds[6].textContent),
        until: clean(tds[7]?.textContent),
      });
    }
  }

  return out;
}

// ---------- rankings de estatística da competição ----------

export interface StatLeaderRow {
  rank: number;
  id: string;
  name: string;
  position: string;
  age: string;
  clubId: string | null;
  clubName: string;
  clubCrest: string | null;
  games: number;
  /** a métrica do ranking: gols na lista de artilheiros, passes na de assistências */
  value: number;
}

/**
 * Lê as listas de artilheiros (/-/torschuetzenliste/wettbewerb/{code}) e de
 * assistências (/-/assistliste/...). As duas usam exatamente o mesmo layout
 * de 10 colunas, então um parser só atende as duas.
 *
 * Colunas: 0 rank · 3 jogador · 4 posição · 6 idade · 7 clube · 8 jogos ·
 * 9 a métrica.
 */
export function parseStatLeaders(html: string): StatLeaderRow[] {
  const root = parse(html);
  const table = root.querySelector('table.items');
  if (!table) return [];

  const out: StatLeaderRow[] = [];
  for (const tr of table.querySelectorAll('tbody > tr')) {
    const tds = tr.querySelectorAll('td');
    // linhas de dados têm 10 colunas; cabeçalhos e separadores têm menos
    if (tds.length < 10) continue;

    const playerLink = tds[3].querySelector('a[href*="/spieler/"]');
    const id = idFrom(playerLink?.getAttribute('href'), 'spieler');
    if (!id) continue;

    const clubLink = tds[7].querySelector('a[href*="/verein/"]');
    const rank = parseInt(clean(tds[0].textContent), 10);

    out.push({
      rank: Number.isFinite(rank) ? rank : out.length + 1,
      id,
      name: clean(playerLink?.textContent),
      position: clean(tds[4].textContent),
      age: clean(tds[6].textContent),
      clubId: idFrom(clubLink?.getAttribute('href'), 'verein'),
      clubName: clean(clubLink?.getAttribute('title') ?? tds[7].textContent),
      clubCrest: tds[7].querySelector('img')?.getAttribute('src') ?? null,
      games: parseInt(clean(tds[8].textContent), 10) || 0,
      value: parseInt(clean(tds[9].textContent), 10) || 0,
    });
  }
  return out;
}

// ---------- calendário do clube (últimos e próximos jogos) ----------

export interface ClubMatch {
  /** nome da competição (título do box) */
  competition: string;
  /** rodada, quando a competição usa rodadas */
  round: string;
  /** dd/mm/aaaa */
  date: string;
  /** ordenável: aaaammdd */
  sortKey: string;
  time: string;
  /** true = mandante */
  home: boolean;
  opponentId: string | null;
  opponentName: string;
  opponentCrest: string | null;
  /** "2:2" — null quando o jogo ainda não aconteceu */
  score: string | null;
  /** V / E / D do ponto de vista do clube consultado */
  outcome: 'V' | 'E' | 'D' | null;
}

/** "qua 28/01/2026" → {date: "28/01/2026", sortKey: "20260128"} */
function parseBrDate(raw: string): {date: string; sortKey: string} | null {
  const m = clean(raw).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return {date: `${m[1]}/${m[2]}/${m[3]}`, sortKey: `${m[3]}${m[2]}${m[1]}`};
}

function outcomeFrom(score: string, home: boolean): 'V' | 'E' | 'D' | null {
  const m = score.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  // o placar do Transfermarkt vem sempre na ordem mandante:visitante
  const mine = home ? Number(m[1]) : Number(m[2]);
  const theirs = home ? Number(m[2]) : Number(m[1]);
  return mine > theirs ? 'V' : mine < theirs ? 'D' : 'E';
}

/**
 * Lê /-/spielplan/verein/{id}. A página traz uma tabela por competição, todas
 * com as mesmas colunas: rodada, data, horário, casa/fora, ranking, escudo do
 * adversário, adversário, formação, público e resultado.
 */
export function parseClubFixtures(html: string): ClubMatch[] {
  const root = parse(html);
  const out: ClubMatch[] = [];

  for (const box of root.querySelectorAll('div.box')) {
    const table = box.querySelector('table');
    if (!table) continue;
    const headers = table.querySelectorAll('th').map((th) => clean(th.textContent));
    // só as tabelas de jogos têm estas duas colunas
    if (!headers.includes('Adversário') || !headers.includes('Resultado')) continue;

    const competition = clean(
      box.querySelector('h2')?.textContent ??
        box.querySelector('.content-box-headline')?.textContent,
    );

    for (const tr of table.querySelectorAll('tr')) {
      const tds = tr.querySelectorAll('td');
      if (tds.length < 9) continue;

      const when = parseBrDate(tds[1].textContent);
      if (!when) continue;

      // C = casa, F = fora; campo neutro cai em "fora"
      const home = clean(tds[3].textContent).toUpperCase() === 'C';

      const oppLink =
        tds[6].querySelector('a[href*="/verein/"]') ??
        tds[5].querySelector('a[href*="/verein/"]');
      const scoreCell = clean(tds[tds.length - 1].textContent);
      const score = /^\d+:\d+$/.test(scoreCell) ? scoreCell : null;

      out.push({
        competition,
        round: clean(tds[0].textContent),
        date: when.date,
        sortKey: when.sortKey,
        time: clean(tds[2].textContent),
        home,
        opponentId: idFrom(oppLink?.getAttribute('href'), 'verein'),
        // o nome vem com o ranking colado: "Vitória (3.)"
        opponentName: clean(tds[6].textContent).replace(/\s*\(\d+\.\)\s*$/, ''),
        opponentCrest: tds[5].querySelector('img')?.getAttribute('src') ?? null,
        score,
        outcome: score ? outcomeFrom(score, home) : null,
      });
    }
  }

  return out;
}
