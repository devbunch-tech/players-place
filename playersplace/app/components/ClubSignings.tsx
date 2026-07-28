import {Link} from 'react-router';
import type {ArrivalKind, ClubTransfers} from '~/lib/tm';
import {formatMillions, euroToMillions} from '~/lib/format';
import {
  Avatar,
  ChipLink,
  Crest,
  EmptyNote,
  SectionTitle,
  StatTile,
} from '~/components/ui';

/** quantas temporadas o seletor mostra */
const SEASONS_SHOWN = 6;

const KIND_LABEL: Record<ArrivalKind, string> = {
  compra: 'Compra',
  emprestimo: 'Empréstimo',
  gratis: 'Sem custo',
  retorno: 'Fim de empréstimo',
  indefinido: 'Não informado',
};

const KIND_STYLE: Record<ArrivalKind, string> = {
  compra: 'bg-upbg text-up',
  emprestimo: 'bg-warmbg text-warm',
  gratis: 'bg-soft text-muted',
  retorno: 'bg-soft text-faint',
  indefinido: 'bg-soft text-faint',
};

/**
 * "Contratações" — quantos jogadores o clube trouxe na temporada.
 * Retornos de empréstimo aparecem à parte: o Transfermarkt os lista como
 * entrada, mas eles não são contratação.
 */
export function ClubSignings({
  clubId,
  transfers,
}: {
  clubId: string;
  transfers: ClubTransfers;
}) {
  const signings = transfers.arrivals.filter((a) => a.kind !== 'retorno');
  const returns = transfers.arrivals.length - signings.length;
  const bought = signings.filter((a) => a.kind === 'compra');
  const loans = signings.filter((a) => a.kind === 'emprestimo').length;
  const spent = bought.reduce((n, a) => n + (euroToMillions(a.fee) ?? 0), 0);

  const seasons = transfers.seasons.slice(0, SEASONS_SHOWN);

  return (
    <section>
      <SectionTitle
        action={
          seasons.length > 1 ? (
            <div className="flex gap-1.5 overflow-x-auto">
              {seasons.map((s) => (
                <ChipLink
                  key={s.id}
                  to={`/clubes/${clubId}?temporada=${s.id}`}
                  active={s.id === transfers.seasonId}
                >
                  {s.label}
                </ChipLink>
              ))}
            </div>
          ) : null
        }
      >
        Contratações
      </SectionTitle>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label={`Contratações ${transfers.seasonLabel}`.trim()}
          value={String(signings.length)}
        />
        <StatTile label="Compras" value={String(bought.length)} />
        <StatTile label="Por empréstimo" value={String(loans)} />
        <StatTile
          label="Gasto em compras"
          value={bought.length ? formatMillions(spent) : '—'}
        />
      </div>

      {signings.length === 0 ? (
        <div className="mt-3">
          <EmptyNote>
            Nenhuma contratação registrada em {transfers.seasonLabel || 'na temporada'}.
          </EmptyNote>
        </div>
      ) : (
        <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead>
                <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                  <th className="px-4 py-2.5">Jogador</th>
                  <th className="px-3 py-2.5">Posição</th>
                  <th className="px-3 py-2.5 text-center">Idade</th>
                  <th className="px-3 py-2.5">Origem</th>
                  <th className="px-4 py-2.5 text-right">Quantia paga</th>
                </tr>
              </thead>
              <tbody>
                {signings.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/jogadores/${a.id}`}
                        className="flex items-center gap-2.5 font-bold hover:text-pitch"
                      >
                        <Avatar src={a.photo} name={a.name} size={30} />
                        <span className="max-w-[170px] truncate">{a.name}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2.5 text-muted">{a.position || '—'}</td>
                    <td className="px-3 py-2.5 text-center text-muted tabular-nums">
                      {a.age ?? '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {a.from ? (
                        <Link
                          to={`/clubes/${a.from.id}`}
                          className="flex items-center gap-2 hover:text-pitch"
                        >
                          <Crest src={a.from.crest} name={a.from.name} size={18} />
                          <span className="max-w-[150px] truncate">
                            {a.from.name}
                          </span>
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {a.kind === 'compra' ? (
                        <span className="font-extrabold tabular-nums">{a.fee}</span>
                      ) : (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[11px] font-bold whitespace-nowrap ${KIND_STYLE[a.kind]}`}
                        >
                          {KIND_LABEL[a.kind]}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {returns > 0 ? (
        <p className="mt-2 text-xs text-faint">
          Fora da conta: {returns}{' '}
          {returns === 1 ? 'jogador voltou' : 'jogadores voltaram'} de empréstimo
          — o Transfermarkt lista como entrada, mas não é contratação.
        </p>
      ) : null}
    </section>
  );
}
