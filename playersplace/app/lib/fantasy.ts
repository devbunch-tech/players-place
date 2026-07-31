/**
 * Regras do Game Fantasy.
 *
 * Módulo puro: sem I/O, sem banco. Tudo aqui é determinístico e testável,
 * porque é o que decide quem ganha prêmio.
 */
import type {RotuloVaga} from '~/lib/tm/positions';

// ---------------------------------------------------------------------------
// Pontuação
// ---------------------------------------------------------------------------

/** acerto em cheio no número */
export const PONTOS_ACERTO = 3;
/** qualquer erro, por maior ou menor que seja */
export const PONTOS_ERRO = -3;

/**
 * Se true, palpitar 0 conta como aposta (acerto pontua, erro penaliza).
 * Se false, palpite 0 vale "não aposto": não pontua nem penaliza.
 *
 * ATENÇÃO — medido por simulação de 200 mil rodadas, com probabilidade de gol
 * calibrada pelo Brasileirão (artilheiro com 12 gols em 19 jogos):
 *
 *   regra atual (+3/-3, zero pontuando)
 *     escalar tudo com 0 ............... 56,5 pts
 *     apostar em 6 jogadores ........... 28,9 pts
 *     apostar em 1 atacante ............ 52,9 pts
 *
 * Ou seja: NÃO jogar é a melhor estratégia, porque quase todo jogador faz 0
 * gol e 0 assistência numa rodada. Quem arrisca perde pontos.
 *
 * Alternativa medida que inverte isso (palpite 0 = não aposto, acerto +3,
 * erro sem penalidade): não apostar = 0, apostar em 6 = +2,1, apostar nos 11
 * = +4,8 — aí quanto mais o usuário se expõe, mais ele pode ganhar, e o
 * "acertar em cheio" continua valendo.
 */
export const ZERO_CONTA_COMO_APOSTA = false;

/**
 * Pontos de uma estatística isolada. Tudo ou nada: não existe "chegou perto".
 */
export function pontuarEstatistica(palpite: number, real: number): number {
  if (!ZERO_CONTA_COMO_APOSTA && palpite === 0) return 0;
  return palpite === real ? PONTOS_ACERTO : PONTOS_ERRO;
}

export interface PickPontuavel {
  predGoals: number;
  predAssists: number;
  actualGoals: number;
  actualAssists: number;
}

/** Gols e assistências são avaliados separadamente: -6 a +6 por jogador. */
export function pontuarPick(p: PickPontuavel): number {
  return (
    pontuarEstatistica(p.predGoals, p.actualGoals) +
    pontuarEstatistica(p.predAssists, p.actualAssists)
  );
}

export function pontuarEscalacao(picks: PickPontuavel[]): number {
  return picks.reduce((total, p) => total + pontuarPick(p), 0);
}

// ---------------------------------------------------------------------------
// Formações
// ---------------------------------------------------------------------------

export interface Formacao {
  code: string;
  /** jogadores de linha, da defesa para o ataque — "4-2-3-1" é [4,2,3,1] */
  linhas: number[];
}

/** o goleiro é sempre 1 e não entra no código da formação */
export const GOLEIROS = 1;

export const FORMACOES: Formacao[] = [
  {code: '4-3-3', linhas: [4, 3, 3]},
  {code: '4-4-2', linhas: [4, 4, 2]},
  {code: '4-2-3-1', linhas: [4, 2, 3, 1]},
  {code: '3-5-2', linhas: [3, 5, 2]},
  {code: '3-4-3', linhas: [3, 4, 3]},
  {code: '5-3-2', linhas: [5, 3, 2]},
];

export function acharFormacao(code: string): Formacao | null {
  return FORMACOES.find((f) => f.code === code) ?? null;
}

/** total de jogadores de uma formação — sempre 11 */
export function tamanhoEscalacao(f: Formacao): number {
  return GOLEIROS + f.linhas.reduce((a, b) => a + b, 0);
}

export interface PosicaoCampo {
  /** 1..11, na mesma ordem usada em fantasy_picks.slot */
  slot: number;
  /** porcentagem da largura do campo */
  x: number;
  /** porcentagem da altura; 0 é o ataque, 100 é o próprio gol */
  y: number;
  /** o que aparece desenhado na vaga: LE, ZAG, VOL, MC, PE… */
  rotulo: RotuloVaga;
}

// o gol fica embaixo e o ataque em cima, como na página do jogador
const Y_GOLEIRO = 90;
const Y_PRIMEIRA_LINHA = 74;
const Y_ULTIMA_LINHA = 18;

/**
 * Rótulo de cada vaga, linha por linha, para as formações que existem.
 *
 * É uma tabela escrita à mão em vez de regra genérica porque a leitura muda
 * com o desenho: os homens de ponta de uma linha de 4 defensores são laterais,
 * mas numa linha de 3 são todos zagueiros; e as pontas do meio-campo viram
 * alas (LE/LD) quando a defesa tem 3, porque é quem de fato ocupa o corredor.
 *
 * Cada entrada precisa bater com `linhas` da formação; se não bater,
 * `posicoesDaFormacao` cai no rótulo genérico daquela linha.
 */
const ROTULOS: Record<string, RotuloVaga[][]> = {
  '4-3-3': [
    ['LE', 'ZAG', 'ZAG', 'LD'],
    ['MC', 'VOL', 'MC'],
    ['PE', 'CA', 'PD'],
  ],
  '4-4-2': [
    ['LE', 'ZAG', 'ZAG', 'LD'],
    ['ME', 'VOL', 'VOL', 'MD'],
    ['CA', 'CA'],
  ],
  '4-2-3-1': [
    ['LE', 'ZAG', 'ZAG', 'LD'],
    ['VOL', 'VOL'],
    ['ME', 'MC', 'MD'],
    ['CA'],
  ],
  '3-5-2': [
    ['ZAG', 'ZAG', 'ZAG'],
    ['LE', 'VOL', 'MC', 'VOL', 'LD'],
    ['CA', 'CA'],
  ],
  '3-4-3': [
    ['ZAG', 'ZAG', 'ZAG'],
    ['LE', 'VOL', 'VOL', 'LD'],
    ['PE', 'CA', 'PD'],
  ],
  '5-3-2': [
    ['LE', 'ZAG', 'ZAG', 'ZAG', 'LD'],
    ['MC', 'VOL', 'MC'],
    ['CA', 'CA'],
  ],
};

/** rede de segurança para formação sem entrada na tabela acima */
function rotuloDaLinha(indice: number, total: number): RotuloVaga {
  if (indice === 0) return 'ZAG';
  if (indice === total - 1) return 'CA';
  return total >= 4 && indice === 1 ? 'VOL' : 'MC';
}

/**
 * Onde cada vaga fica desenhada no campo.
 *
 * O slot 1 é sempre o goleiro; as demais seguem a ordem das linhas, o que
 * mantém a numeração estável quando o usuário troca de formação — quem já
 * estava na vaga 2 continua na vaga 2.
 */
export function posicoesDaFormacao(f: Formacao): PosicaoCampo[] {
  const posicoes: PosicaoCampo[] = [
    {slot: 1, x: 50, y: Y_GOLEIRO, rotulo: 'GOL'},
  ];

  const nLinhas = f.linhas.length;
  const passo =
    nLinhas > 1 ? (Y_PRIMEIRA_LINHA - Y_ULTIMA_LINHA) / (nLinhas - 1) : 0;

  const tabela = ROTULOS[f.code];

  let slot = 2;
  f.linhas.forEach((qtd, i) => {
    const y = nLinhas > 1 ? Y_PRIMEIRA_LINHA - i * passo : 46;
    // só usa a tabela quando ela descreve exatamente esta linha
    const daLinha = tabela?.[i]?.length === qtd ? tabela[i] : null;
    for (let j = 0; j < qtd; j++) {
      posicoes.push({
        slot: slot++,
        // distribui na horizontal deixando margem nas laterais
        x: ((j + 1) * 100) / (qtd + 1),
        y,
        rotulo: daLinha ? daLinha[j] : rotuloDaLinha(i, nLinhas),
      });
    }
  });

  return posicoes;
}

// ---------------------------------------------------------------------------
// Validação da escalação
// ---------------------------------------------------------------------------

/** máximo aceito num palpite: acima disso é digitação errada, não aposta */
export const MAX_PALPITE = 9;

export interface PickEnviado {
  playerId: string;
  predGoals: number;
  predAssists: number;
}

export type ErroValidacao =
  | {tipo: 'formacao-invalida'; code: string}
  | {tipo: 'quantidade-errada'; esperado: number; recebido: number}
  | {tipo: 'jogador-repetido'; playerId: string}
  | {tipo: 'palpite-invalido'; playerId: string}
  | {tipo: 'prazo-encerrado'; deadline: string};

/**
 * Valida uma escalação antes de gravar. Devolve a lista de problemas —
 * vazia quer dizer que pode salvar.
 *
 * `agora` entra por parâmetro para o teste não depender do relógio.
 */
export function validarEscalacao(
  formacaoCode: string,
  picks: PickEnviado[],
  deadlineISO: string,
  agora: Date,
): ErroValidacao[] {
  const erros: ErroValidacao[] = [];

  const formacao = acharFormacao(formacaoCode);
  if (!formacao) {
    erros.push({tipo: 'formacao-invalida', code: formacaoCode});
    return erros;
  }

  const deadline = new Date(deadlineISO);
  if (agora >= deadline) {
    erros.push({tipo: 'prazo-encerrado', deadline: deadlineISO});
  }

  const esperado = tamanhoEscalacao(formacao);
  if (picks.length !== esperado) {
    erros.push({tipo: 'quantidade-errada', esperado, recebido: picks.length});
  }

  const vistos = new Set<string>();
  for (const p of picks) {
    if (vistos.has(p.playerId)) {
      erros.push({tipo: 'jogador-repetido', playerId: p.playerId});
    }
    vistos.add(p.playerId);

    const valores = [p.predGoals, p.predAssists];
    if (
      valores.some(
        (v) => !Number.isInteger(v) || v < 0 || v > MAX_PALPITE,
      )
    ) {
      erros.push({tipo: 'palpite-invalido', playerId: p.playerId});
    }
  }

  return erros;
}

// ---------------------------------------------------------------------------
// Prazo
// ---------------------------------------------------------------------------

/** a escalação fecha 2 horas antes do primeiro jogo da rodada */
export const HORAS_ANTES = 2;

export function calcularDeadline(primeiroJogo: Date): Date {
  return new Date(primeiroJogo.getTime() - HORAS_ANTES * 60 * 60 * 1000);
}

export function prazoAberto(deadlineISO: string, agora: Date): boolean {
  return agora < new Date(deadlineISO);
}
