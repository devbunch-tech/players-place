/**
 * "Gols sofridos como titular" — o painel defensivo da página do jogador.
 *
 * Só aparece para defensores. Para um atacante o mesmo número existe e não
 * significa nada; para um zagueiro é a única leitura defensiva que o
 * Transfermarkt publica jogo a jogo.
 *
 * A LEITURA É A SÉRIE, NÃO O NÚMERO
 *
 * Um zagueiro de time pequeno leva mais gols que um de time grande jogando
 * igual. Por isso a tabela é por temporada E por clube: o que se compara é a
 * mesma pessoa ao longo dos anos, ou dois companheiros do mesmo elenco. Um
 * total solto no topo da página seria enganoso, então não existe.
 *
 * POR QUE A MÉDIA É POR 90 MINUTOS, E NÃO POR JOGO
 *
 * Titular substituído no intervalo carrega meio jogo de exposição, não um.
 * Dividir por jogo premiaria quem sai cedo — exatamente o contrário do que a
 * coluna quer medir. A média por jogo continua sendo derivável a olho pelo
 * leitor que quiser (gols ÷ titular), a por 90 não seria.
 */
import {Link} from 'react-router';
import {clubCrest, type SeasonConceded} from '~/lib/tm';
import {Crest, SectionTitle, StatTile} from '~/components/ui';

/**
 * Gols sofridos a cada 90 minutos em campo.
 *
 * `null` quando não há minutos: o Transfermarkt deixa `playedMinutes` nulo em
 * jogos antigos, e dividir por zero viraria "0,00" — um número ótimo onde na
 * verdade não há número nenhum.
 */
function per90(conceded: number, minutes: number): number | null {
  return minutes > 0 ? (conceded / minutes) * 90 : null;
}

const doisDecimais = (n: number) => n.toFixed(2).replace('.', ',');

const fmt90 = (v: number | null) => (v === null ? '—' : doisDecimais(v));

export function ConcededPanel({rows}: {rows: SeasonConceded[]}) {
  if (!rows.length) return null;

  const starts = rows.reduce((n, r) => n + r.starts, 0);
  const minutes = rows.reduce((n, r) => n + r.minutes, 0);
  const conceded = rows.reduce((n, r) => n + r.conceded, 0);
  const cleanSheets = rows.reduce((n, r) => n + r.cleanSheets, 0);

  // "melhor temporada" só faz sentido com amostra: cinco jogos de titular
  // rendem médias extremas que não descrevem nada. Sem nenhuma linha acima do
  // corte, ninguém ganha o selo — melhor nada do que um destaque de acaso.
  const MIN_JOGOS_DESTAQUE = 10;
  const elegiveis = rows.filter(
    (r) => r.starts >= MIN_JOGOS_DESTAQUE && r.minutes > 0,
  );
  const melhor = elegiveis.length
    ? elegiveis.reduce((a, b) =>
        per90(b.conceded, b.minutes)! < per90(a.conceded, a.minutes)! ? b : a,
      )
    : null;

  return (
    <section>
      <SectionTitle>Gols sofridos como titular</SectionTitle>

      <p className="mb-3 text-[13px] text-muted">
        Gols que o time levou <strong>com ele em campo</strong>, contando só os
        jogos que ele começou jogando. Um titular substituído não carrega o gol
        sofrido depois de sair.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Jogos como titular" value={String(starts)} />
        <StatTile label="Gols sofridos" value={String(conceded)} />
        <StatTile
          label="Por 90 min"
          value={fmt90(per90(conceded, minutes))}
        />
        <StatTile label="Sem sofrer gol" value={String(cleanSheets)} />
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Temporada</th>
                <th className="px-3 py-2.5">Clube</th>
                <th className="px-3 py-2.5 text-center">Titular</th>
                <th className="px-3 py-2.5 text-center">Minutos</th>
                <th className="px-3 py-2.5 text-center">Gols sofridos</th>
                <th className="px-3 py-2.5 text-center">Por 90</th>
                <th className="px-4 py-2.5 text-center">Sem sofrer</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.seasonId}:${r.clubId}`}
                  className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                >
                  <td className="px-4 py-2.5 font-bold">
                    {r.label}
                    {melhor &&
                    r.seasonId === melhor.seasonId &&
                    r.clubId === melhor.clubId ? (
                      <span
                        className="ml-1.5 rounded bg-lime px-1 align-middle text-[9px] font-extrabold text-ink"
                        title={`Menos gols sofridos por 90 min (mínimo de ${MIN_JOGOS_DESTAQUE} jogos como titular)`}
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
                      <Crest
                        src={clubCrest(r.clubId)}
                        name={r.clubName}
                        size={18}
                      />
                      <span className="max-w-[160px] truncate font-semibold">
                        {r.clubName}
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted">
                    {r.starts}
                  </td>
                  <td className="px-3 py-2.5 text-center text-muted">
                    {r.minutes > 0 ? r.minutes.toLocaleString('pt-BR') : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center font-extrabold">
                    {r.conceded}
                  </td>
                  <td className="px-3 py-2.5 text-center font-bold">
                    {fmt90(per90(r.conceded, r.minutes))}
                  </td>
                  <td className="px-4 py-2.5 text-center text-muted">
                    {r.cleanSheets}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-soft font-extrabold">
                <td className="px-4 py-2.5" colSpan={2}>
                  Total
                </td>
                <td className="px-3 py-2.5 text-center">{starts}</td>
                <td className="px-3 py-2.5 text-center">
                  {minutes > 0 ? minutes.toLocaleString('pt-BR') : '—'}
                </td>
                <td className="px-3 py-2.5 text-center">{conceded}</td>
                <td className="px-3 py-2.5 text-center">
                  {fmt90(per90(conceded, minutes))}
                </td>
                <td className="px-4 py-2.5 text-center">{cleanSheets}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </section>
  );
}
