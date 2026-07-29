import {Link} from 'react-router';
import type {Route} from './+types/fantasy';
import {getLeagueStandings} from '~/lib/tm';
import {resolveProState} from '~/lib/pro';
import {SectionTitle} from '~/components/ui';

export const meta: Route.MetaFunction = () => [
  {title: 'Game Fantasy · Players Place'},
  {
    name: 'description',
    content:
      'Monte sua escalação da rodada do Brasileirão, acerte as estatísticas dos jogadores e concorra a prêmios.',
  },
];

/** o game vale só para o Brasileirão Série A */
const LIGA = 'BRA1';

/** Canal onde a ação é divulgada e o vencedor anunciado ao vivo. */
const CANAL_NOME = 'Na Torcida Vascaínos';
const CANAL_URL: string | null = 'https://www.youtube.com/@natorcidavascaino';

const PREMIOS = [
  {
    posicao: '1º lugar',
    premio: 'EA FC 27 Edição Standard para o seu console',
    destaque: true,
  },
  {
    posicao: '2º lugar',
    premio: 'Voucher de R$ 200 em e-commerce surpresa de tênis esportivo',
    destaque: false,
  },
  {
    posicao: '3º lugar',
    premio: 'Voucher de R$ 100 em e-commerce surpresa de tênis esportivo',
    destaque: false,
  },
];

const COMO_FUNCIONA = [
  'Escolha a formação que você propõe para a rodada.',
  'Monte a escalação com os jogadores disponíveis — suspensos e lesionados ficam fora da lista.',
  'Para cada jogador, diga quantos gols e quantas assistências ele vai fazer na rodada.',
  'A escalação fecha 2 horas antes do primeiro jogo da rodada.',
  'Quem somar mais pontos no mês leva o prêmio.',
];

export async function loader({context}: Route.LoaderArgs) {
  const [{loggedIn}, standings] = await Promise.all([
    resolveProState(context),
    getLeagueStandings(LIGA).catch(() => []),
  ]);

  // A rodada corrente é inferida pelos jogos já disputados: o Transfermarkt
  // não publica "rodada atual" num campo próprio. Pegamos o maior número de
  // jogos da tabela — quem jogou mais está na rodada mais adiantada.
  const jogosDisputados = standings
    .flatMap((g) => g.rows)
    .map((r) => Number(r.played) || 0);
  const maxJogos = jogosDisputados.length ? Math.max(...jogosDisputados) : 0;
  const rodada = maxJogos > 0 ? maxJogos + 1 : null;

  return {loggedIn, rodada};
}

export default function Fantasy({loaderData}: Route.ComponentProps) {
  const {loggedIn, rodada} = loaderData;

  return (
    <div className="mx-auto max-w-3xl pp-in">
      <span className="inline-block rounded-md bg-lime px-2.5 py-1 text-[11px] font-extrabold tracking-widest text-ink">
        GAME FANTASY
      </span>

      <h1 className="mt-4 font-display text-[32px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
        Escale, <span className="rounded-md bg-lime px-1.5">acerte</span> e
        ganhe.
      </h1>

      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
        Monte sua escalação da rodada do Brasileirão e diga quantos gols e
        assistências cada jogador vai fazer. Quem mais pontuar no mês leva o
        prêmio.
      </p>

      {/* rodada da vez, em destaque */}
      <div className="mt-6 rounded-card bg-pitch p-5 text-white">
        <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
          Brasileirão Série A
        </div>
        <div className="mt-1 font-display text-[40px] leading-none font-extrabold tracking-tight">
          {rodada ? `${rodada}ª rodada` : 'Em breve'}
        </div>
        <p className="mt-2 text-xs text-white/60">
          {rodada
            ? 'A escalação fecha 2 horas antes do primeiro jogo.'
            : 'Assim que a próxima rodada for definida, ela aparece aqui.'}
        </p>

        <div className="mt-4">
          {loggedIn ? (
            <div className="space-y-2">
              <Link
                to="/fantasy/escalar"
                className="flex h-11 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
              >
                Montar minha escalação
              </Link>
              <div className="flex gap-2">
                <Link
                  to="/fantasy/perfil"
                  className="flex h-10 flex-1 items-center justify-center rounded-btn border border-white/25 text-[13px] font-bold text-white hover:bg-white/10"
                >
                  Meu perfil
                </Link>
                <Link
                  to="/fantasy/ranking"
                  className="flex h-10 flex-1 items-center justify-center rounded-btn border border-white/25 text-[13px] font-bold text-white hover:bg-white/10"
                >
                  Ranking
                </Link>
              </div>
            </div>
          ) : (
            <Link
              to="/account/login"
              className="flex h-11 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
            >
              Entrar para participar
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 rounded-card border border-dashed border-addash bg-card p-4 text-[13px] leading-relaxed text-muted">
        <strong className="text-ink">Válido apenas para o Campeonato
        Brasileiro.</strong>{' '}
        As demais ligas da plataforma seguem apenas com consulta de dados.
      </div>

      <div className="mt-8">
        <SectionTitle>Como funciona</SectionTitle>
        <ol className="space-y-3 rounded-card border border-line bg-card p-5">
          {COMO_FUNCIONA.map((passo, i) => (
            <li key={passo} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime text-[11px] font-extrabold text-ink tabular-nums">
                {i + 1}
              </span>
              <span className="font-semibold">{passo}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-8">
        <SectionTitle>Prêmios de agosto</SectionTitle>
        <div className="space-y-3">
          {PREMIOS.map((p) => (
            <div
              key={p.posicao}
              className={`flex items-start gap-4 rounded-card p-4 ${
                p.destaque
                  ? 'bg-pitch text-white'
                  : 'border border-line bg-card'
              }`}
            >
              <span
                className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-extrabold tracking-widest uppercase ${
                  p.destaque ? 'bg-lime text-ink' : 'bg-soft text-muted'
                }`}
              >
                {p.posicao}
              </span>
              <span
                className={`text-sm font-semibold ${p.destaque ? '' : 'text-ink'}`}
              >
                {p.premio}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold tracking-tight">
          Onde acompanhar
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          A ação é divulgada no canal{' '}
          {CANAL_URL ? (
            <a
              href={CANAL_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-pitch underline-offset-2 hover:underline"
            >
              {CANAL_NOME}
            </a>
          ) : (
            <strong className="text-ink">{CANAL_NOME}</strong>
          )}{' '}
          no YouTube, e o vencedor de cada mês é anunciado ao vivo por lá.
        </p>
      </div>
    </div>
  );
}
