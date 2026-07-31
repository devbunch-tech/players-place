import {Link} from 'react-router';
import {Avatar, Crest, SectionTitle} from '~/components/ui';
import type {StatLeaderRow} from '~/lib/tm';

/**
 * Ranking de estatística da competição (artilheiros, assistências).
 *
 * Mobile-first: uma linha por jogador, com a métrica ancorada à direita e o
 * clube reduzido ao escudo — em tela estreita o nome do clube empurraria o
 * nome do jogador para o truncamento.
 */
export function StatLeaders({
  title,
  subtitle,
  rows,
  metricLabel,
}: {
  title: string;
  subtitle?: string;
  rows: StatLeaderRow[];
  metricLabel: string;
}) {
  return (
    <section>
      <SectionTitle>{title}</SectionTitle>
      {subtitle ? (
        <p className="-mt-2 mb-3 text-[13px] text-muted">{subtitle}</p>
      ) : null}

      <div className="overflow-hidden rounded-card border border-line bg-card">
        {rows.length === 0 ? (
          <p className="px-4 py-5 text-[13px] text-muted">
            Ranking indisponível para esta competição agora.
          </p>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-innerline px-4 py-2 text-[11px] font-bold tracking-wide text-faint uppercase">
              <span className="w-5 text-center">#</span>
              <span className="flex-1">Jogador</span>
              <span className="w-8 text-center">J</span>
              <span className="w-8 text-right">{metricLabel}</span>
            </div>
            {rows.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border-b border-innerline px-4 py-2.5 last:border-b-0 hover:bg-hoverrow"
              >
                <span className="w-5 text-center text-xs font-bold text-faint tabular-nums">
                  {r.rank}
                </span>
                <Link
                  to={`/jogadores/${r.id}`}
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Avatar src={r.photo} name={r.name} size={30} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold hover:text-pitch">
                      {r.name}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-faint">
                      <Crest src={r.clubCrest} name={r.clubName} size={13} />
                      <span className="truncate">{r.position}</span>
                    </span>
                  </span>
                </Link>
                <span className="w-8 text-center text-[13px] text-muted tabular-nums">
                  {r.games}
                </span>
                <span className="w-8 text-right text-sm font-extrabold tabular-nums">
                  {r.value}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
