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
  // O SEGUNDO SELETOR PRECISA FICAR DENTRO DO CABEÇALHO.
  //
  // Ele existe porque nem toda página de clube põe o link da competição em
  // `.data-header__club`. Mas buscando a partir de `root` ele varria a PÁGINA
  // INTEIRA e devolvia o primeiro link de competição que encontrasse — menu,
  // rodapé, bloco lateral, tanto faz. O resultado, medido em 14/08/2026 na
  // `jogadores_base`: 118.463 jogadores e 10.282 clubes distintos carimbados
  // com um único código genérico (`FIWC`), 94% da tabela.
  //
  // Nenhuma competição de clubes tem 10 mil clubes; o número sozinho já
  // denuncia que não era o link do clube. Restringir ao cabeçalho preserva a
  // intenção do fallback e mata a varredura cega.
  //
  // Quando nem no cabeçalho existe, `leagueCode` fica null — e null é
  // honesto: diz "não sei em que competição este clube está", que é
  // verdade, em vez de afirmar uma competição errada.
  const header = root.querySelector('.data-header') ?? root;
  const leagueLink =
    header.querySelector('.data-header__club a[href*="/wettbewerb/"]') ??
    header.querySelector('a[href*="/startseite/wettbewerb/"]');
  // `[A-Za-z0-9]`, e não `[A-Z0-9]`: os códigos do Transfermarkt NÃO são todos
  // maiúsculos. O Peru é `TDeC`, e a classe só-maiúscula casava `TD` e parava
  // no `e` minúsculo — gravando um código que não existe.
  //
  // O estrago não era visível na página: ela usa `findLeague`, que não acha
  // `TD` e simplesmente não mostra a competição. O estrago é na
  // `jogadores_base`, onde `gravarElencoBase` guarda esse código em
  // `liga_code`. Como as filas do espelho e dos vídeos selecionam por
  // `liga_code in (<registro>)`, todo jogador do Peru ficava invisível para as
  // duas — nunca espelhado, nunca com vídeo, e por isso mesmo o candidato
  // perfeito ao 502.
  //
  // A extração da linha ~458 sempre foi assim; esta ficou para trás. Duas
  // grafias da mesma coisa é o bastante para o bug existir em uma delas.
  const leagueCode =
    leagueLink?.getAttribute('href')?.match(/wettbewerb\/([A-Za-z0-9]+)/)?.[1] ??
    null;
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

// ---------- Mercado: contratos a terminar / jogadores sem contrato ----------

/** clube ligado a um jogador num rumor de transferência */
export interface RumorClub {
  id: string | null;
  name: string;
  crest: string | null;
  /** "avaliação dos usuários" do Transfermarkt, ex. "51 %" */
  probability: string | null;
}

export interface MarketPlayerRow {
  id: string;
  name: string;
  photo: string | null;
  position: string;
  age: string;
  nationality: string;
  /** clube atual — nulo na lista de jogadores livres */
  club: TransferClub | null;
  /** competição do clube atual (nome + código do Transfermarkt) */
  league: {code: string; name: string} | null;
  /** "sem contrato desde" (dd/mm/aaaa), só na lista de livres */
  since: string | null;
  value: string;
  /** quantidade de rumores de transferência abertos */
  rumors: string | null;
  /**
   * Clubes por trás desses rumores. A lista de origem só traz a contagem —
   * quem preenche isto é `getExpiringContracts`, com uma consulta por jogador.
   */
  interested?: RumorClub[];
}

export interface MarketPlayerPage {
  rows: MarketPlayerRow[];
  /** título da página no Transfermarkt (ex.: "Contratos a terminar 2027") */
  title: string;
  /** última página do paginador da origem */
  lastPage: number;
  /** opções do filtro de nacionalidade (só lidas quando pedidas) */
  countries: {id: string; name: string}[];
}

/** remove acentos e caixa para casar rótulos de coluna do TM */
const foldLabel = (s: string) =>
  clean(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * `/statistik/endendevertraege` e `/statistik/vertragslosespieler` usam a
 * mesma `table.items`, mas com colunas diferentes e em ordens diferentes —
 * daí o mapeamento ser feito pelos rótulos do `<thead>` em vez de índices
 * fixos. Escopar a nacionalidade à coluna "Nac." é obrigatório: a célula do
 * clube também traz uma bandeira (a do país da competição).
 */
export function parseMarketPlayers(
  html: string,
  withFilters = false,
): MarketPlayerPage {
  const root = parse(html);
  const table = root.querySelector('table.items');
  const headers = (table?.querySelectorAll('thead > tr > th') ?? []).map((th) =>
    foldLabel(th.text),
  );
  const col = (prefix: string) =>
    headers.findIndex((h) => h.startsWith(prefix));
  const iAge = col('idade');
  const iNat = col('nac');
  const iClub = col('clube');
  const iSince = col('sem contrato');
  const iValue = col('valor');
  const iRumors = col('rumores');

  const rows: MarketPlayerRow[] = [];
  for (const tr of table?.querySelectorAll('tbody > tr') ?? []) {
    const pLink = tr.querySelector('a[href*="/profil/spieler/"]');
    if (!pLink) continue;
    const id = idFrom(pLink.getAttribute('href'), 'spieler');
    if (!id) continue;
    const tds = tr.querySelectorAll(':scope > td');
    const inline = tds[0]?.querySelector('table.inline-table');
    const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];

    const clubCell = iClub >= 0 ? tds[iClub] : undefined;
    // o primeiro link da célula é o escudo (sem texto); o nome curto está no
    // `td.hauptlink` — preferir esse ao `title`, que traz a razão social
    const clubLink =
      clubCell?.querySelector('td.hauptlink a[href*="/startseite/verein/"]') ??
      clubCell?.querySelector('a[href*="/startseite/verein/"]');
    const clubId = idFrom(clubLink?.getAttribute('href'), 'verein');
    const leagueLink = clubCell?.querySelector('a[href*="/wettbewerb/"]');
    const leagueCode = leagueLink
      ?.getAttribute('href')
      ?.match(/\/wettbewerb\/([A-Za-z0-9]+)/)?.[1];

    rows.push({
      id,
      name: clean(pLink.text) || clean(pLink.getAttribute('title')),
      photo: img(inline?.querySelector('img')),
      position: clean(inlineRows[1]?.text),
      age: iAge >= 0 ? clean(tds[iAge]?.text) : '',
      nationality:
        iNat >= 0
          ? (tds[iNat]
              ?.querySelectorAll('img.flaggenrahmen')
              .map((f) => clean(f.getAttribute('title')))
              .filter(Boolean)
              .join(', ') ?? '')
          : '',
      club: clubLink
        ? {
            id: clubId,
            name:
              clean(clubLink.text) || clean(clubLink.getAttribute('title')),
            crest: img(clubCell?.querySelector('img')),
          }
        : null,
      league: leagueCode
        ? {code: leagueCode, name: clean(leagueLink?.text)}
        : null,
      since: iSince >= 0 ? clean(tds[iSince]?.text) || null : null,
      value: iValue >= 0 ? clean(tds[iValue]?.text) : '',
      rumors: iRumors >= 0 ? clean(tds[iRumors]?.text) || null : null,
    });
  }

  return {
    rows,
    title: clean(root.querySelector('h1')?.text || root.querySelector('h2')?.text),
    lastPage: parsePagerLastPage(root),
    countries: withFilters ? parseCountryOptions(root) : [],
  };
}

/**
 * Opções do `select[name=land_id]` do formulário de filtros. Cada lista traz a
 * sua — a de contratos a terminar tem o mundo inteiro, a de jogadores sem
 * contrato só os países que hoje têm alguém livre — e a opção "todas" aparece
 * como `0` numa página e `alle` na outra.
 */
function parseCountryOptions(root: HTMLElement): {id: string; name: string}[] {
  const seen = new Set<string>();
  const out: {id: string; name: string}[] = [];
  for (const o of root.querySelectorAll('select[name="land_id"] option')) {
    const id = clean(o.getAttribute('value'));
    const name = clean(o.text);
    if (!name || !/^\d+$/.test(id) || id === '0' || seen.has(id)) continue;
    seen.add(id);
    out.push({id, name});
  }
  return out;
}

/**
 * Clubes de `/-/geruechte/spieler/{id}`. A página tem duas tabelas idênticas:
 * a caixa "Rumores" (os abertos, que é o número mostrado na lista de contratos
 * a terminar) e o "Arquivo de notícias", com rumores já vencidos — pegar a
 * tabela errada encheria a tela de interesse antigo.
 */
export function parseRumors(html: string): RumorClub[] {
  const root = parse(html);
  const boxes = root
    .querySelectorAll('div.box')
    .filter((b) => b.querySelector('table.items'));
  const box =
    boxes.find((b) =>
      /^rumores/i.test(
        clean(b.querySelector('h2, .table-header, .content-box-headline')?.text),
      ),
    ) ?? boxes[0];

  const out: RumorClub[] = [];
  for (const tr of box?.querySelectorAll('table.items > tbody > tr') ?? []) {
    const link = tr.querySelector('a[href*="/verein/"]');
    if (!link) continue;
    const tds = tr.querySelectorAll(':scope > td');
    // o TM escreve "51 %"; o espaço só atrapalha num chip estreito
    const probability = clean(tds[tds.length - 1]?.text).replace(/\s+%/, '%');
    out.push({
      id: idFrom(link.getAttribute('href'), 'verein'),
      name: clean(link.getAttribute('title')) || clean(link.text),
      crest: img(tr.querySelector('img')),
      probability: probability && probability !== '-' ? probability : null,
    });
  }
  return out;
}

/** maior `?page=` do paginador — quantas páginas a origem tem */
function parsePagerLastPage(root: HTMLElement): number {
  let last = 1;
  for (const a of root.querySelectorAll('.tm-pagination__list-item a')) {
    const n = Number(a.getAttribute('href')?.match(/[?&]page=(\d+)/)?.[1]);
    if (Number.isFinite(n) && n > last) last = n;
  }
  return last;
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

// ---------- Rodada: jogos com clubes, data e horário ----------

export interface FixtureClub {
  id: string;
  name: string;
  crest: string | null;
  /** posição na tabela como o TM exibe, ex.: "(17.)" */
  standing: string;
}

export interface RoundFixture {
  reportId: string;
  home: FixtureClub;
  away: FixtureClub;
  score: string;
  finished: boolean;
  /** dd/mm/aaaa */
  date: string;
  /** hh:mm no horário de Brasília, como o TM publica */
  time: string;
  /** início em UTC (ISO), quando data e hora estão publicadas */
  kickoff: string | null;
}

/**
 * Jogos de `/-/spieltag/wettbewerb/{code}/saison_id/{s}/spieltag/{n}`.
 *
 * `parseRoundMatches` continua existindo para a apuração do Fantasy, que só
 * precisa de placar; aqui interessa o jogo inteiro. Cada jogo é uma `div.box`
 * com duas linhas: mandante/placar/visitante e, abaixo, data e horário.
 *
 * Cada clube aparece quatro vezes na linha (nome e escudo, cada um em versão
 * `hide-for-small` e `show-for-small`), então lemos as células de nome pelo
 * seletor do próprio TM em vez de deduplicar links.
 */
export function parseRoundFixtures(html: string): RoundFixture[] {
  const root = parse(html);
  const out: RoundFixture[] = [];

  for (const box of root.querySelectorAll('div.box')) {
    const link = box.querySelector('a[href*="/spielbericht/"] .matchresult');
    if (!link) continue;
    const reportId = box
      .querySelector('a[href*="/spielbericht/"]')
      ?.getAttribute('href')
      ?.match(/spielbericht\/(\d+)/)?.[1];
    if (!reportId) continue;

    const noSmall = (sel: string) =>
      box.querySelectorAll(sel).filter((td) => !hasClass(td, 'show-for-small'));
    const nameCells = noSmall('td.spieltagsansicht-vereinsname');
    const crestCells = noSmall('td.spieltagsansicht-wappen');
    const clubs: FixtureClub[] = nameCells.slice(0, 2).map((td, i) => {
      const a = td.querySelector('a[href*="/verein/"]');
      return {
        id: idFrom(a?.getAttribute('href'), 'verein') ?? '',
        name: clean(a?.text) || clean(a?.getAttribute('title')),
        crest: img(crestCells[i]?.querySelector('img')),
        standing: clean(td.querySelector('.tabellenplatz')?.text),
      };
    });
    if (clubs.length < 2) continue;

    const score = clean(link.text);
    // a data vem no href do link de "o que aconteceu hoje": /datum/2026-08-08
    const iso = box
      .querySelector('a[href*="/datum/"]')
      ?.getAttribute('href')
      ?.match(/datum\/(\d{4}-\d{2}-\d{2})/)?.[1];
    const time = box.text.match(/(\d{2}:\d{2})/)?.[1] ?? '';

    out.push({
      reportId,
      home: clubs[0],
      away: clubs[1],
      score,
      finished: /^\d+:\d+$/.test(score),
      date: iso ? iso.split('-').reverse().join('/') : '',
      time,
      kickoff: iso && time ? brasiliaToUtc(iso, time) : null,
    });
  }

  return out;
}

/** quantas rodadas a temporada tem, lido do seletor de rodada da página */
export function parseRoundCount(html: string): number {
  let max = 0;
  for (const o of parse(html).querySelectorAll('select[name="spieltag"] option')) {
    const n = Number(o.getAttribute('value'));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** horário do TM em português é de Brasília (UTC-3 fixo desde 2019) */
function brasiliaToUtc(isoDate: string, time: string): string | null {
  const d = new Date(`${isoDate}T${time}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------- Ficha de jogo: dados do confronto e quem está em dúvida ----------

export interface MatchDoubt {
  clubId: string | null;
  clubName: string;
  players: {id: string; name: string; reason: string}[];
}

export interface MatchPreview {
  stadium: string | null;
  referee: string | null;
  /** caixa "Em dúvida", um bloco por clube */
  doubts: MatchDoubt[];
}

/**
 * O que a ficha de um jogo ainda não disputado oferece.
 *
 * Não há escalação provável — o Transfermarkt só publica a escalação quando
 * ela sai, perto do apito. O que dá para antecipar é a caixa "Em dúvida", que
 * traz o motivo de cada jogador, e os dados do confronto.
 */
export function parseMatchPreview(html: string): MatchPreview {
  const root = parse(html);
  const info = clean(root.querySelector('.sb-zusatzinfos')?.text);
  const bruto = info.match(/[ÁA]rbitro:\s*(.+)$/i)?.[1]?.trim() ?? '';
  // "aberto" é como o TM diz que a arbitragem ainda não foi definida
  const referee = bruto && !/^(aberto|offen|open)$/i.test(bruto) ? bruto : null;
  const stadium = clean(info.replace(/[ÁA]rbitro:.*$/i, '')) || null;

  const doubts: MatchDoubt[] = [];
  for (const box of root.querySelectorAll('div.box')) {
    const head = clean(box.querySelector('h2, .content-box-headline')?.text);
    if (!/d[úu]vida/i.test(head)) continue;
    const content = box.querySelector('.content');
    if (!content) continue;

    // o bloco é texto corrido: <b>clube</b><br>jogador (motivo), jogador (motivo)
    let atual: MatchDoubt | null = null;
    for (const a of content.querySelectorAll('a')) {
      const href = a.getAttribute('href') ?? '';
      if (href.includes('/verein/')) {
        atual = {
          clubId: idFrom(href, 'verein'),
          clubName: clean(a.text) || clean(a.getAttribute('title')),
          players: [],
        };
        doubts.push(atual);
      } else if (href.includes('/spieler/') && atual) {
        const id = idFrom(href, 'spieler');
        if (!id) continue;
        // o motivo vem entre parênteses logo depois do link
        const after = a.nextSibling?.text ?? '';
        atual.players.push({
          id,
          name: clean(a.text) || clean(a.getAttribute('title')),
          reason: clean(after.match(/\(([^)]*)\)/)?.[1] ?? ''),
        });
      }
    }
  }

  return {stadium, referee, doubts: doubts.filter((d) => d.players.length)};
}

// ---------- Em risco de suspensão ----------

export interface SuspensionRisk {
  playerId: string;
  name: string;
  photo: string | null;
  position: string;
  age: string;
  /** cartões amarelos acumulados */
  yellows: string;
  games: string;
  /** média de cartões por jogo */
  perGame: string;
}

/**
 * Caixa "Em risco de suspensão" de `/-/sperrenundverletzungen/verein/{id}`.
 *
 * `parseClubAbsences` ignora esta caixa de propósito — para o Fantasy, quem
 * está pendurado ainda joga. Aqui é justamente o que se quer mostrar.
 */
export function parseSuspensionRisk(html: string): SuspensionRisk[] {
  const root = parse(html);
  const out: SuspensionRisk[] = [];

  for (const box of root.querySelectorAll('div.box')) {
    const head = clean(box.querySelector('h2, .content-box-headline')?.text);
    if (!/risco/i.test(head)) continue;

    for (const tr of box.querySelectorAll('table.items > tbody > tr')) {
      const link = tr.querySelector('a[href*="/profil/spieler/"]');
      const playerId = idFrom(link?.getAttribute('href'), 'spieler');
      if (!playerId) continue;
      const tds = tr.querySelectorAll(':scope > td');
      const inline = tds[0]?.querySelector('table.inline-table');
      const inlineRows = inline?.querySelectorAll(':scope > tr') ?? [];
      out.push({
        playerId,
        name: clean(link?.text),
        photo: img(inline?.querySelector('img')),
        position: clean(inlineRows[1]?.text),
        age: clean(tds[1]?.text),
        yellows: clean(tds[2]?.text),
        games: clean(tds[3]?.text),
        perGame: clean(tds[4]?.text),
      });
    }
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
  photo: string | null;
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
        photo: img(tr.querySelector('img.bilderrahmen-fixed')),
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
  photo: string | null;
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
      // o retrato fica na inline-table da coluna 1, não na célula do nome
      photo: img(tr.querySelector('img.bilderrahmen-fixed')),
      position: clean(tds[4].textContent),
      age: clean(tds[6].textContent),
      clubId: idFrom(clubLink?.getAttribute('href'), 'verein'),
      clubName: clean(clubLink?.getAttribute('title') ?? tds[7].textContent),
      clubCrest: img(tds[7].querySelector('img')),
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
        opponentCrest: img(tds[5].querySelector('img')),
        score,
        outcome: score ? outcomeFrom(score, home) : null,
      });
    }
  }

  return out;
}

export interface PlayerInjury {
  /** "25/26" */
  season: string;
  /** "Lesão na panturrilha", "Operado ao joelho"… */
  type: string;
  /** dd/mm/aaaa */
  from: string;
  /** dd/mm/aaaa; vazio quando a lesão ainda está em curso */
  until: string;
  /** "36 dias" */
  days: string;
  /** partidas que o jogador perdeu por causa dela */
  gamesMissed: string;
}

/**
 * Histórico de lesões de `/-/verletzungen/spieler/{id}`.
 *
 * A página tem duas tabelas `.items`: a primeira é lesão a lesão (6 colunas:
 * Temporada · Lesão · de · até · Dias · Jogos perdidos) e a segunda é o
 * resumo por temporada. Só a primeira interessa — daí ler apenas `[0]`.
 */
export function parsePlayerInjuries(html: string): PlayerInjury[] {
  const root = parse(html);
  const table = root.querySelectorAll('table.items')[0];
  if (!table) return [];

  const out: PlayerInjury[] = [];
  for (const tr of table.querySelectorAll('tbody > tr')) {
    const tds = tr.querySelectorAll(':scope > td');
    // linhas de cabeçalho e rodapé aparecem no mesmo tbody
    if (tds.length < 6) continue;

    const season = clean(tds[0]?.text);
    const type = clean(tds[1]?.text);
    if (!season || !type) continue;

    out.push({
      season,
      type,
      from: clean(tds[2]?.text),
      // "-" e "?" são como o Transfermarkt marca lesão sem data de retorno
      until: clean(tds[3]?.text).replace(/^[-?]$/, ''),
      days: clean(tds[4]?.text),
      gamesMissed: clean(tds[5]?.text),
    });
  }
  return out;
}
