import {Link} from 'react-router';
import type {Route} from './+types/_index';
import {SmartSearch} from '~/components/SmartSearch';
import {LEAGUES} from '~/lib/tm/leagues';
import {getGlobalTopPlayers, getLatestTransfers} from '~/lib/tm';
import {euroToMillions, todayLabel} from '~/lib/format';
import {Avatar, Crest, FeeTag, LeagueLogo, SectionTitle} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';
import {
  SITE_DESCRIPTION,
  canonical,
  organizationLd,
  seo,
  websiteLd,
} from '~/lib/seo';

export const meta: Route.MetaFunction = () => [
  ...seo({
    title: 'Players Place — o mercado da bola em números',
    description: SITE_DESCRIPTION,
    url: canonical('/'),
    brandInTitle: true,
  }),
  // identidade da marca e caixa de busca do Google: só aqui, para não
  // repetir o mesmo bloco em todas as páginas do site
  organizationLd(),
  websiteLd(),
];

export async function loader() {
  const [top, transfers] = await Promise.all([
    getGlobalTopPlayers().catch(() => []),
    getLatestTransfers().catch(() => []),
  ]);
  const impact = [...transfers]
    .filter((t) => t.fee.includes('€'))
    .sort((a, b) => (euroToMillions(b.fee) ?? 0) - (euroToMillions(a.fee) ?? 0))
    .slice(0, 6);
  return {
    top5: top.slice(0, 5),
    impact,
    recent: transfers.slice(0, 4),
    today: todayLabel(),
  };
}

export default function Home({loaderData}: Route.ComponentProps) {
  const {top5, impact, recent, today} = loaderData;
  return (
    <div className="pp-in">
      {/* hero */}
      <section className="pt-2 pb-8">
        <p className="flex items-center gap-2 text-xs font-semibold text-muted">
          <span className="h-2 w-2 rounded-full bg-down pp-pulse" />
          Janela de transferências aberta · {today}
        </p>
        <h1 className="mt-3 max-w-2xl font-display text-[34px] leading-[1.05] font-extrabold tracking-tight sm:text-[44px]">
          O mercado da bola que você{' '}
          <span className="rounded-md bg-lime px-1.5">entende</span>.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
          Valores de mercado, elencos e transferências de 15 ligas — direto da
          fonte, em português.
        </p>
        <SmartSearch className="mt-5 max-w-xl" />
      </section>

      {/* ligas */}
      <section className="pb-10">
        <SectionTitle
          action={
            <Link to="/competicoes" className="text-[13px] font-semibold text-pitch hover:text-linkhover">
              Ver todas
            </Link>
          }
        >
          Ligas na plataforma
        </SectionTitle>
        {/* scroll-pl-4: sem isto o scroll-snap alinha o 1º card com a borda do
            container e ignora o px-4, rolando 16px sozinho no carregamento —
            os cards ficavam desalinhados do título da seção */}
        <div className="-mx-4 flex snap-x scroll-pl-4 gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:scroll-pl-0 sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-5">
          {LEAGUES.map((l) => (
            <Link
              key={l.code}
              to={`/competicoes/${l.code}`}
              className="w-[172px] shrink-0 snap-start rounded-card border border-line bg-card p-4 transition-colors hover:bg-hoverrow sm:w-auto"
            >
              <LeagueLogo
                code={l.code}
                name={l.name}
                size={40}
                fallbackColor={l.color}
                fallbackShort={l.short}
              />
              <div className="mt-3 text-[13px] leading-tight font-bold">{l.name}</div>
              <div className="mt-0.5 text-xs text-faint">
                {l.flag} {l.country}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* conteúdo principal + sidebar */}
      <div className="grid gap-10 lg:grid-cols-[1fr_340px]">
        {/* min-w-0: item de grid tem min-width:auto e não encolhe abaixo da
            largura intrínseca do conteúdo — sem isto uma tabela larga estica
            a coluna e dá scroll horizontal na página inteira no mobile */}
        <div className="min-w-0 space-y-10">
          <section>
            <SectionTitle
              action={
                <Link to="/transferencias" className="text-[13px] font-semibold text-pitch hover:text-linkhover">
                  Ver todas
                </Link>
              }
            >
              Transferências de impacto
            </SectionTitle>
            <div className="overflow-hidden rounded-card border border-line bg-card">
              {impact.length === 0 ? (
                <p className="p-6 text-sm text-muted">
                  Sem transferências carregadas agora — tente novamente em
                  instantes.
                </p>
              ) : (
                impact.map((t) => (
                  <Link
                    key={`${t.id}-${t.to?.id}`}
                    to={`/jogadores/${t.id}`}
                    className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0 hover:bg-hoverrow"
                  >
                    <Avatar src={t.photo} name={t.name} size={38} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{t.name}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                        <Crest src={t.from?.crest} name={t.from?.name ?? ''} size={14} />
                        <span className="max-w-[90px] truncate">{t.from?.name}</span>
                        <span className="text-faint">→</span>
                        <Crest src={t.to?.crest} name={t.to?.name ?? ''} size={14} />
                        <span className="max-w-[90px] truncate">{t.to?.name}</span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <FeeTag fee={t.fee} />
                      <span className="text-[9px] font-bold tracking-widest text-up uppercase">
                        Confirmada
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>

          <AdSlot />

          <section>
            <SectionTitle>Movimentações recentes</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              {recent.map((t) => (
                <Link
                  key={`${t.id}-r`}
                  to={`/jogadores/${t.id}`}
                  className="rounded-card border border-line bg-card p-4 hover:bg-hoverrow"
                >
                  <div className="flex items-center gap-3">
                    <Avatar src={t.photo} name={t.name} size={34} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold">{t.name}</div>
                      <div className="text-xs text-faint">{t.position}</div>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2 rounded-full bg-soft px-3 py-1.5 text-xs text-muted">
                    <span className="truncate">{t.from?.name}</span>
                    <span className="text-faint">→</span>
                    <span className="truncate font-semibold text-ink">{t.to?.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        </div>

        <aside className="min-w-0 space-y-6">
          <section className="rounded-card border border-line bg-card p-4">
            <div className="mb-2 flex items-end justify-between">
              <h2 className="font-display text-base font-extrabold tracking-tight">
                Top 5 valores
              </h2>
              <Link to="/valores" className="text-xs font-semibold text-pitch hover:text-linkhover">
                Ranking completo
              </Link>
            </div>
            {top5.map((p, i) => (
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
                  <div className="truncate text-[13px] font-bold">{p.name}</div>
                  <div className="truncate text-xs text-faint">{p.club?.name}</div>
                </div>
                <span className="text-[13px] font-extrabold tabular-nums">{p.value}</span>
              </Link>
            ))}
          </section>
          <ProCard />
          <AdSlot compact />
        </aside>
      </div>
    </div>
  );
}
