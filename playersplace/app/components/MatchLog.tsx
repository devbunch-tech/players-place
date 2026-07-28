import {useState} from 'react';
import {clubCrest, type GameRow, type SeasonGames} from '~/lib/tm';
import {Crest, SectionTitle} from '~/components/ui';

const STATE_LABEL: Record<GameRow['state'], string> = {
  played: '',
  squad: 'Suplente não utilizado',
  out: 'Não esteve no plantel',
  injured: 'Lesionado',
  absent: 'Ausente',
};

const STATE_ROW: Record<GameRow['state'], string> = {
  played: 'hover:bg-hoverrow',
  squad: 'bg-warmbg/50',
  out: 'bg-downbg/60',
  injured: 'bg-downbg/60',
  absent: 'bg-downbg/60',
};

/**
 * Súmula jogo a jogo — chips de temporada e de competição, com uma linha
 * por partida do elenco (inclusive as que o jogador não disputou).
 */
export function MatchLog({seasons}: {seasons: SeasonGames[]}) {
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [compId, setCompId] = useState<string | null>(null);
  if (!seasons.length) return null;

  const season = seasons[Math.min(seasonIdx, seasons.length - 1)];
  const groups = season.groups;
  const active = groups.find((g) => g.competitionId === compId) ?? groups[0];
  if (!active) return null;

  return (
    <section>
      <SectionTitle
        action={
          <div className="flex gap-1.5 overflow-x-auto">
            {seasons.map((s, i) => (
              <button
                key={s.seasonId}
                type="button"
                onClick={() => {
                  setSeasonIdx(i);
                  setCompId(null);
                }}
                className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold whitespace-nowrap transition-colors tabular-nums ${
                  i === seasonIdx
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
        Jogo a jogo
      </SectionTitle>

      {groups.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {groups.map((g) => (
            <button
              key={g.competitionId}
              type="button"
              onClick={() => setCompId(g.competitionId)}
              className={`h-8 rounded-full px-3 text-xs font-semibold transition-colors ${
                g.competitionId === active.competitionId
                  ? 'bg-pitch text-white'
                  : 'border border-line bg-card text-muted hover:bg-hoverrow'
              }`}
            >
              {g.name}{' '}
              <span className="tabular-nums opacity-60">{g.rows.length}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5 text-center">Rod.</th>
                <th className="px-3 py-2.5">Data</th>
                <th className="px-2 py-2.5 text-center">Local</th>
                <th className="px-3 py-2.5">Adversário</th>
                <th className="px-3 py-2.5 text-center">Result.</th>
                <th className="px-3 py-2.5 text-center">Pos.</th>
                <th className="px-2 py-2.5 text-center">G</th>
                <th className="px-2 py-2.5 text-center">A</th>
                <th className="px-2 py-2.5 text-center">Am.</th>
                <th className="px-4 py-2.5 text-right">Min.</th>
              </tr>
            </thead>
            <tbody>
              {active.rows.map((g) => (
                <MatchRow key={g.gameId} game={g} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function MatchRow({game: g}: {game: GameRow}) {
  const played = g.state === 'played';
  return (
    <tr className={`border-b border-innerline last:border-b-0 ${STATE_ROW[g.state]}`}>
      <td className="px-4 py-2.5 text-center text-faint">{g.matchDay ?? '—'}</td>
      <td className="px-3 py-2.5 text-muted">{g.date ?? '—'}</td>
      <td className="px-2 py-2.5 text-center font-bold text-faint">{g.venue}</td>
      <td className="px-3 py-2.5">
        <span className="flex items-center gap-2">
          <Crest src={clubCrest(g.opponentId)} name={g.opponentName} size={16} />
          <span className="max-w-[170px] truncate font-semibold">
            {g.opponentName}
          </span>
          {g.opponentRank ? (
            <span className="text-[11px] text-faint">({g.opponentRank}.)</span>
          ) : null}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center">
        <span
          className={`rounded-md px-1.5 py-0.5 text-xs font-extrabold ${
            g.outcome === 'V'
              ? 'bg-upbg text-up'
              : g.outcome === 'D'
                ? 'bg-downbg text-down'
                : 'bg-soft text-muted'
          }`}
        >
          {g.score}
        </span>
      </td>

      {played ? (
        <>
          <td className="px-3 py-2.5 text-center text-[11px] font-bold text-pitch">
            {g.position ?? '—'}
          </td>
          <td className="px-2 py-2.5 text-center font-semibold">{g.goals || ''}</td>
          <td className="px-2 py-2.5 text-center">{g.assists || ''}</td>
          <td className="px-2 py-2.5 text-center text-warm">{g.yellow || ''}</td>
          <td className="px-4 py-2.5 text-right font-semibold">
            {g.minutes !== null ? `${g.minutes}'` : '—'}
          </td>
        </>
      ) : (
        <td colSpan={5} className="px-4 py-2.5 text-right text-xs text-muted">
          {STATE_LABEL[g.state]}
        </td>
      )}
    </tr>
  );
}
