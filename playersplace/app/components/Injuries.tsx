import type {ClubAbsence, PlayerInjury} from '~/lib/tm';
import {SectionTitle, StatTile} from '~/components/ui';

/** "36 dias" → 36; qualquer outra coisa → 0 */
function dias(texto: string): number {
  return Number(texto.match(/(\d+)/)?.[1] ?? 0);
}

/**
 * Faixa de status quando o jogador está fora agora.
 *
 * Vem da página de desfalques do clube, e não do histórico: só ela traz a
 * previsão de retorno. `until` vazio é comum — o Transfermarkt não arrisca
 * data quando o departamento médico não divulgou.
 */
export function InjuryStatus({absence}: {absence: ClubAbsence | null}) {
  if (!absence) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-card border border-down/25 bg-downbg px-4 py-3">
      <span className="flex items-center gap-2 text-sm font-extrabold text-down">
        <span className="h-2 w-2 rounded-full bg-down pp-pulse" />
        Fora por lesão
      </span>
      <span className="text-sm font-semibold">{absence.reason}</span>
      {absence.since ? (
        <span className="text-[13px] text-muted">desde {absence.since}</span>
      ) : null}
      <span className="text-[13px] text-muted">
        {absence.until
          ? `retorno previsto para ${absence.until}`
          : 'sem previsão de retorno'}
      </span>
    </div>
  );
}

/**
 * Histórico de lesões da carreira.
 *
 * O Transfermarkt não traduz todo nome de lesão para português — alguns
 * aparecem em alemão. Exibimos como vem: inventar tradução seria pior que
 * mostrar o rótulo original da fonte.
 */
export function InjuryHistory({rows}: {rows: PlayerInjury[]}) {
  if (!rows.length) return null;

  const totalDias = rows.reduce((n, r) => n + dias(r.days), 0);
  const totalJogos = rows.reduce((n, r) => n + (Number(r.gamesMissed) || 0), 0);

  return (
    <section>
      <SectionTitle>Histórico de lesões</SectionTitle>

      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Lesões na carreira" value={String(rows.length)} />
        <StatTile label="Dias afastado" value={String(totalDias)} />
        <StatTile label="Jogos perdidos" value={String(totalJogos)} />
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Temporada</th>
                <th className="px-3 py-2.5">Lesão</th>
                <th className="px-3 py-2.5">Período</th>
                <th className="px-3 py-2.5 text-center">Dias</th>
                <th className="px-4 py-2.5 text-center">Jogos</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  // data de início + tipo identifica a lesão: duas do mesmo
                  // tipo começando no mesmo dia não existem
                  key={`${r.from}-${r.type}`}
                  className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                >
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    {r.season}
                  </td>
                  <td className="px-3 py-2.5">{r.type}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                    {r.from}
                    {r.until ? ` – ${r.until}` : ' – em curso'}
                  </td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap">
                    {r.days}
                  </td>
                  <td className="px-4 py-2.5 text-center">{r.gamesMissed}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
