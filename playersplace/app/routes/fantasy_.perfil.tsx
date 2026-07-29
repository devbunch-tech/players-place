/**
 * Perfil do jogador no Game Fantasy: pontuação, última escalação e os
 * caminhos para alterar apelido, formação e time.
 */
import {Link, redirect} from 'react-router';
import type {Route} from './+types/fantasy_.perfil';
import {getCustomerId} from '~/lib/pro';
import {createDb} from '~/lib/db';
import {buscarPerfil, resumoDoJogador} from '~/lib/fantasy.server';
import {SectionTitle} from '~/components/ui';

const LIGA = 'BRA1';

export const meta: Route.MetaFunction = () => [
  {title: 'Meu perfil · Game Fantasy · Players Place'},
];

export async function loader({context}: Route.LoaderArgs) {
  const cliente = await getCustomerId(context);
  if (!cliente) return redirect('/account/login');

  const db = createDb(context.env);
  if (!db) throw new Response('Game Fantasy indisponível.', {status: 503});

  const perfil = await buscarPerfil(db, cliente.id);
  // sem apelido não dá para aparecer no ranking: manda escolher primeiro
  if (!perfil) return redirect('/fantasy/apelido');

  const resumo = await resumoDoJogador(db, cliente.id, LIGA);
  return {nickname: perfil.nickname, resumo};
}

export default function Perfil({loaderData}: Route.ComponentProps) {
  const {nickname, resumo} = loaderData;
  const {totalPontos, rodadasJogadas, ultima} = resumo;

  return (
    <div className="mx-auto max-w-2xl pp-in">
      <Link to="/fantasy" className="text-[13px] font-semibold text-pitch hover:underline">
        ← Game Fantasy
      </Link>

      <div className="mt-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-display text-[26px] font-extrabold tracking-tight">
            {nickname}
          </h1>
          <Link
            to="/fantasy/apelido"
            className="text-[13px] font-semibold text-pitch hover:underline"
          >
            alterar apelido
          </Link>
        </div>
        <Link
          to="/fantasy/ranking"
          className="flex h-9 shrink-0 items-center rounded-btn border border-line px-4 text-[13px] font-bold"
        >
          Ranking
        </Link>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        <div className="rounded-card bg-pitch p-4 text-white">
          <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
            Pontos
          </div>
          <div className="mt-1 font-display text-[36px] leading-none font-extrabold tabular-nums">
            {totalPontos}
          </div>
        </div>
        <div className="rounded-card border border-line bg-card p-4">
          <div className="text-[10px] font-bold tracking-[0.14em] text-faint uppercase">
            Rodadas
          </div>
          <div className="mt-1 font-display text-[36px] leading-none font-extrabold tabular-nums">
            {rodadasJogadas}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle>
          {ultima ? `Última escalação · ${ultima.round}ª rodada` : 'Última escalação'}
        </SectionTitle>

        {!ultima ? (
          <div className="rounded-card border border-line bg-card p-5">
            <p className="text-sm text-muted">
              Você ainda não montou nenhuma escalação.
            </p>
            <Link
              to="/fantasy/escalar"
              className="mt-4 flex h-11 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink"
            >
              Montar minha escalação
            </Link>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="rounded-full bg-chipbg px-3 py-1 text-[13px] font-bold">
                {ultima.formation}
              </span>
              <span className="text-[13px] font-semibold text-muted">
                {ultima.points === null
                  ? 'aguardando apuração'
                  : `${ultima.points} pontos na rodada`}
              </span>
            </div>

            <div className="overflow-hidden rounded-card border border-line bg-card">
              <div className="flex items-center gap-3 border-b border-innerline px-4 py-2 text-[11px] font-bold tracking-wide text-faint uppercase">
                <span className="flex-1">Jogador</span>
                <span className="w-14 text-center">Palpite</span>
                <span className="w-14 text-center">Real</span>
                <span className="w-10 text-right">Pts</span>
              </div>

              {ultima.picks.map((p) => (
                <div
                  key={p.slot}
                  className="flex items-center gap-3 border-b border-innerline px-4 py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">
                      {p.playerName}
                    </span>
                    <span className="block truncate text-xs text-faint">
                      {p.clubName}
                    </span>
                  </span>
                  <span className="w-14 text-center text-[13px] tabular-nums">
                    {p.predGoals}G {p.predAssists}A
                  </span>
                  <span className="w-14 text-center text-[13px] text-muted tabular-nums">
                    {p.actualGoals === null
                      ? '—'
                      : `${p.actualGoals}G ${p.actualAssists ?? 0}A`}
                  </span>
                  <span
                    className={`w-10 text-right text-sm font-extrabold tabular-nums ${
                      p.points === null
                        ? 'text-faint'
                        : p.points > 0
                          ? 'text-up'
                          : 'text-muted'
                    }`}
                  >
                    {p.points === null ? '—' : p.points}
                  </span>
                </div>
              ))}
            </div>

            <Link
              to="/fantasy/escalar"
              className="mt-4 flex h-11 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
            >
              Alterar formação e time
            </Link>
            <p className="mt-2 text-center text-xs text-faint">
              Só é possível alterar enquanto o prazo da rodada estiver aberto.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
