import {Form, Link, useSubmit} from 'react-router';
import type {Route} from './+types/transferencias';
import {
  clubCrest,
  getExpiringContracts,
  getFreeAgents,
  getLatestTransfers,
  getTransferRecords,
  MARKET_MIN_VALUES,
  type MarketList,
  type RumorClub,
} from '~/lib/tm';
import {Avatar, Crest, EmptyNote, FeeTag, Pager} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {SmartSearch} from '~/components/SmartSearch';
import {breadcrumbLd, canonical, seo} from '~/lib/seo';

const TABS = [
  {id: 'ultimas', label: 'Últimas'},
  {id: 'recordes', label: 'Recordes históricos'},
  {id: 'contratos', label: 'Contratos a terminar'},
  {id: 'livres', label: 'Livres para assinar'},
] as const;

type Tab = (typeof TABS)[number]['id'];

const isTab = (v: string | null): v is Tab => TABS.some((t) => t.id === v);

const SUBTITLE: Record<Tab, string> = {
  ultimas: 'Movimentações confirmadas, direto do mercado.',
  recordes: 'As maiores negociações da história do futebol.',
  contratos:
    'Jogadores com contrato chegando ao fim — os alvos da próxima janela.',
  livres: 'Jogadores sem contrato, livres para assinar com qualquer clube.',
};

const TITLE: Record<Tab, string> = {
  ultimas: 'Transferências — últimas movimentações do mercado',
  recordes: 'Recordes de transferências — as maiores negociações da história',
  contratos: 'Contratos a terminar — jogadores com vínculo chegando ao fim',
  livres: 'Jogadores livres no mercado — sem contrato e livres para assinar',
};

const DESCRIPTION: Record<Tab, string> = {
  ultimas:
    'Todas as transferências confirmadas do futebol mundial, com clube de origem, clube de destino e valor pago em cada negociação.',
  recordes:
    'As maiores transferências da história do futebol, do recorde mundial para baixo, com valor, clubes envolvidos e ano da negociação.',
  contratos:
    'Jogadores com contrato chegando ao fim: os alvos mais prováveis da próxima janela, com clube atual, idade e valor de mercado.',
  livres:
    'Jogadores sem contrato, livres para assinar com qualquer clube sem custo de transferência. Posição, idade e valor de mercado.',
};

export const meta: Route.MetaFunction = ({data}) => {
  const tab: Tab = data?.tab ?? 'ultimas';
  // cada aba é uma lista diferente e merece indexação própria; a paginação
  // (?page=) não entra, para as páginas 2+ não competirem com a primeira
  const url = canonical(
    '/transferencias',
    tab === 'ultimas' ? {} : {tab},
  );

  return [
    ...seo({title: TITLE[tab], description: DESCRIPTION[tab], url}),
    breadcrumbLd([
      {name: 'Início', path: '/'},
      {name: 'Transferências', path: '/transferencias'},
      ...(tab === 'ultimas'
        ? []
        : [
            {
              name: TABS.find((t) => t.id === tab)?.label ?? tab,
              path: `/transferencias?tab=${tab}`,
            },
          ]),
    ]),
  ];
};

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const raw = url.searchParams.get('tab');
  const tab: Tab = isTab(raw) ? raw : 'ultimas';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const nac = url.searchParams.get('nac');
  const pos = url.searchParams.get('pos');
  const valor = url.searchParams.get('valor');

  if (tab === 'contratos' || tab === 'livres') {
    const market = await (
      tab === 'contratos'
        ? getExpiringContracts(page, nac, valor)
        : getFreeAgents(page, nac, pos, valor)
    ).catch(() => null);
    return {tab, transfers: [], market};
  }

  const transfers = await (
    tab === 'recordes' ? getTransferRecords() : getLatestTransfers()
  ).catch(() => []);
  return {tab, transfers: transfers.slice(0, 25), market: null};
}

export default function Transferencias({loaderData}: Route.ComponentProps) {
  const {tab, transfers, market} = loaderData;
  const isMarket = tab === 'contratos' || tab === 'livres';
  const empty = isMarket ? !market?.rows.length : transfers.length === 0;

  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Transferências
      </h1>
      <p className="mt-1 text-sm text-muted">{SUBTITLE[tab]}</p>

      <SmartSearch className="mt-5 max-w-xl" />

      {/* tab segmentada */}
      <div className="-mx-4 mt-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="inline-flex rounded-[13px] bg-chipbg p-1">
          {TABS.map((t) => (
            <Link
              key={t.id}
              to={
                t.id === 'ultimas'
                  ? '/transferencias'
                  : `/transferencias?tab=${t.id}`
              }
              preventScrollReset
              className={`flex h-9 items-center rounded-[11px] px-4 text-[13px] font-bold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-card shadow-none' : 'text-muted'
              }`}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {isMarket && market ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-faint">
                {market.title}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                {/* a origem só oferece o filtro de posição na lista de livres */}
                {tab === 'livres' ? (
                  <PositionFilter tab={tab} list={market} />
                ) : null}
                <NationalityFilter tab={tab} list={market} />
                <ValueFilter tab={tab} list={market} />
              </div>
            </div>
          ) : null}

          {isMarket && market?.truncated ? (
            <p className="mb-3 text-[12px] text-faint">
              A lista de origem é longa demais para ser varrida inteira: o corte
              olhou os {market.total} jogadores mais valiosos e pode haver
              outros abaixo deles dentro desta faixa. Um valor mínimo mais alto
              devolve a lista completa.
            </p>
          ) : null}

          {isMarket && market && !market.rows.length ? (
            <EmptyNote>
              Nenhum jogador encontrado com esses filtros.
            </EmptyNote>
          ) : empty ? (
            <EmptyNote>
              Não foi possível carregar a lista agora — tente novamente em
              instantes.
            </EmptyNote>
          ) : isMarket ? (
            <MarketTable list={market!} tab={tab} />
          ) : (
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {transfers.map((t, i) => (
                <div
                  key={`${t.id}-${i}`}
                  className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-innerline px-4 py-3 last:border-b-0 hover:bg-hoverrow sm:flex-nowrap"
                >
                  <Link
                    to={`/jogadores/${t.id}`}
                    className="flex w-[180px] min-w-0 shrink-0 items-center gap-2.5"
                  >
                    <Avatar src={t.photo} name={t.name} size={36} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold hover:text-pitch">
                        {t.name}
                      </span>
                      <span className="block truncate text-xs text-faint">
                        {t.position}
                      </span>
                    </span>
                  </Link>
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-xs">
                    <Crest
                      src={t.from?.crest}
                      name={t.from?.name ?? ''}
                      size={16}
                    />
                    <span className="max-w-[120px] truncate text-muted">
                      {t.from?.name || '—'}
                    </span>
                    <span className="text-faint">→</span>
                    <Crest
                      src={t.to?.crest}
                      name={t.to?.name ?? ''}
                      size={16}
                    />
                    <span className="max-w-[120px] truncate font-semibold text-ink">
                      {t.to?.name || '—'}
                    </span>
                  </div>
                  <div className="ml-auto shrink-0">
                    <FeeTag fee={t.fee} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <aside className="min-w-0 space-y-6">
          <AdSlot />
          <ProCard />
        </aside>
      </div>
    </div>
  );
}

/**
 * As nacionalidades vêm do próprio `select` da página de origem — cada lista
 * oferece as suas, então não há tabela de países para manter aqui.
 */
function NationalityFilter({tab, list}: {tab: Tab; list: MarketList}) {
  const submit = useSubmit();
  if (!list.countries.length) return null;
  return (
    <Form method="get" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      {/* trocar de país não pode derrubar os outros filtros já escolhidos */}
      {list.position ? (
        <input type="hidden" name="pos" value={list.position} />
      ) : null}
      {list.minValue ? (
        <input type="hidden" name="valor" value={list.minValue} />
      ) : null}
      <label htmlFor="nac" className="text-[13px] font-semibold text-muted">
        Nacionalidade
      </label>
      {/* sem `page`: trocar de país sempre volta para a primeira página */}
      <select
        id="nac"
        name="nac"
        defaultValue={list.country ?? ''}
        onChange={(e) => void submit(e.currentTarget.form)}
        className="h-10 max-w-[210px] rounded-btn border border-line bg-paper px-3 text-sm font-semibold"
      >
        <option value="">Todas</option>
        {list.countries.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </Form>
  );
}

/**
 * As posições também vêm do `select` da página de origem (a "posição
 * detalhada"), então a lista acompanha o que o Transfermarkt oferece — inclusive
 * os agrupamentos dele, "Laterais" e "Extremos".
 */
function PositionFilter({tab, list}: {tab: Tab; list: MarketList}) {
  const submit = useSubmit();
  if (!list.positions.length) return null;
  return (
    <Form method="get" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      {list.country ? (
        <input type="hidden" name="nac" value={list.country} />
      ) : null}
      {list.minValue ? (
        <input type="hidden" name="valor" value={list.minValue} />
      ) : null}
      {/* sem `page`: trocar de posição sempre volta para a primeira página */}
      <label htmlFor="pos" className="text-[13px] font-semibold text-muted">
        Posição
      </label>
      <select
        id="pos"
        name="pos"
        defaultValue={list.position ?? ''}
        onChange={(e) => void submit(e.currentTarget.form)}
        className="h-10 max-w-[210px] rounded-btn border border-line bg-paper px-3 text-sm font-semibold"
      >
        <option value="">Todas</option>
        {list.positions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </Form>
  );
}

/**
 * O corte por valor de mercado.
 *
 * Diferente dos outros dois, este filtro não existe na origem: o Transfermarkt
 * não oferece campo de valor em nenhuma das duas listas. Ele é aplicado sobre
 * as linhas que buscamos, e por isso é de PISO e não de faixa — a explicação
 * inteira está em `MARKET_MIN_VALUES`.
 */
function ValueFilter({tab, list}: {tab: Tab; list: MarketList}) {
  const submit = useSubmit();
  return (
    <Form method="get" className="flex items-center gap-2">
      <input type="hidden" name="tab" value={tab} />
      {list.country ? (
        <input type="hidden" name="nac" value={list.country} />
      ) : null}
      {list.position ? (
        <input type="hidden" name="pos" value={list.position} />
      ) : null}
      <label htmlFor="valor" className="text-[13px] font-semibold text-muted">
        Valor mínimo
      </label>
      {/* sem `page`: mexer no corte sempre volta para a primeira página */}
      <select
        id="valor"
        name="valor"
        defaultValue={list.minValue ?? ''}
        onChange={(e) => void submit(e.currentTarget.form)}
        className="h-10 max-w-[210px] rounded-btn border border-line bg-paper px-3 text-sm font-semibold"
      >
        <option value="">Qualquer valor</option>
        {MARKET_MIN_VALUES.map((v) => (
          <option key={v} value={v}>
            {`€ ${v} mi`}
          </option>
        ))}
      </select>
    </Form>
  );
}

/** quantos clubes interessados cabem antes de virar "+N" */
const MAX_INTERESTED = 4;

/**
 * Quem está de olho no jogador, em linha própria abaixo do jogador. Espremer
 * isto ao lado do clube atual truncava os nomes a duas letras — e o nome do
 * clube é justamente a informação. O percentual é a "avaliação dos usuários"
 * do Transfermarkt, não uma probabilidade oficial.
 *
 * Se a consulta de rumores falhar, sobra a contagem que a lista já trazia.
 */
function InterestedClubs({clubs, count}: {clubs: RumorClub[]; count: number}) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 pl-[46px] text-[11px]">
      <span className="font-bold tracking-[0.08em] text-faint uppercase">
        {clubs.length ? 'Interesse' : `${count} rumor${count > 1 ? 'es' : ''}`}
      </span>
      {clubs.slice(0, MAX_INTERESTED).map((c) => (
        <span
          key={c.id ?? c.name}
          className="flex min-w-0 items-center gap-1.5 rounded-md bg-chipbg px-2 py-1 font-bold text-muted"
        >
          <Crest src={c.crest} name={c.name} size={13} />
          <span className="truncate">{c.name}</span>
          {c.probability ? (
            <span className="whitespace-nowrap text-faint tabular-nums">
              {c.probability}
            </span>
          ) : null}
        </span>
      ))}
      {clubs.length > MAX_INTERESTED ? (
        <span className="text-faint tabular-nums">
          +{clubs.length - MAX_INTERESTED}
        </span>
      ) : null}
    </div>
  );
}

function MarketTable({list, tab}: {list: MarketList; tab: Tab}) {
  const query = (p: number) => {
    const qs = new URLSearchParams({tab});
    if (list.country) qs.set('nac', list.country);
    if (list.position) qs.set('pos', list.position);
    if (list.minValue) qs.set('valor', String(list.minValue));
    if (p > 1) qs.set('page', String(p));
    return `/transferencias?${qs.toString()}`;
  };
  return (
    <>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {list.rows.map((p) => (
          <div
            key={p.id}
            className="border-b border-innerline px-4 py-3 last:border-b-0 hover:bg-hoverrow"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
              <Link
                to={`/jogadores/${p.id}`}
                className="flex min-w-0 flex-1 items-center gap-2.5 sm:w-[230px] sm:flex-none"
              >
                <Avatar src={p.photo} name={p.name} size={36} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold hover:text-pitch">
                    {p.name}
                  </span>
                  <span className="block truncate text-xs text-faint">
                    {[p.position, p.age && `${p.age} anos`]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>

              {/* no mobile o clube desce para a própria linha */}
              <div className="order-last flex w-full min-w-0 items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-xs sm:order-none sm:w-auto sm:flex-1">
                {p.club ? (
                  <>
                    <Crest
                      src={p.club.id ? clubCrest(p.club.id) : p.club.crest}
                      name={p.club.name}
                      size={16}
                    />
                    <span className="truncate font-semibold text-ink">
                      {p.club.name}
                    </span>
                    {p.league ? (
                      <span className="hidden max-w-[130px] truncate text-muted sm:block">
                        {p.league.name}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="truncate text-muted">
                    {p.since ? `Livre desde ${p.since}` : 'Sem clube'}
                  </span>
                )}
              </div>

              <div className="ml-auto shrink-0">
                <FeeTag fee={p.value} />
              </div>
            </div>

            {tab === 'contratos' && Number(p.rumors) > 0 ? (
              <InterestedClubs
                clubs={p.interested ?? []}
                count={Number(p.rumors)}
              />
            ) : null}
          </div>
        ))}
      </div>

      <Pager page={list.page} totalPages={list.totalPages} href={query} />
    </>
  );
}
