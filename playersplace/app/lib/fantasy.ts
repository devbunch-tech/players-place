/**
 * Regras do Game Fantasy.
 *
 * Módulo puro: sem I/O, sem banco. Tudo aqui é determinístico e testável,
 * porque é o que decide quem ganha prêmio.
 */

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
  defensores: number;
  meias: number;
  atacantes: number;
}

/** o goleiro é sempre 1 e não entra no código da formação */
export const GOLEIROS = 1;

export const FORMACOES: Formacao[] = [
  {code: '4-3-3', defensores: 4, meias: 3, atacantes: 3},
  {code: '4-4-2', defensores: 4, meias: 4, atacantes: 2},
  {code: '4-2-3-1', defensores: 4, meias: 5, atacantes: 1},
  {code: '3-5-2', defensores: 3, meias: 5, atacantes: 2},
  {code: '3-4-3', defensores: 3, meias: 4, atacantes: 3},
  {code: '5-3-2', defensores: 5, meias: 3, atacantes: 2},
];

export function acharFormacao(code: string): Formacao | null {
  return FORMACOES.find((f) => f.code === code) ?? null;
}

/** total de jogadores de uma formação — sempre 11 */
export function tamanhoEscalacao(f: Formacao): number {
  return GOLEIROS + f.defensores + f.meias + f.atacantes;
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
