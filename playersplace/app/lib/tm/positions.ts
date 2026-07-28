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
