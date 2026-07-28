import {Form, Link} from 'react-router';
import type {Route} from './+types/comparar';
import {
  getPlayer,
  getPlayerCareer,
  getPlayerMarketValueGraph,
  getPlayerPerformance,
  minutesPerGoal,
  searchAll,
  type PlayerCareer,
  type SeasonPerf,
} from '~/lib/tm';
import {euroToMillions} from '~/lib/format';
import {Avatar, EmptyNote, SectionTitle} from '~/components/ui';
import {AdSlot} from '~/components/AdSlot';
import {ProCard} from '~/components/ProCard';

export const MAX_PLAYERS = 3;

export const meta: Route.MetaFunction = ({data}) => {
  const names = data?.slots.map((s) => s.player.name) ?? [];
  return [
    {
      title: names.length
        ? `${names.join(' × ')} · Comparar · Players Place`
        : 'Comparar jogadores · Players Place',
    },
  ];
};

interface Slot {
  id: string;
  player: Awaited<ReturnType<typeof getPlayer>>;
  current: string;
  highest: string | null;
  career: PlayerCareer | null;
  latest: SeasonPerf | null;
}

export async function loader({request}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const ids = [...new Set(url.searchParams.getAll('p'))]
    .filter(Boolean)
    .slice(0, MAX_PLAYERS);

  const slots = (
    await Promise.all(
      ids.map(async (id): Promise<Slot | null> => {
        const [player, mv, career, performance] = await Promise.all([
          getPlayer(id).catch(() => null),
          getPlayerMarketValueGraph(id).catch(() => null),
          getPlayerCareer(id).catch(() => null),
          getPlayerPerformance(id).catch(() => []),
        ]);
        if (!player?.name) return null;
        return {
          id,
          player,
          current: mv?.current || player.marketValue || '—',
          highest: mv?.highest ?? null,
          career,
          latest: performance[0] ?? null,
        };
      }),
    )
  ).filter((s): s is Slot => s !== null);

  // só buscamos sugestões quando ainda há vaga na comparação
  const results =
    q && slots.length < MAX_PLAYERS
      ? await searchAll(q).catch(() => null)
      : null;

  return {slots, q, results};
}

/** monta /comparar?p=… preservando a ordem dos jogadores já escolhidos */
function compareHref(ids: string[]): string {
  const qs = ids.map((id) => `p=${encodeURIComponent(id)}`).join('&');
  return qs ? `/comparar?${qs}` : '/comparar';
}

type Better = 'higher' | 'lower' | null;

interface Metric {
  label: string;
  /** valor exibido por jogador */
  display: (s: Slot) => string;
  /** valor comparável; null quando não dá para ranquear */
  num?: (s: Slot) => number | null;
  better?: Better;
}

const idade = (s: Slot) =>
  s.player.info['Nasc./Idade']?.match(/\((\d+)\)/)?.[1] ?? null;

const fmtMin = (n: number) =>
  `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}'`;

const share = (c: PlayerCareer | null) =>
  c && c.total.games > 0 ? Math.round((c.total.starts / c.total.games) * 100) : null;

const GROUPS: {title: string; metrics: Metric[]}[] = [
  {
    title: 'Perfil',
    metrics: [
      {label: 'Clube atual', display: (s) => s.player.club?.name ?? '—'},
      {
        label: 'Posição',
        display: (s) => s.player.info['Posição']?.split(' - ').pop() ?? '—',
      },
      {
        label: 'Idade',
        display: (s) => (idade(s) ? `${idade(s)} anos` : '—'),
        num: (s) => (idade(s) ? Number(idade(s)) : null),
        better: null,
      },
      {label: 'Nacionalidade', display: (s) => s.player.info['Nacionalidade'] ?? '—'},
      {label: 'Altura', display: (s) => s.player.info['Altura'] ?? '—'},
      {label: 'Pé', display: (s) => s.player.info['Pé'] ?? '—'},
      {label: 'Contrato até', display: (s) => s.player.info['Contrato até'] ?? '—'},
    ],
  },
  {
    title: 'Valor de mercado',
    metrics: [
      {
        label: 'Valor atual',
        display: (s) => s.current,
        num: (s) => euroToMillions(s.current),
        better: 'higher',
      },
      {
        label: 'Maior valor da carreira',
        display: (s) => s.highest ?? '—',
        num: (s) => euroToMillions(s.highest),
        better: 'higher',
      },
    ],
  },
  {
    title: 'Carreira',
    metrics: [
      {
        label: 'Jogos',
        display: (s) => String(s.career?.total.games ?? '—'),
        num: (s) => s.career?.total.games ?? null,
        better: 'higher',
      },
      {
        label: 'Como titular',
        display: (s) => String(s.career?.total.starts ?? '—'),
        num: (s) => s.career?.total.starts ?? null,
        better: 'higher',
      },
      {
        label: 'Aproveitamento como titular',
        display: (s) => (share(s.career) === null ? '—' : `${share(s.career)}%`),
        num: (s) => share(s.career),
        better: 'higher',
      },
      {
        label: 'Gols',
        display: (s) => String(s.career?.total.goals ?? '—'),
        num: (s) => s.career?.total.goals ?? null,
        better: 'higher',
      },
      {
        label: 'Assistências',
        display: (s) => String(s.career?.total.assists ?? '—'),
        num: (s) => s.career?.total.assists ?? null,
        better: 'higher',
      },
      {
        label: 'Participações em gols por jogo',
        display: (s) => {
          const t = s.career?.total;
          if (!t?.games) return '—';
          return ((t.goals + t.assists) / t.games).toFixed(2);
        },
        num: (s) => {
          const t = s.career?.total;
          return t?.games ? (t.goals + t.assists) / t.games : null;
        },
        better: 'higher',
      },
      {
        label: 'Minutos em campo',
        display: (s) =>
          s.career ? fmtMin(s.career.total.minutes) : '—',
        num: (s) => s.career?.total.minutes ?? null,
        better: 'higher',
      },
      {
        label: 'Minutos por gol',
        display: (s) => {
          const mpg = s.career ? minutesPerGoal(s.career.total) : null;
          return mpg ? fmtMin(mpg) : '—';
        },
        num: (s) => (s.career ? minutesPerGoal(s.career.total) : null),
        better: 'lower',
      },
    ],
  },
  {
    title: 'Última temporada',
    metrics: [
      {label: 'Temporada', display: (s) => s.latest?.label ?? '—'},
      {
        label: 'Jogos',
        display: (s) => String(s.latest?.total.games ?? '—'),
        num: (s) => s.latest?.total.games ?? null,
        better: 'higher',
      },
      {
        label: 'Gols',
        display: (s) => String(s.latest?.total.goals ?? '—'),
        num: (s) => s.latest?.total.goals ?? null,
        better: 'higher',
      },
      {
        label: 'Assistências',
        display: (s) => String(s.latest?.total.assists ?? '—'),
        num: (s) => s.latest?.total.assists ?? null,
        better: 'higher',
      },
      {
        label: 'Minutos',
        display: (s) => (s.latest ? fmtMin(s.latest.total.minutes) : '—'),
        num: (s) => s.latest?.total.minutes ?? null,
        better: 'higher',
      },
    ],
  },
];

/** índices dos jogadores que lideram a métrica (vazio se não houver disputa) */
function leaders(metric: Metric, slots: Slot[]): Set<number> {
  const out = new Set<number>();
  if (!metric.better || !metric.num || slots.length < 2) return out;
  const values = slots.map((s) => metric.num!(s));
  const valid = values.filter((v): v is number => v !== null);
  if (valid.length < 2) return out;
  const best =
    metric.better === 'higher' ? Math.max(...valid) : Math.min(...valid);
  // empate geral não destaca ninguém
  if (valid.every((v) => v === best)) return out;
  values.forEach((v, i) => {
    if (v === best) out.add(i);
  });
  return out;
}

export default function Comparar({loaderData}: Route.ComponentProps) {
  const {slots, q, results} = loaderData;
  const ids = slots.map((s) => s.id);
  const full = slots.length >= MAX_PLAYERS;

  return (
    <div className="pp-in">
      <h1 className="font-display text-[26px] font-extrabold tracking-tight">
        Comparar jogadores
      </h1>
      <p className="mt-1 text-sm text-muted">
        Escolha até {MAX_PLAYERS} jogadores e veja valor de mercado, carreira e
        temporada lado a lado.
      </p>

      <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          <div className="grid gap-3 sm:grid-cols-3">
            {slots.map((s) => (
              <SlotCard
                key={s.id}
                slot={s}
                removeTo={compareHref(ids.filter((id) => id !== s.id))}
              />
            ))}
            {slots.length < MAX_PLAYERS ? (
              <EmptySlot count={MAX_PLAYERS - slots.length} />
            ) : null}
          </div>

          {!full ? (
            <section>
              <SectionTitle>Adicionar jogador</SectionTitle>
              <Form
                method="get"
                action="/comparar"
                className="flex max-w-xl gap-2"
              >
                {ids.map((id) => (
                  <input key={id} type="hidden" name="p" value={id} />
                ))}
                <input
                  type="search"
                  name="q"
                  defaultValue={q}
                  placeholder="Nome do jogador…"
                  className="h-11 min-w-0 flex-1 rounded-full border border-line bg-card px-5 text-[14px] outline-none placeholder:text-faint focus:border-pitch"
                />
                <button
                  type="submit"
                  className="flex h-11 shrink-0 items-center gap-2 rounded-full bg-pitch px-5 text-[14px] font-bold text-white transition-colors hover:bg-linkhover"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                  >
                    <path
                      d="M4 6h16M7 12h10M10 18h4"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                  Filtrar
                </button>
              </Form>

              {q ? (
                results?.players.length ? (
                  <div className="mt-3 max-w-xl overflow-hidden rounded-card border border-line bg-card">
                    {results.players.slice(0, 8).map((p) => {
                      const already = ids.includes(p.id);
                      return (
                        <Link
                          key={p.id}
                          to={already ? compareHref(ids) : compareHref([...ids, p.id])}
                          aria-disabled={already}
                          className={`flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0 ${
                            already ? 'opacity-50' : 'hover:bg-hoverrow'
                          }`}
                        >
                          <Avatar src={p.photo} name={p.name} size={34} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-bold">{p.name}</div>
                            <div className="truncate text-xs text-faint">{p.club}</div>
                          </div>
                          <span className="text-xs font-extrabold tabular-nums">
                            {already ? 'já incluído' : p.value || ''}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-3 max-w-xl">
                    <EmptyNote>
                      Nada encontrado para <strong>“{q}”</strong>.
                    </EmptyNote>
                  </div>
                )
              ) : null}
            </section>
          ) : null}

          {slots.length >= 2 ? (
            <ComparisonTable slots={slots} />
          ) : (
            <EmptyNote>
              {slots.length === 1
                ? 'Adicione mais um jogador para ver a comparação.'
                : 'Busque um jogador acima para começar a comparação.'}
            </EmptyNote>
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

function SlotCard({slot: s, removeTo}: {slot: Slot; removeTo: string}) {
  return (
    <div className="relative flex items-center gap-3 rounded-card border border-line bg-card p-4">
      <Avatar src={s.player.photo} name={s.player.name} size={44} />
      <div className="min-w-0 flex-1">
        <Link
          to={`/jogadores/${s.id}`}
          className="block truncate text-sm font-bold hover:text-pitch"
        >
          {s.player.name}
        </Link>
        <div className="truncate text-xs text-faint">
          {s.player.club?.name ?? '—'}
        </div>
      </div>
      <Link
        to={removeTo}
        aria-label={`Remover ${s.player.name} da comparação`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-soft hover:text-ink"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
      </Link>
    </div>
  );
}

function EmptySlot({count}: {count: number}) {
  return (
    <div className="flex items-center justify-center rounded-card border border-dashed border-addash p-4 text-center text-[13px] text-faint">
      {count === 1 ? 'Mais 1 vaga' : `Mais ${count} vagas`}
    </div>
  );
}

function ComparisonTable({slots}: {slots: Slot[]}) {
  return (
    <section>
      <SectionTitle>Comparação</SectionTitle>
      {/* Para o cabeçalho grudar, ele precisa de um contêiner de rolagem.
          Até md a tabela não cabe na tela: ela rola nos dois eixos dentro do
          próprio card (thead gruda em top-0). De md para cima nada rola —
          o card usa overflow-clip, que recorta os cantos sem virar contêiner
          de rolagem, e o thead gruda na viewport abaixo do header (62px). */}
      <div className="overflow-clip rounded-card border border-line bg-card">
        <div className="max-h-[70vh] overflow-auto md:max-h-none md:overflow-visible">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr>
                <th className="sticky top-0 left-0 z-30 border-b border-innerline bg-card px-4 py-3 text-left text-[11px] font-bold tracking-wide text-faint uppercase md:top-[62px]">
                  Indicador
                </th>
                {slots.map((s) => (
                  <th
                    key={s.id}
                    className="sticky top-0 z-20 min-w-[110px] border-b border-innerline bg-card px-3 py-3 text-center font-display text-sm font-extrabold md:top-[62px]"
                  >
                    <Link to={`/jogadores/${s.id}`} className="hover:text-pitch">
                      {s.player.name}
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) => (
                <GroupRows key={group.title} group={group} slots={slots} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-2 text-xs text-faint">
        Destaque em lima indica o melhor número da linha. Idade, posição e demais
        dados de perfil não são ranqueados.
      </p>
    </section>
  );
}

function GroupRows({
  group,
  slots,
}: {
  group: {title: string; metrics: Metric[]};
  slots: Slot[];
}) {
  return (
    <>
      <tr className="bg-soft">
        <td
          colSpan={slots.length + 1}
          className="sticky left-0 px-4 py-2 text-[11px] font-bold tracking-wide text-muted uppercase"
        >
          {group.title}
        </td>
      </tr>
      {group.metrics.map((m) => {
        const best = leaders(m, slots);
        return (
          <tr
            key={m.label}
            className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
          >
            <td className="sticky left-0 z-10 bg-card px-4 py-2.5 font-semibold text-muted">
              {m.label}
            </td>
            {slots.map((s, i) => (
              <td key={s.id} className="px-3 py-2.5 text-center">
                <span
                  className={
                    best.has(i)
                      ? 'rounded-md bg-lime px-2 py-0.5 font-extrabold text-ink'
                      : ''
                  }
                >
                  {m.display(s)}
                </span>
              </td>
            ))}
          </tr>
        );
      })}
    </>
  );
}
