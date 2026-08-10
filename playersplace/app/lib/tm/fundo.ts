/**
 * A raspagem profunda de um jogador — as ~10 chaves que compõem a página dele.
 *
 * POR QUE ISTO É UM MÓDULO, E NÃO CÓDIGO DENTRO DO JOB
 *
 * Existem dois caminhos para preencher o espelho, e eles não são intercambiáveis:
 *
 *  - `scripts/espelho.ts`, em Node no GitHub Actions;
 *  - `/api/espelho`, no Worker do Oxygen.
 *
 * O segundo precisou existir porque, medido em 10/08/2026, os runners do Actions
 * levam **403 do WAF do CloudFront** em `tmapi.transfermarkt.technology` — as
 * cinco chaves de desempenho, carreira, titularidades, jogos e seleção. O host
 * de HTML responde 200 normalmente para eles, e o Oxygen passa em tudo (a mesma
 * chave `perf:` que o Actions não conseguiu foi gravada por produção dois
 * minutos depois). Ou seja: a diferença é a rede de saída, não o código.
 *
 * Manter a lista de chaves em um lugar só é o que impede as duas rotas de
 * divergirem — uma chave nova aqui entra nos dois caminhos de uma vez.
 *
 * DIFERENÇA DE COMPORTAMENTO ENTRE OS DOIS
 *
 * Este módulo chama os getters normais de `index.ts`, que passam por `cached()`.
 * No Worker isso é exatamente o que se quer: chave ausente vai à origem e é
 * gravada; chave fresca não é buscada de novo, porque já está atual. No job em
 * Node, `ativarModoEspelho()` faz `cached()` se comportar como `renovar()` e ir
 * sempre à origem — é o mesmo código produzindo a política certa de cada lado.
 *
 * O modo espelho NÃO pode ser ligado no Worker: ele é estado de módulo, e
 * desligaria as três camadas de cache para todos os visitantes daquele isolate.
 */
import {
  getPlayer,
  getPlayerCareer,
  getPlayerGameLog,
  getPlayerInjuries,
  getPlayerMarketValueGraph,
  getPlayerNationalCareer,
  getPlayerPerformance,
  getPlayerRumors,
  getPlayerStartsBySeason,
  getPlayerTransfers,
} from './index';

/** quantas chaves uma raspagem completa produz — usado para medir o estrago */
export const CHAVES_POR_JOGADOR = 10;

const motivo = (e: unknown) => (e as Error)?.message ?? String(e);

/**
 * A falha diz "não deu para saber", e não "não existe"?
 *
 * A distinção decide se o jogador sai da fila. Um 404 é resposta: aquele
 * jogador não tem página de rumores, e insistir amanhã só gastaria requisição.
 * Qualquer outra coisa — origem fora do ar, 403, 429, 5xx — significa que a
 * chave continua faltando no espelho, e ela precisa voltar amanhã.
 *
 * Sem esta separação, uma passada inteira atrás de um IP bloqueado marcaria
 * milhares de jogadores como raspados a fundo com metade das chaves faltando —
 * e eles nunca mais voltariam à fila. O espelho ficaria furado em silêncio.
 */
export function transitoria(e: unknown): boolean {
  return !/respondeu 404/.test(motivo(e));
}

export interface ResultadoFundo {
  /** chaves que ficaram faltando por motivo transitório; 0 = pode sair da fila */
  faltando: number;
  /** o que deu errado, para o job poder relatar */
  erros: string[];
}

/**
 * Raspa as ~10 chaves de um jogador. Nunca lança.
 *
 * Sequencial, e não `Promise.all`, por dois motivos: no job o ritmo mínimo
 * serializa tudo de qualquer jeito, e `perf`/`career`/`starts` são construídos
 * sobre a MESMA chave `perfraw:` — em série a segunda e a terceira acertam a
 * memória do processo, em paralelo as três iriam à origem buscar o mesmo JSON.
 * No Worker a serialização também protege o teto de subrequisições.
 *
 * Cada chave é tentada isoladamente: um jogador sem histórico de seleção não
 * pode custar a carreira dele.
 */
export async function rasparJogador(id: string): Promise<ResultadoFundo> {
  const erros: string[] = [];
  let faltando = 0;

  const chave = async (rotulo: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      erros.push(`${rotulo}: ${motivo(e)}`);
      if (transitoria(e)) faltando++;
    }
  };

  await chave('ficha', () => getPlayer(id));
  await chave('desempenho', () => getPlayerPerformance(id));
  await chave('carreira', () => getPlayerCareer(id));
  await chave('titularidades', () => getPlayerStartsBySeason(id));
  await chave('jogos', () => getPlayerGameLog(id));
  await chave('seleção', () => getPlayerNationalCareer(id));
  await chave('valor', () => getPlayerMarketValueGraph(id));
  await chave('transferências', () => getPlayerTransfers(id));
  await chave('lesões', () => getPlayerInjuries(id));
  await chave('rumores', () => getPlayerRumors(id));

  return {faltando, erros};
}
