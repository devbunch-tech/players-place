import {Link} from 'react-router';
import {
  clubCrest,
  minutesPerGoal,
  type CareerRow,
  type NationalTeamRow,
  type PlayerCareer,
} from '~/lib/tm';
import {findLeague} from '~/lib/tm/leagues';
import {Crest, LeagueLogo, SectionTitle} from '~/components/ui';

const fmtMin = (n: number) =>
  `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}'`;

/** cabeçalho compacto usado nos quadros da coluna lateral */
function BoxTitle({children}: {children: React.ReactNode}) {
  return (
    <h2 className="mb-3 font-display text-base font-extrabold tracking-tight">
      {children}
    </h2>
  );
}

/**
 * "Leistungsdaten der gesamten Karriere" — números de toda a carreira
 * somados por competição, com minutos por gol e minutos em campo.
 */
export function CareerTotalsTable({
  career,
  isGoalkeeper = false,
}: {
  career: PlayerCareer;
  isGoalkeeper?: boolean;
}) {
  if (!career.competitions.length) return null;
  const t = career.total;

  return (
    <section>
      <SectionTitle>Carreira completa</SectionTitle>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Competição</th>
                <th className="px-3 py-2.5 text-center">J</th>
                {isGoalkeeper ? (
                  <th className="px-3 py-2.5 text-center">GS</th>
                ) : (
                  <>
                    <th className="px-3 py-2.5 text-center">Gols</th>
                    <th className="px-3 py-2.5 text-center">Assist.</th>
                  </>
                )}
                <th className="px-3 py-2.5 text-center">Min./gol</th>
                <th className="px-4 py-2.5 text-right">Minutos</th>
              </tr>
            </thead>
            <tbody>
              {career.competitions.map((c) => {
                const mpg = minutesPerGoal(c);
                return (
                  <tr
                    key={c.key}
                    className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                  >
                    <td className="px-4 py-2.5">
                      <CompetitionCell id={c.key} name={c.name} />
                    </td>
                    <td className="px-3 py-2.5 text-center font-semibold">
                      {c.games}
                    </td>
                    {isGoalkeeper ? (
                      <td className="px-3 py-2.5 text-center">{c.conceded || '—'}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-center">{c.goals || '—'}</td>
                        <td className="px-3 py-2.5 text-center">{c.assists || '—'}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-center text-muted">
                      {mpg ? fmtMin(mpg) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">{fmtMin(c.minutes)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-soft font-extrabold">
                <td className="px-4 py-2.5">Total</td>
                <td className="px-3 py-2.5 text-center">{t.games}</td>
                {isGoalkeeper ? (
                  <td className="px-3 py-2.5 text-center">{t.conceded}</td>
                ) : (
                  <>
                    <td className="px-3 py-2.5 text-center">{t.goals}</td>
                    <td className="px-3 py-2.5 text-center">{t.assists}</td>
                  </>
                )}
                <td className="px-3 py-2.5 text-center">
                  {minutesPerGoal(t) ? fmtMin(minutesPerGoal(t)!) : '—'}
                </td>
                <td className="px-4 py-2.5 text-right">{fmtMin(t.minutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}

/** nome da competição com logo — vira link quando a liga existe na plataforma */
function CompetitionCell({id, name}: {id: string; name: string}) {
  const league = findLeague(id);
  const label = (
    <span className="flex items-center gap-2">
      <LeagueLogo code={id} name={name} size={18} />
      <span className="font-semibold">{name}</span>
    </span>
  );
  return league ? (
    <Link to={`/competicoes/${league.code}`} className="hover:text-pitch">
      {label}
    </Link>
  ) : (
    label
  );
}

/** "Desempenho por clube" — totais da carreira agrupados por clube */
export function CareerByClub({rows}: {rows: CareerRow[]}) {
  if (!rows.length) return null;
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <BoxTitle>Desempenho por clube</BoxTitle>
      <MiniTable
        rows={rows.map((c) => ({
          key: c.key,
          icon: <Crest src={clubCrest(c.key)} name={c.name} size={18} />,
          name: c.name,
          to: `/clubes/${c.key}`,
          values: [c.games, c.goals, c.assists],
        }))}
      />
    </section>
  );
}

/** colunas da tabela enxuta: jogos, gols, assistências */
const MINI_COLS = ['J', 'G', 'A'];

function MiniTable({
  rows,
}: {
  rows: {
    key: string;
    icon: React.ReactNode;
    name: string;
    to?: string;
    values: number[];
  }[];
}) {
  return (
    <table className="w-full text-[13px] tabular-nums">
      <thead>
        <tr className="text-[10px] font-bold tracking-wide text-faint uppercase">
          <th className="pb-2 text-left">&nbsp;</th>
          {MINI_COLS.map((c) => (
            <th key={c} className="w-9 pb-2 text-center">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-innerline">
            <td className="py-2 pr-2">
              <span className="flex min-w-0 items-center gap-2">
                {r.icon}
                {r.to ? (
                  <Link
                    to={r.to}
                    className="truncate font-semibold hover:text-pitch"
                  >
                    {r.name}
                  </Link>
                ) : (
                  <span className="truncate font-semibold">{r.name}</span>
                )}
              </span>
            </td>
            {r.values.map((v, i) => (
              <td
                key={MINI_COLS[i]}
                className={`py-2 text-center ${i === 0 ? 'font-semibold' : 'text-muted'}`}
              >
                {v || '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** "Carreira na seleção" — jogos e gols por seleção, da atual às de base */
export function NationalTeamCareer({rows}: {rows: NationalTeamRow[]}) {
  if (!rows.length) return null;
  return (
    <section className="rounded-card border border-line bg-card p-4">
      <BoxTitle>Carreira na seleção</BoxTitle>
      <ul className="space-y-px">
        {rows.map((n) => (
          <li
            key={n.clubId}
            className={`flex items-center gap-2.5 border-t border-innerline py-2 first:border-t-0 ${
              n.current ? '' : 'opacity-80'
            }`}
          >
            <Crest src={clubCrest(n.clubId)} name={n.name} size={20} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">
                  {n.name}
                </span>
                {n.isCaptain ? (
                  <span
                    title="Capitão"
                    className="rounded bg-lime px-1 text-[9px] font-extrabold text-ink"
                  >
                    C
                  </span>
                ) : null}
              </div>
              {n.debut ? (
                <div className="text-[10px] text-faint tabular-nums">
                  Estreia em {n.debut}
                  {n.shirtNumber ? ` · camisa ${n.shirtNumber}` : ''}
                </div>
              ) : null}
            </div>
            <div className="shrink-0 text-right tabular-nums">
              <div className="text-[13px] font-extrabold">{n.games}</div>
              <div className="text-[10px] text-faint">
                {n.goals} {n.goals === 1 ? 'gol' : 'gols'}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
