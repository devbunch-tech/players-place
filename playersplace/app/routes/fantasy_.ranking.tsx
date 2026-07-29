/**
 * Ranking mensal — é ele que define quem leva o prêmio do mês.
 *
 * Público: qualquer visitante vê. Só o próprio participante é destacado, e
 * isso exige estar logado.
 */
import {Link} from 'react-router';
import type {Route} from './+types/fantasy_.ranking';
import {getCustomerId} from '~/lib/pro';
import {createDb} from '~/lib/db';
import {rankingMensalNomeado} from '~/lib/fantasy.server';

export const meta: Route.MetaFunction = () => [
  {title: 'Ranking · Game Fantasy · Players Place'},
];

/** 'YYYY-MM' no fuso de São Paulo — o mesmo corte usado pela view no banco */
function mesAtual(): string {
  const agora = new Date();
  const sp = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return `${sp.getUTCFullYear()}-${String(sp.getUTCMonth() + 1).padStart(2, '0')}`;
}

const NOME_MES: Record<string, string> = {
  '01': 'janeiro', '02': 'fevereiro', '03': 'março', '04': 'abril',
  '05': 'maio', '06': 'junho', '07': 'julho', '08': 'agosto',
  '09': 'setembro', '10': 'outubro', '11': 'novembro', '12': 'dezembro',
};

export async function loader({request, context}: Route.LoaderArgs) {
  const mes = new URL(request.url).searchParams.get('mes') ?? mesAtual();

  const db = createDb(context.env);
  if (!db) return {mes, linhas: [], meuId: null};

  const [linhas, cliente] = await Promise.all([
    rankingMensalNomeado(db, mes).catch(() => []),
    getCustomerId(context),
  ]);

  return {mes, linhas, meuId: cliente?.id ?? null};
}

const MEDALHA = ['🥇', '🥈', '🥉'];

export default function Ranking({loaderData}: Route.ComponentProps) {
  const {mes, linhas, meuId} = loaderData;
  const [ano, num] = mes.split('-');

  return (
    <div className="mx-auto max-w-2xl pp-in">
      <Link to="/fantasy" className="text-[13px] font-semibold text-pitch hover:underline">
        ← Game Fantasy
      </Link>

      <h1 className="mt-3 font-display text-[26px] font-extrabold tracking-tight">
        Ranking de {NOME_MES[num] ?? mes} de {ano}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Os três primeiros do mês levam os prêmios, anunciados ao vivo no canal.
      </p>

      {linhas.length === 0 ? (
        <div className="mt-6 rounded-card border border-line bg-card p-5">
          <p className="text-sm text-muted">
            Nenhuma rodada apurada neste mês ainda. O ranking aparece assim que
            a primeira rodada for encerrada e pontuada.
          </p>
          <Link
            to="/fantasy/escalar"
            className="mt-4 flex h-11 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink"
          >
            Montar minha escalação
          </Link>
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-card border border-line bg-card">
          {linhas.map((l, i) => {
            const eu = meuId && l.customerId === meuId;
            return (
              <div
                key={l.customerId}
                className={`flex items-center gap-3 border-b border-innerline px-4 py-3 last:border-b-0 ${
                  eu ? 'bg-menuactive' : ''
                }`}
              >
                <span className="w-7 text-center text-sm font-extrabold tabular-nums">
                  {i < 3 ? MEDALHA[i] : i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">
                    {l.nickname}
                    {eu ? (
                      <span className="ml-2 rounded-md bg-lime px-1.5 py-0.5 text-[10px] font-extrabold text-ink">
                        VOCÊ
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs text-faint">
                    {l.rodadas} {l.rodadas === 1 ? 'rodada' : 'rodadas'}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-extrabold tabular-nums">
                  {l.pontos}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
