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
