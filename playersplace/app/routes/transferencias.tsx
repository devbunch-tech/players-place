import {Link} from 'react-router';
import type {Route} from './+types/transferencias';
import {getLatestTransfers, getTransferRecords} from '~/lib/tm';
import {Avatar, Crest, EmptyNote, FeeTag} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {SmartSearch} from '~/components/SmartSearch';

export const meta: Route.MetaFunction = () => [
  {title: 'Transferências · Players Place'},
];

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tab = url.searchParams.get('tab') === 'recordes' ? 'recordes' : 'ultimas';
  const transfers = await (tab === 'recordes'
    ? getTransferRecords()
    : getLatestTransfers()
  ).catch(() => []);
  return {tab, transfers: transfers.slice(0, 25)};
}

export default function Transferencias({loaderData}: Route.ComponentProps) {
  const {tab, transfers} = loaderData;
  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Transferências
      </h1>
      <p className="mt-1 text-sm text-muted">
        Movimentações confirmadas, direto do mercado.
      </p>

      <SmartSearch className="mt-5 max-w-xl" />

      {/* tab segmentada */}
      <div className="mt-5 inline-flex rounded-[13px] bg-chipbg p-1">
        <Link
          to="/transferencias"
          preventScrollReset
          className={`flex h-9 items-center rounded-[11px] px-4 text-[13px] font-bold transition-colors ${
            tab === 'ultimas' ? 'bg-card shadow-none' : 'text-muted'
          }`}
        >
          Últimas
        </Link>
        <Link
          to="/transferencias?tab=recordes"
          preventScrollReset
          className={`flex h-9 items-center rounded-[11px] px-4 text-[13px] font-bold transition-colors ${
            tab === 'recordes' ? 'bg-card shadow-none' : 'text-muted'
          }`}
        >
          Recordes históricos
        </Link>
      </div>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          {transfers.length === 0 ? (
            <EmptyNote>
              Não foi possível carregar as transferências agora — tente
              novamente em instantes.
            </EmptyNote>
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
                    <Crest src={t.from?.crest} name={t.from?.name ?? ''} size={16} />
                    <span className="max-w-[120px] truncate text-muted">
                      {t.from?.name || '—'}
                    </span>
                    <span className="text-faint">→</span>
                    <Crest src={t.to?.crest} name={t.to?.name ?? ''} size={16} />
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
