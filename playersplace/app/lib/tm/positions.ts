/**
 * Posições do Transfermarkt (ids de `/attributes`) com nome pt-BR e
 * coordenadas em % no campo desenhado pelo componente PositionsPitch —
 * gol do próprio time embaixo, ataque em cima.
 */
export interface PositionMeta {
  id: number;
  name: string;
  short: string;
  /** distância da esquerda, em % */
  x: number;
  /** distância do topo, em % */
  y: number;
}

export const POSITIONS: Record<number, PositionMeta> = {
  1: {id: 1, name: 'Goleiro', short: 'GOL', x: 50, y: 92},
  2: {id: 2, name: 'Líbero', short: 'LIB', x: 50, y: 82},
  3: {id: 3, name: 'Zagueiro', short: 'ZAG', x: 50, y: 74},
  4: {id: 4, name: 'Lateral-esquerdo', short: 'LE', x: 14, y: 72},
  5: {id: 5, name: 'Lateral-direito', short: 'LD', x: 86, y: 72},
  6: {id: 6, name: 'Volante', short: 'VOL', x: 50, y: 61},
  7: {id: 7, name: 'Meio-campista central', short: 'MC', x: 50, y: 48},
  8: {id: 8, name: 'Meia-direita', short: 'MD', x: 86, y: 46},
  9: {id: 9, name: 'Meia-esquerda', short: 'ME', x: 14, y: 46},
  10: {id: 10, name: 'Meia-atacante', short: 'MA', x: 50, y: 35},
  11: {id: 11, name: 'Ponta-esquerda', short: 'PE', x: 14, y: 18},
  12: {id: 12, name: 'Ponta-direita', short: 'PD', x: 86, y: 18},
  13: {id: 13, name: 'Segundo-atacante', short: 'SA', x: 50, y: 22},
  14: {id: 14, name: 'Centroavante', short: 'CA', x: 50, y: 9},
};

export function positionMeta(id: number | null | undefined): PositionMeta | null {
  return id ? (POSITIONS[id] ?? null) : null;
}

// ---------- Setores de campo (usado pela escalação do Fantasy) ----------

/** as quatro faixas que uma vaga da escalação pode exigir */
export type Setor = 'GOL' | 'DEF' | 'MEI' | 'ATA';

const semAcento = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

/**
 * Ordem importa: "Meia Ofensivo" tem que cair em MEI antes de qualquer regra
 * de ataque, e "Seg. Atacante" tem que cair em ATA.
 */
const SETORES: [RegExp, Setor][] = [
  [/goleiro|goalkeeper|torwart/, 'GOL'],
  [/zagueiro|lateral|libero|defensor|defender|abwehr/, 'DEF'],
  [/volante|meia|meio|midfield|mittelfeld/, 'MEI'],
  [/centroavante|atacante|ponta|forward|striker|sturm/, 'ATA'],
];

/**
 * Setor de um jogador a partir da posição que o Transfermarkt publica —
 * "Zagueiro", "Lateral Esq.", "Meia Ofensivo", "Seg. Atacante"…
 *
 * Devolve `null` para redação desconhecida, e quem chama deve **liberar** a
 * escolha nesse caso. Errar para o lado do bloqueio é pior: uma palavra nova
 * do TM deixaria o usuário sem conseguir escalar ninguém.
 */
export function setorDaPosicao(posicao: string): Setor | null {
  const p = semAcento(posicao);
  for (const [re, setor] of SETORES) if (re.test(p)) return setor;
  return null;
}

/** rótulo desenhado numa vaga do campo */
export type RotuloVaga =
  | 'GOL'
  | 'LE'
  | 'ZAG'
  | 'LD'
  | 'VOL'
  | 'MC'
  | 'ME'
  | 'MD'
  | 'PE'
  | 'CA'
  | 'PD';

/**
 * Setor exigido por cada rótulo. É um `Record` completo de propósito: rótulo
 * novo sem setor vira erro de compilação, e não uma vaga que silenciosamente
 * passa a oferecer os jogadores errados no seletor.
 */
const SETOR_DA_VAGA: Record<RotuloVaga, Setor> = {
  GOL: 'GOL',
  LE: 'DEF',
  ZAG: 'DEF',
  LD: 'DEF',
  VOL: 'MEI',
  MC: 'MEI',
  ME: 'MEI',
  MD: 'MEI',
  PE: 'ATA',
  CA: 'ATA',
  PD: 'ATA',
};

export function setorDaVaga(rotulo: RotuloVaga): Setor {
  return SETOR_DA_VAGA[rotulo];
}

export const NOME_SETOR: Record<Setor, string> = {
  GOL: 'goleiros',
  DEF: 'defensores',
  MEI: 'meio-campistas',
  ATA: 'atacantes',
};

/**
 * Suspensão ou lesão, a partir do motivo que o TM escreve por extenso.
 * Não deu para conferir contra dado real — não havia nenhum suspenso no
 * mundo quando isto foi escrito —, então quem não casar aqui é tratado como
 * lesão e continua visível, nunca sumindo da tela.
 */
export function ehSuspensao(motivo: string): boolean {
  return /suspens|castig|cartao vermelho|gesperr|suspended|red card/.test(
    semAcento(motivo),
  );
}
