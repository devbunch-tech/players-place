import {Link} from 'react-router';
import {clubCrest, type SeasonClubStarts} from '~/lib/tm';
import {Crest, SectionTitle, StatTile} from '~/components/ui';

const pct = (starts: number, games: number) =>
  games > 0 ? Math.round((starts / games) * 100) : 0;

/**
 * "Titularidades por temporada" — quantas vezes o jogador começou jogando
 * em cada clube, ano a ano. Temporadas com transferência no meio rendem
 * uma linha por clube.
 */
export function StartsPanel({rows}: {rows: SeasonClubStarts[]}) {
  if (!rows.length) return null;

  const totalGames = rows.reduce((n, r) => n + r.games, 0);
  const totalStarts = rows.reduce((n, r) => n + r.starts, 0);
  const best = rows.reduce((a, b) => (b.starts > a.starts ? b : a));

  return (
    <section>
      <SectionTitle>Titularidades por temporada</SectionTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Jogos na carreira" value={String(totalGames)} />
        <StatTile label="Como titular" value={String(totalStarts)} />
        <StatTile
          label="Aproveitamento"
          value={`${pct(totalStarts, totalGames)}%`}
        />
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Temporada</th>
                <th className="px-3 py-2.5">Clube</th>
                <th className="px-3 py-2.5 text-center">Jogos</th>
                <th className="px-3 py-2.5 text-center">Titular</th>
                <th className="w-[130px] px-4 py-2.5 text-right">
                  Como titular
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = pct(r.starts, r.games);
                return (
                  <tr
                    key={`${r.seasonId}:${r.clubId}`}
                    className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                  >
                    <td className="px-4 py-2.5 font-bold">
                      {r.label}
                      {r.seasonId === best.seasonId &&
                      r.clubId === best.clubId ? (
                        <span
                          className="ml-1.5 rounded bg-lime px-1 text-[9px] font-extrabold text-ink align-middle"
                          title="Temporada com mais titularidades"
                        >
                          TOP
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <Link
                        to={`/clubes/${r.clubId}`}
                        className="flex items-center gap-2 hover:text-pitch"
                      >
                        <Crest src={clubCrest(r.clubId)} name={r.clubName} size={18} />
                        <span className="max-w-[160px] truncate font-semibold">
                          {r.clubName}
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-center text-muted">
                      {r.games}
                    </td>
                    <td className="px-3 py-2.5 text-center font-extrabold">
                      {r.starts}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-chipbg">
                          <span
                            className="block h-full rounded-full bg-pitch"
                            style={{width: `${share}%`}}
                          />
                        </span>
                        <span className="w-9 text-right text-xs font-bold">
                          {share}%
                        </span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-soft font-extrabold">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-center">{totalGames}</td>
                <td className="px-3 py-2.5 text-center">{totalStarts}</td>
                <td className="px-4 py-2.5 text-right">
                  {pct(totalStarts, totalGames)}%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
