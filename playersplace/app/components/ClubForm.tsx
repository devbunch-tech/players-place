import {Link} from 'react-router';
import {Crest, SectionTitle} from '~/components/ui';
import type {ClubMatch} from '~/lib/tm';

/**
 * Últimos e próximos jogos do clube.
 *
 * Mobile-first: cada jogo é uma linha só, com o resultado (ou o horário)
 * ancorado à direita. O V/E/D vira uma bolinha colorida — em tela estreita
 * ela comunica mais rápido que texto.
 */

const OUTCOME_STYLE: Record<'V' | 'E' | 'D', string> = {
  V: 'bg-up/15 text-up',
  E: 'bg-soft text-muted',
  D: 'bg-down/15 text-down',
};

function MatchRow({match}: {match: ClubMatch}) {
  const opponent = (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Crest src={match.opponentCrest} name={match.opponentName} size={22} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold">
          {match.opponentName}
        </span>
        <span className="block truncate text-[11px] text-faint">
          {match.home ? 'Casa' : 'Fora'} · {match.date}
          {match.competition ? ` · ${match.competition}` : ''}
        </span>
      </span>
    </span>
  );

  return (
    <div className="flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0">
      {match.opponentId ? (
        <Link
          to={`/clubes/${match.opponentId}`}
          className="flex min-w-0 flex-1 items-center hover:text-pitch"
        >
          {opponent}
        </Link>
      ) : (
        opponent
      )}

      {match.score ? (
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-extrabold tabular-nums">{match.score}</span>
          {match.outcome ? (
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${OUTCOME_STYLE[match.outcome]}`}
              title={
                match.outcome === 'V'
                  ? 'Vitória'
                  : match.outcome === 'E'
                    ? 'Empate'
                    : 'Derrota'
              }
            >
              {match.outcome}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="shrink-0 text-xs font-semibold text-muted tabular-nums">
          {match.time || '—'}
        </span>
      )}
    </div>
  );
}

export function ClubFormSection({
  title,
  matches,
  empty,
}: {
  title: string;
  matches: ClubMatch[];
  empty: string;
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        {matches.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted">{empty}</p>
        ) : (
          matches.map((m, i) => <MatchRow key={`${m.sortKey}-${m.opponentId}-${i}`} match={m} />)
        )}
      </div>
    </section>
  );
}
