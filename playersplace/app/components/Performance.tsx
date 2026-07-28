import {useState} from 'react';
import {Link} from 'react-router';
import type {SeasonPerf} from '~/lib/tm';
import {findLeague} from '~/lib/tm/leagues';
import {SectionTitle, StatTile} from '~/components/ui';

const fmtMin = (n: number) =>
  `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}'`;

/**
 * Desempenho por temporada — chips de temporada, 4 stat-tiles
 * (JOGOS/GOLS/ASSIST./MIN., como no handoff) e tabela por competição.
 */
export function PerformancePanel({
  seasons,
  isGoalkeeper = false,
}: {
  seasons: SeasonPerf[];
  isGoalkeeper?: boolean;
}) {
  const [idx, setIdx] = useState(0);
  if (!seasons.length) return null;
  const season = seasons[Math.min(idx, seasons.length - 1)];
  const t = season.total;

  return (
    <section>
      <SectionTitle
        action={
          <div className="flex gap-1.5 overflow-x-auto">
            {seasons.map((s, i) => (
              <button
                key={s.seasonId}
                type="button"
                onClick={() => setIdx(i)}
                className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold whitespace-nowrap transition-colors tabular-nums ${
                  i === idx
                    ? 'bg-ink text-white'
                    : 'border border-line bg-card text-muted hover:bg-hoverrow'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        }
      >
        Desempenho
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Jogos" value={String(t.games)} />
        {isGoalkeeper ? (
          <StatTile label="Gols sofridos" value={String(t.conceded)} />
        ) : (
          <StatTile label="Gols" value={String(t.goals)} />
        )}
        {isGoalkeeper ? (
          <StatTile label="Como titular" value={String(t.starts)} />
        ) : (
          <StatTile label="Assistências" value={String(t.assists)} />
        )}
        <StatTile label="Minutos" value={fmtMin(t.minutes)} />
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] text-[13px] tabular-nums">
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
                <th className="px-3 py-2.5 text-center">Am.</th>
                <th className="px-3 py-2.5 text-center">Verm.</th>
                <th className="px-4 py-2.5 text-right">Min.</th>
              </tr>
            </thead>
            <tbody>
              {season.rows.map((c) => {
                const league = findLeague(c.competitionId);
                return (
                  <tr
                    key={c.competitionId}
                    className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                  >
                    <td className="px-4 py-2.5 font-semibold">
                      {league ? (
                        <Link
                          to={`/competicoes/${league.code}`}
                          className="hover:text-pitch"
                        >
                          {c.name}
                        </Link>
                      ) : (
                        c.name
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">{c.games}</td>
                    {isGoalkeeper ? (
                      <td className="px-3 py-2.5 text-center">{c.conceded}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-center">{c.goals || '—'}</td>
                        <td className="px-3 py-2.5 text-center">{c.assists || '—'}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-center text-muted">{c.yellow || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-muted">{c.red || '—'}</td>
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
                <td className="px-3 py-2.5 text-center">{t.yellow}</td>
                <td className="px-3 py-2.5 text-center">{t.red}</td>
                <td className="px-4 py-2.5 text-right">{fmtMin(t.minutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
