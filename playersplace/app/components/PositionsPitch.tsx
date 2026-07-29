import type {PositionPerf} from '~/lib/tm';
import {positionMeta} from '~/lib/tm/positions';
import {SectionTitle} from '~/components/ui';

/**
 * "Posições em que jogou" — campo em verde-campo com marcadores lima
 * sobre as posições ocupadas na carreira, seguido da tabela de números.
 */
export function PositionsPitch({
  positions,
  isGoalkeeper = false,
}: {
  positions: PositionPerf[];
  isGoalkeeper?: boolean;
}) {
  const marks = positions
    .map((p) => ({perf: p, meta: positionMeta(p.positionId)}))
    .filter((m): m is {perf: PositionPerf; meta: NonNullable<ReturnType<typeof positionMeta>>} =>
      Boolean(m.meta),
    );
  if (!marks.length) return null;

  const most = Math.max(...marks.map((m) => m.perf.games));

  return (
    <section>
      <SectionTitle>Posições em que jogou</SectionTitle>

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="p-4">
          <div className="relative mx-auto aspect-[3/4] w-full max-w-[380px] overflow-hidden rounded-[12px] bg-pitch">
            <PitchMarkings />
            {marks.map(({perf, meta}) => {
              const main = perf.games === most;
              return (
                <div
                  key={meta.id}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{left: `${meta.x}%`, top: `${meta.y}%`}}
                >
                  <div
                    className={`relative flex h-10 w-10 items-center justify-center rounded-full font-display text-xs font-extrabold ${
                      main
                        ? 'bg-lime text-ink ring-[3px] ring-lime/20'
                        : 'bg-white/85 text-pitch ring-[3px] ring-white/10'
                    }`}
                    title={`${meta.name} · ${perf.games} jogos`}
                  >
                    {meta.short}
                    <span className="absolute -top-1.5 -right-2 rounded-full bg-ink px-1.5 py-px text-[10px] font-bold text-white tabular-nums">
                      {perf.games}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="border-t border-innerline">
          <table className="w-full text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[10px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Posição</th>
                <th className="w-12 px-2 py-2.5 text-center">Jogos</th>
                {isGoalkeeper ? (
                  <>
                    <th className="w-12 px-2 py-2.5 text-center" title="Gols sofridos">
                      GS
                    </th>
                    <th className="w-12 px-4 py-2.5 text-right" title="Jogos sem sofrer gol">
                      CS
                    </th>
                  </>
                ) : (
                  <>
                    <th className="w-12 px-2 py-2.5 text-center">Gols</th>
                    <th className="w-14 px-4 py-2.5 text-right">Assist.</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {marks.map(({perf, meta}) => (
                <tr
                  key={meta.id}
                  className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                >
                  <td className="px-4 py-2.5 font-semibold text-pitch">
                    {meta.name}
                  </td>
                  <td className="px-2 py-2.5 text-center font-semibold">
                    {perf.games}
                  </td>
                  {isGoalkeeper ? (
                    <>
                      <td className="px-2 py-2.5 text-center text-muted">{perf.conceded || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{perf.cleanSheets || '—'}</td>
                    </>
                  ) : (
                    <>
                      <td className="px-2 py-2.5 text-center text-muted">{perf.goals || '—'}</td>
                      <td className="px-4 py-2.5 text-right text-muted">{perf.assists || '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/** linhas do campo — puramente decorativas. Reusadas pelo Game Fantasy. */
export function PitchMarkings() {
  const line = 'absolute border-white/20';
  return (
    <div aria-hidden className="absolute inset-0">
      <div className={`${line} inset-3 rounded-[6px] border`} />
      <div className={`${line} top-1/2 right-3 left-3 border-t`} />
      <div className={`${line} top-1/2 left-1/2 aspect-square w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full border`} />
      {/* grandes áreas */}
      <div className={`${line} bottom-3 left-1/2 h-[16%] w-[52%] -translate-x-1/2 border`} />
      <div className={`${line} top-3 left-1/2 h-[16%] w-[52%] -translate-x-1/2 border`} />
      {/* pequenas áreas */}
      <div className={`${line} bottom-3 left-1/2 h-[7%] w-[26%] -translate-x-1/2 border`} />
      <div className={`${line} top-3 left-1/2 h-[7%] w-[26%] -translate-x-1/2 border`} />
    </div>
  );
}
