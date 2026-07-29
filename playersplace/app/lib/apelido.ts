/**
 * Validação e moderação do apelido do Game Fantasy.
 *
 * O apelido aparece no ranking público, então precisa passar por um filtro.
 * A checagem é feita sobre uma forma NORMALIZADA do texto — sem isso,
 * "v1@d0", "V I A D O" e "víado" escapariam de qualquer lista.
 *
 * Limite honesto: lista de palavras não resolve moderação. Ela pega o óbvio e
 * o disfarce simples; não pega ironia, combinação criativa nem ofensa
 * dirigida a uma pessoa. Para uma promoção com prêmio, vale ter revisão
 * humana dos apelidos que aparecem no topo do ranking antes de anunciar.
 */

export const MIN_LEN = 3;
export const MAX_LEN = 20;

/**
 * Reduz o texto ao "esqueleto" comparável: minúsculas, sem acento, sem
 * separador e com os disfarces numéricos mais comuns desfeitos.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tira acentos
    .replace(/0/g, 'o')
    .replace(/@/g, 'a') // @ vale 'a', não 'o' — "v1@d0" é "viado"
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, ''); // remove espaço, ponto, hífen, emoji…
}

/**
 * Termos bloqueados, já em forma normalizada.
 *
 * Só entram aqui radicais que dificilmente aparecem dentro de palavra comum,
 * porque a comparação é por substring: "ass" barraria "assistencia", então
 * fica de fora. A lista é um primeiro corte e precisa de curadoria com o uso
 * real — inclusive para remover o que gerar falso positivo.
 */
const BLOQUEADOS = [
  // sexual / pornográfico
  'porno', 'pornografia', 'xvideos', 'redtube', 'nudes',
  'buceta', 'bucetinha', 'xoxota', 'periquita',
  'caralho', 'pinto', 'rola', 'piroca', 'pica',
  'punheta', 'siririca', 'boquete', 'chupada',
  'foder', 'fodase', 'transar', 'gozada', 'gozar',
  'putaria', 'puta', 'putinha', 'vagabunda', 'prostituta', 'garotadeprograma',
  'fuck', 'shit', 'bitch', 'dick', 'pussy', 'cock', 'whore', 'slut',

  // homofóbico / transfóbico
  'viado', 'veado', 'bicha', 'bichinha', 'boiola', 'baitola',
  'sapatao', 'traveco', 'travecao', 'fresco',
  'faggot', 'fag', 'tranny',

  // racista
  'macaco', 'crioulo', 'negrodemerda', 'nigger', 'nigga',
  'judiar', 'nazista', 'hitler', 'kkk',

  // ofensa geral
  'filhodaputa', 'fdp', 'merda', 'bosta', 'cuzao', 'otario',
  'arrombado', 'corno', 'retardado', 'mongoloide', 'aleijado',
  'idiota', 'imbecil', 'babaca',
];

export type ResultadoApelido =
  | {ok: true; apelido: string; normalizado: string}
  | {ok: false; erro: string};

/**
 * Valida o apelido enviado. Devolve já normalizado, para gravar na coluna
 * que garante unicidade insensível a caixa e acento.
 */
export function validarApelido(bruto: string): ResultadoApelido {
  const apelido = bruto.trim().replace(/\s+/g, ' ');

  if (apelido.length < MIN_LEN) {
    return {ok: false, erro: `O apelido precisa ter ao menos ${MIN_LEN} letras.`};
  }
  if (apelido.length > MAX_LEN) {
    return {ok: false, erro: `O apelido pode ter no máximo ${MAX_LEN} caracteres.`};
  }
  // letras, números, espaço, ponto, hífen e underscore
  if (!/^[\p{L}\p{N} ._-]+$/u.test(apelido)) {
    return {ok: false, erro: 'Use apenas letras, números, espaço, ponto, hífen ou _.'};
  }

  const normalizado = normalizar(apelido);
  if (normalizado.length < MIN_LEN) {
    return {ok: false, erro: 'O apelido precisa ter ao menos 3 letras de verdade.'};
  }

  for (const termo of BLOQUEADOS) {
    if (normalizado.includes(termo)) {
      return {
        ok: false,
        erro: 'Esse apelido não é permitido. Escolha outro, sem termo ofensivo.',
      };
    }
  }

  return {ok: true, apelido, normalizado};
}
