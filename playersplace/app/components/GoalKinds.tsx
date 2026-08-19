/**
 * "Como ele faz os gols" — o painel ofensivo da página do jogador.
 *
 * É o espelho do painel de gols sofridos: aquele é a única leitura defensiva
 * que o Transfermarkt publica, este é a única leitura de repertório. Só
 * aparece para atacantes — não porque um volante não faça gol, mas porque a
 * amostra dele raramente chega ao tamanho em que a distribuição significa
 * alguma coisa.
 *
 * O TOTAL AQUI PODE SER MENOR QUE O TOTAL DE GOLS DA CARREIRA
 *
 * A página de origem lista gols por CLUBE; gol de seleção não entra. Por isso
 * a nota embaixo da tabela existe e não é opcional: sem ela o leitor bate os
 * números com a ficha do jogador e conclui que um dos dois está errado.
 *
 * POR QUE "OUTROS" APARECE
 *
 * O Transfermarkt dá um rótulo só por gol, e muitos deles não dizem parte do
 * corpo nenhuma ("Cobrança de falta", "Gol em contra-ataque", "Sem mais
 * detalhes"). Espalhar esses gols entre as quatro colunas encheria a tela de
 * números redondos e falsos. Eles ficam numa coluna própria, que é ao mesmo
 * tempo o dado e a margem de erro das outras quatro.
 */
import {useState} from 'react';
import {Link} from 'react-router';
import {
  clubCrest,
  type PlayerGoalKinds,
  type GoalKinds,
  type SeasonGoalKinds,
} from '~/lib/tm';
import {Crest, SectionTitle, StatTile} from '~/components/ui';

/**
 * Percentual do total, para o rótulo dos cartões.
 *
 * `null` sem gol nenhum: "0%" sugere que a conta foi feita e deu zero, quando
 * na verdade não há conta.
 */
function pct(parte: number, total: number): string | null {
  if (total <= 0) return null;
  return `${Math.round((parte / total) * 100)}%`;
}

const CELULA = 'px-3 py-2.5 text-center';

/** zero vira "—": a coluna cheia de zeros esconde os números que importam */
const num = (n: number) => (n > 0 ? String(n) : '—');

/**
 * Soma as linhas visíveis.
 *
 * Uma temporada pode ter mais de uma linha — quem trocou de clube no meio do
 * ano aparece uma vez por camisa —, então o filtro de temporada não pode
 * simplesmente pegar "a linha daquele ano": ele soma as que sobraram.
 */
function somar(linhas: SeasonGoalKinds[]): GoalKinds {
  return linhas.reduce<GoalKinds>(
    (a, r) => ({
      rightFoot: a.rightFoot + r.rightFoot,
      leftFoot: a.leftFoot + r.leftFoot,
      head: a.head + r.head,
      penalty: a.penalty + r.penalty,
      other: a.other + r.other,
      total: a.total + r.total,
    }),
    {rightFoot: 0, leftFoot: 0, head: 0, penalty: 0, other: 0, total: 0},
  );
}

export function GoalKindsPanel({data}: {data: PlayerGoalKinds}) {
  const {total, seasons} = data;
  // `null` é a carreira inteira, e é o estado inicial: o repertório de um
  // jogador é o acumulado, e a temporada é o recorte que se pede depois
  const [temporada, setTemporada] = useState<string | null>(null);
  if (!total.total) return null;

  // as temporadas na ordem em que a tabela já as mostra, sem repetir quem
  // jogou por dois clubes no mesmo ano
  const rotulos = [...new Set(seasons.map((s) => s.season))];
  // temporada que sumiu (dado novo, estado velho) volta a valer como carreira
  const filtro = temporada && rotulos.includes(temporada) ? temporada : null;
  const visiveis = filtro
    ? seasons.filter((s) => s.season === filtro)
    : seasons;
  const somas = filtro ? somar(visiveis) : total;

  const tile = (label: string, valor: number) => {
    const p = pct(valor, somas.total);
    return (
      <StatTile label={label} value={p ? `${valor} · ${p}` : String(valor)} />
    );
  };

  const chip = (rotulo: string | null, texto: string) => (
    <button
      key={rotulo ?? 'carreira'}
      type="button"
      onClick={() => setTemporada(rotulo)}
      className={`h-8 shrink-0 rounded-full px-3 text-xs font-bold whitespace-nowrap transition-colors tabular-nums ${
        rotulo === filtro
          ? 'bg-ink text-white'
          : 'border border-line bg-card text-muted hover:bg-hoverrow'
      }`}
    >
      {texto}
    </button>
  );

  return (
    <section>
      <SectionTitle
        action={
          // uma temporada só não é filtro nenhum — os chips seriam dois botões
          // dizendo a mesma coisa
          rotulos.length > 1 ? (
            <div className="flex gap-1.5 overflow-x-auto">
              {chip(null, 'Carreira')}
              {rotulos.map((r) => chip(r, r))}
            </div>
          ) : null
        }
      >
        Como ele faz os gols
      </SectionTitle>

      <p className="mb-3 text-[13px] text-muted">
        Cada gol entra em uma categoria só. Pênalti fica fora das pernas — o
        Transfermarkt não publica com que pé ele foi batido.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tile('Pé direito', somas.rightFoot)}
        {tile('Pé esquerdo', somas.leftFoot)}
        {tile('Cabeça', somas.head)}
        {tile('Pênalti', somas.penalty)}
      </div>

      <div className="mt-3 overflow-hidden rounded-card border border-line bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px] tabular-nums">
            <thead>
              <tr className="border-b border-innerline text-left text-[11px] font-bold tracking-wide text-faint uppercase">
                <th className="px-4 py-2.5">Temporada</th>
                <th className="px-3 py-2.5">Clube</th>
                <th className="px-3 py-2.5 text-center">Gols</th>
                <th className="px-3 py-2.5 text-center">Pé dir.</th>
                <th className="px-3 py-2.5 text-center">Pé esq.</th>
                <th className="px-3 py-2.5 text-center">Cabeça</th>
                <th className="px-3 py-2.5 text-center">Pênalti</th>
                <th className="px-4 py-2.5 text-center">Outros</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr
                  key={`${r.season}:${r.clubId ?? r.clubName}`}
                  className="border-b border-innerline last:border-b-0 hover:bg-hoverrow"
                >
                  <td className="px-4 py-2.5 font-bold">{r.season}</td>
                  <td className="px-3 py-2.5">
                    {r.clubId ? (
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
                    ) : (
                      <span className="font-semibold">{r.clubName || '—'}</span>
                    )}
                  </td>
                  <td className={`${CELULA} font-extrabold`}>{r.total}</td>
                  <td className={CELULA}>{num(r.rightFoot)}</td>
                  <td className={CELULA}>{num(r.leftFoot)}</td>
                  <td className={CELULA}>{num(r.head)}</td>
                  <td className={CELULA}>{num(r.penalty)}</td>
                  <td className={`${CELULA} text-muted`}>{num(r.other)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-soft font-extrabold">
                <td className="px-4 py-2.5" colSpan={2}>
                  {filtro ? `Total ${filtro}` : 'Total'}
                </td>
                <td className={CELULA}>{somas.total}</td>
                <td className={CELULA}>{num(somas.rightFoot)}</td>
                <td className={CELULA}>{num(somas.leftFoot)}</td>
                <td className={CELULA}>{num(somas.head)}</td>
                <td className={CELULA}>{num(somas.penalty)}</td>
                <td className={CELULA}>{num(somas.other)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <p className="mt-2 text-[12px] text-faint">{rodape(somas)}</p>
    </section>
  );
}

/**
 * A nota de rodapé, montada com o número real de gols sem descrição em vez de
 * um aviso genérico: "22 gols" diz ao leitor o tamanho da margem, "alguns
 * gols" não diz nada.
 */
function rodape(total: GoalKinds): string {
  const base = 'Só gols por clubes — a fonte não lista gols por seleção.';
  if (!total.other) return base;
  const p = pct(total.other, total.total);
  return `${base} Em ${total.other} gol${total.other > 1 ? 's' : ''} (${p}) o Transfermarkt não descreve como saiu — falta, contra-ataque ou sem detalhe.`;
}
