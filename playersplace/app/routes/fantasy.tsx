import {Link} from 'react-router';
import type {Route} from './+types/fantasy';
import {getLeagueStandings} from '~/lib/tm';
import {resolveProState} from '~/lib/pro';
import {SectionTitle} from '~/components/ui';
import {breadcrumbLd, canonical, seo} from '~/lib/seo';
import {
  FORMACOES,
  GOLEIROS,
  HORAS_ANTES,
  MAX_PALPITE,
  PONTOS_ACERTO,
  PONTOS_ERRO,
  ZERO_CONTA_COMO_APOSTA,
  acharFormacao,
  tamanhoEscalacao,
} from '~/lib/fantasy';

export const meta: Route.MetaFunction = () => [
  ...seo({
    title: 'Game Fantasy do Brasileirão — escale seu time e concorra a prêmios',
    description:
      'Monte sua escalação da rodada do Brasileirão, acerte gols e assistências dos jogadores e dispute o ranking mensal por prêmios. Grátis para jogar.',
    url: canonical('/fantasy'),
  }),
  breadcrumbLd([
    {name: 'Início', path: '/'},
    {name: 'Game Fantasy', path: '/fantasy'},
  ]),
];

/** o game vale só para o Brasileirão Série A */
const LIGA = 'BRA1';

/** Canal onde a ação é divulgada e o vencedor anunciado ao vivo. */
const CANAL_NOME = 'Na Torcida Vascaínos';
const CANAL_URL: string | null = 'https://www.youtube.com/@natorcidavascaino';

interface Premio {
  posicao: string;
  premio: string;
  destaque: boolean;
  /**
   * Arte do prêmio, servida de `public/`. Fica local de propósito: hospedar em
   * CDN de terceiro exigiria liberar o domínio no `imgSrc` do CSP
   * (entry.server.tsx) e deixaria a página refém de um link que some.
   *
   * Se o arquivo não existir, o `onError` esconde a imagem e o card volta ao
   * formato só de texto — nunca aparece ícone de imagem quebrada.
   */
  imagem?: string;
  imagemAlt?: string;
}

const PREMIOS: Premio[] = [
  {
    posicao: '1º lugar',
    premio: 'EA FC 27 Edição Standard para o seu console',
    destaque: true,
    imagem: '/premios/ea-fc-27.jpg',
    imagemAlt: 'Arte do jogo EA FC 27',
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

/**
 * Regras exibidas ao jogador.
 *
 * Tudo aqui é derivado das constantes de `~/lib/fantasy` de propósito: a
 * pontuação é o que decide quem leva prêmio, e uma regra escrita à mão nesta
 * página poderia divergir silenciosamente do que a apuração de fato faz.
 */
const TOTAL_JOGADORES = tamanhoEscalacao(acharFormacao('4-3-3')!);
const LINHA = TOTAL_JOGADORES - GOLEIROS;

const PONTUACAO: {caso: string; pontos: string; detalhe: string}[] = [
  {
    caso: 'Acertou em cheio',
    pontos: `+${PONTOS_ACERTO}`,
    detalhe:
      'O número que você escreveu é exatamente o que o jogador fez na rodada.',
  },
  {
    caso: 'Errou',
    pontos: PONTOS_ERRO === 0 ? '0' : String(PONTOS_ERRO),
    detalhe:
      PONTOS_ERRO === 0
        ? 'Errar não tira ponto. Arriscar só pode somar — nunca subtrair.'
        : 'Qualquer erro tira pontos, por menor que seja a diferença.',
  },
  {
    caso: 'Palpitou 0',
    pontos: '0',
    detalhe: ZERO_CONTA_COMO_APOSTA
      ? 'Zero conta como aposta: acerta e pontua, erra e perde.'
      : 'Zero quer dizer "não aposto neste": não pontua nem penaliza, mesmo que o jogador não marque.',
  },
];

const REGRAS = [
  {
    titulo: 'Escalação',
    itens: [
      `${TOTAL_JOGADORES} jogadores: ${GOLEIROS} goleiro e ${LINHA} de linha, na formação que você escolher.`,
      `${FORMACOES.length} formações disponíveis: ${FORMACOES.map((f) => f.code).join(', ')}.`,
      'Só jogadores do Brasileirão Série A. Suspensos e lesionados não aparecem na lista.',
      'O mesmo jogador não pode ocupar duas vagas.',
    ],
  },
  {
    titulo: 'Palpites',
    itens: [
      `Para cada jogador você diz quantos gols e quantas assistências ele fará: de 0 a ${MAX_PALPITE}.`,
      'Gols e assistências são contados separadamente — dá para acertar um e errar o outro.',
      `Cada jogador vale de 0 a +${PONTOS_ACERTO * 2} pontos na rodada.`,
    ],
  },
  {
    titulo: 'Prazo',
    itens: [
      `A escalação fecha ${HORAS_ANTES} horas antes do primeiro jogo da rodada.`,
      'Antes disso você pode alterar quantas vezes quiser.',
      'Depois de fechada, a escalação não muda mais — nem em caso de lesão de última hora.',
    ],
  },
  {
    titulo: 'Apuração e prêmios',
    itens: [
      'Os números saem das súmulas oficiais de cada jogo, não de estimativas.',
      'Gol contra não credita gol a quem marcou.',
      'A rodada só é apurada quando todos os jogos dela têm placar.',
      'Vale o ranking mensal: quem somar mais pontos no mês leva o prêmio.',
    ],
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

      {/* `id` para poder ser linkada de fora como /fantasy#regras — a tela de
          escalação é o principal candidato */}
      <div className="mt-8 scroll-mt-24" id="regras">
        <SectionTitle>Regras do jogo</SectionTitle>

        <div className="overflow-hidden rounded-card border border-line bg-card">
          <div className="border-b border-innerline px-5 py-4">
            <h3 className="font-display text-sm font-extrabold tracking-tight">
              Como pontua
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Cada palpite é avaliado sozinho, e é tudo ou nada: não existe
              &ldquo;chegou perto&rdquo;.
            </p>
            <div className="mt-3 space-y-2">
              {PONTUACAO.map((p) => (
                <div
                  key={p.caso}
                  className="flex items-start gap-3 rounded-md bg-soft px-3 py-2.5"
                >
                  <span
                    className={`mt-0.5 min-w-[42px] shrink-0 rounded-md px-2 py-1 text-center text-[12px] font-extrabold tabular-nums ${
                      p.pontos.startsWith('+')
                        ? 'bg-lime text-ink'
                        : 'bg-chipbg text-muted'
                    }`}
                  >
                    {p.pontos}
                  </span>
                  <span className="min-w-0 text-[13px] leading-relaxed">
                    <strong className="font-bold">{p.caso}.</strong>{' '}
                    <span className="text-muted">{p.detalhe}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {REGRAS.map((bloco) => (
            <div
              key={bloco.titulo}
              className="border-b border-innerline px-5 py-4 last:border-b-0"
            >
              <h3 className="font-display text-sm font-extrabold tracking-tight">
                {bloco.titulo}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {bloco.itens.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-2.5 text-[13px] leading-relaxed text-muted"
                  >
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-faint" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <SectionTitle>Prêmios de agosto</SectionTitle>
        <div className="space-y-3">
          {PREMIOS.map((p) => (
            <div
              key={p.posicao}
              // `items-center`: com a arte o card fica com a altura dela, e
              // alinhar pelo topo deixaria o texto de uma linha só flutuando
              // num vazio no desktop. `flex-wrap` deixa a arte cair para a
              // linha de baixo no celular (ver a largura dela).
              className={`flex flex-wrap items-center gap-4 rounded-card p-4 ${
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
                className={`min-w-0 flex-1 text-sm font-semibold ${p.destaque ? '' : 'text-ink'}`}
              >
                {p.premio}
              </span>
              {p.imagem ? (
                <img
                  src={p.imagem}
                  alt={p.imagemAlt ?? p.premio}
                  width={192}
                  height={108}
                  loading="lazy"
                  // 16:9 porque a arte é a key art horizontal do jogo, não a
                  // capa vertical de caixa — num slot 3:4 o corte central
                  // comeria o logo "EA SPORTS FC 27".
                  // `w-full` no celular força a quebra de linha do flex-wrap:
                  // a arte ganha a largura toda em vez de espremer o texto.
                  className="aspect-video w-full shrink-0 rounded-md object-cover ring-1 ring-white/20 sm:w-48"
                  // arquivo ausente não pode virar ícone de imagem quebrada:
                  // some a arte e o card segue como os outros, só com texto
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : null}
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
