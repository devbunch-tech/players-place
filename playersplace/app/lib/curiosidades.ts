/**
 * Curiosidades exibidas quando o carregamento demora.
 *
 * REGRA DE OURO: todo fato aqui precisa continuar verdadeiro daqui a cinco
 * anos, sem ninguém revisar. Por isso quase todos são **ancorados a um ano**
 * ("em 2025, os clubes gastaram…"): esse tipo de frase não envelhece. Já
 * "o maior artilheiro das Copas é X" apodrece na próxima Copa e vira uma
 * informação errada num site cujo público sabe exatamente essas coisas.
 *
 * Este arquivo foi escrito em 03/08/2026, logo após a Copa dos EUA/Canadá/
 * México. Cada número foi conferido na fonte antes de entrar.
 */

export interface Curiosidade {
  texto: string;
  /** de onde o número saiu, para conferir quando alguém duvidar */
  fonte: string;
}

export const CURIOSIDADES: Curiosidade[] = [
  {
    texto:
      'Em 2025 os clubes gastaram US$ 13,11 bilhões em transferências — o primeiro ano acima dos US$ 10 bilhões.',
    fonte: 'FIFA, International Transfer Snapshot 2025',
  },
  {
    texto:
      'Foram 86.158 transferências internacionais em 2025, recorde absoluto no futebol masculino e feminino somados.',
    fonte: 'FIFA, International Transfer Snapshot 2025',
  },
  {
    texto:
      'A Inglaterra foi quem mais gastou no mercado em 2025: US$ 3,82 bilhões em contratações.',
    fonte: 'FIFA, International Transfer Snapshot 2025',
  },
  {
    texto:
      'O Brasil é o único pentacampeão do mundo: 1958, 1962, 1970, 1994 e 2002.',
    fonte: 'histórico das Copas',
  },
  {
    texto:
      'A Espanha é bicampeã mundial — levantou a taça em 2010 e de novo em 2026, batendo a Argentina na prorrogação.',
    fonte: 'final da Copa de 2026',
  },
  {
    texto:
      'A Copa de 2026 foi a primeira disputada por 48 seleções e a primeira sediada por três países.',
    fonte: 'FIFA, Copa do Mundo 2026',
  },
];

/**
 * Sorteia uma ordem para as curiosidades.
 *
 * Embaralhar em vez de começar sempre pela primeira: quem navega bastante
 * veria sempre o mesmo texto no começo de cada espera.
 *
 * Só pode ser chamada no cliente — `Math.random()` no render do servidor
 * geraria uma ordem diferente da do navegador e quebraria a hidratação.
 */
export function embaralhar<T>(itens: T[]): T[] {
  const copia = [...itens];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
