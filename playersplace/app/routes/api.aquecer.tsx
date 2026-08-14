/**
 * Aquecimento da base de jogadores.
 *
 * O QUE FAZ: lê a lista de clubes de uma competição, raspa o elenco de cada um
 * direto da origem e materializa os jogadores em `jogadores_base` — a tabela
 * que a página do jogador consulta para pintar o topo sem esperar raspagem
 * nenhuma. De quebra, cada elenco raspado reabastece a `tm_cache`, então a
 * página do clube também sai do forno quente.
 *
 * POR QUE UM ENDPOINT, E NÃO MAIS URLs NO GITHUB ACTIONS: o job de páginas
 * (.github/workflows/aquecer-cache.yml) aquece visitando o site, sem token e
 * sem superfície nova. Isso funciona para páginas, mas não aqui: nenhuma
 * visita ESCREVE em `jogadores_base`, e 40 clubes viram 40 respostas HTML
 * completas atravessando a internet só para provocar um efeito colateral. Um
 * POST resolve as duas séries em duas chamadas.
 *
 * POR QUE EM LOTES: o Worker tem teto de subrequests por requisição. Cada
 * clube custa uma raspagem mais as escritas no Supabase, então o job pede
 * `limite` clubes por vez e usa o `proximo` da resposta para continuar de onde
 * parou. Sem lote, uma série inteira estouraria o teto no meio e deixaria a
 * base pela metade — sem erro visível.
 *
 * Uso:
 *   POST /api/aquecer?liga=BRA1&inicio=0&limite=10
 *   header: x-aquecer-token: <AQUECIMENTO_TOKEN>
 *
 *   GET  /api/aquecer   → só relata o estado da base (não escreve nada)
 */
import {
  findLeague,
  getClubAbsences,
  getClubForm,
  getLeagueOverview,
  renovarClube,
} from '~/lib/tm';
import {expurgarVazias} from '~/lib/tm/client';
import {getDb} from '~/lib/db';
import {
  gravarElencoBase,
  marcarSujos,
  registrarExecucao,
  type ResumoExecucao,
} from '~/lib/jogadores.server';
import type {Route} from './+types/api.aquecer';

/** as competições que a plataforma trata como prioritárias */
const PADRAO = 'BRA1';

/**
 * Quantos clubes por chamada.
 *
 * CAIU DE 10 PARA 5 quando os dois sinais de sentinela entraram aqui: o custo
 * por clube subiu de ~4 subrequisições (raspar o elenco + as escritas do
 * Supabase) para ~7 (mais ausências, forma e a marcação). Cinco mantém a
 * chamada na mesma casa de antes — ~35 — em vez de dobrá-la para 70, que é
 * onde um teto de subrequisições do Worker começaria a ser plausível.
 *
 * Chamar mais vezes é barato: o laço do job já usa o `proximo` da resposta.
 * Estourar o teto no meio, não — deixa a base pela metade sem erro visível.
 */
const LOTE_PADRAO = 5;

/** teto do que aceitamos numa chamada, mesmo se pedirem mais */
const LOTE_MAX = 10;

/**
 * Quantos dias para trás um jogo conta como "acabou de acontecer".
 *
 * Dois, e não um, porque o job roda diariamente: um dia em que o Actions falhe
 * não pode deixar uma rodada inteira passar sem ninguém marcar os elencos que
 * entraram em campo. O custo de errar para mais é re-raspar um elenco à toa; o
 * de errar para menos é o espelho congelar sem sinal nenhum.
 */
const DIAS_JOGO_RECENTE = 2;

/** aaaammdd de N dias atrás — o formato de `sortKey` de `ClubMatch` */
function chaveDeDiasAtras(dias: number): string {
  const d = new Date(Date.now() - dias * 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

/**
 * Quem, neste clube, mudou sem que o elenco mostrasse.
 *
 * POR QUE ISTO PRECISOU VIR PARA CÁ
 *
 * A sentinela tem três sinais, e até agora só um rodava em produção. O elenco
 * publicado (nome, número, posição, valor, clube) é comparado por
 * `gravarElencoBase` e pega transferência, promoção e reavaliação de mercado.
 * Os outros dois viviam só em `scripts/espelho.ts` — que não roda mais, porque
 * os runners do Actions levam 403 do WAF. O efeito era silencioso e grave: um
 * jogador que atuou no domingo, sem mudar de número nem de valor, NUNCA era
 * marcado como sujo. O histórico de jogos e o desempenho dele no espelho
 * congelavam, e só se moviam se alguém abrisse a página e a validade da chave
 * tivesse vencido.
 *
 * Os dois sinais que faltavam:
 *
 *  1. está no departamento médico — uma lesão nova não mexe em uma linha
 *     sequer do elenco, e muda a página do jogador;
 *  2. o clube entrou em campo — aí o histórico de jogos e o desempenho por
 *     temporada de TODO o elenco mudaram de uma vez.
 *
 * Nunca lança: sentinela é heurística, e uma falha aqui significa "não
 * descobri nada novo neste clube hoje", não "aborte o aquecimento".
 */
async function sinaisDeMudanca(
  clubeId: string,
  elenco: string[],
  recente: string,
): Promise<string[]> {
  const ids = new Set<string>();

  try {
    for (const a of await getClubAbsences(clubeId)) {
      if (a.playerId) ids.add(a.playerId);
    }
  } catch {
    // sem a lista de ausências o clube segue pelos outros dois sinais
  }

  try {
    const {last} = await getClubForm(clubeId);
    if (last.some((m) => m.sortKey >= recente)) {
      for (const id of elenco) ids.add(id);
    }
  } catch {
    // idem: a próxima passada tenta de novo
  }

  return [...ids];
}

/**
 * Pausa entre clubes. A origem é de terceiros e este job é a única parte do
 * sistema que a consulta em rajada — 400 ms mantém o ritmo abaixo do de um
 * humano navegando rápido.
 */
const PAUSA_MS = 400;

/**
 * Os dois nomes de token, e os dois nomes de cabeçalho, valem aqui.
 *
 * NÃO É TOLERÂNCIA GRATUITA — é o conserto de uma assimetria que já custou uma
 * execução: o `/api/espelho` aceita `ESPELHO_TOKEN || AQUECIMENTO_TOKEN` desde
 * que foi escrito, e esta rota aceitava só o segundo. Como o repositório tem
 * cadastrado apenas o `ESPELHO_TOKEN`, o job de espelho de 10/08/2026 às 21:59
 * levou 401 nas duas competições e não gravou uma linha — com a mensagem
 * "nenhum clube gravado", que aponta para a origem e não para o token.
 *
 * As duas rotas são o mesmo tipo de job de manutenção, protegidas pelo mesmo
 * segredo. Exigir dois nomes diferentes para a mesma coisa não acrescenta
 * segurança nenhuma; só cria este modo de falha.
 */
function autorizado(request: Request, env: Env): boolean {
  const esperado = env.AQUECIMENTO_TOKEN || env.ESPELHO_TOKEN;
  // sem token cadastrado a rota fica desligada, e não aberta: ela custa
  // dezenas de requisições ao Transfermarkt por chamada
  if (!esperado) return false;
  const recebido =
    request.headers.get('x-aquecer-token') ??
    request.headers.get('x-espelho-token') ??
    new URL(request.url).searchParams.get('token');
  return recebido === esperado;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function action({request, context}: Route.ActionArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const url = new URL(request.url);
  const liga = findLeague(url.searchParams.get('liga') ?? PADRAO);
  if (!liga) {
    return Response.json({erro: 'competição desconhecida'}, {status: 400});
  }

  const inicio = Math.max(0, Number(url.searchParams.get('inicio')) || 0);
  const limite = Math.min(
    LOTE_MAX,
    Math.max(1, Number(url.searchParams.get('limite')) || LOTE_PADRAO),
  );

  // Expurgo antes de qualquer leitura: a lista de clubes logo abaixo sai do
  // cache normal, e se ela estiver envenenada (vazia) o job aquece zero clubes
  // e ainda carimba a execução como concluída — foi exatamente o que aconteceu
  // em 06/08/2026. Limpar primeiro faz a lista ser rebuscada na origem.
  //
  // Só no primeiro lote: a varredura é a mesma nos lotes seguintes e repeti-la
  // três vezes por série seria trabalho de banco jogado fora.
  const expurgo = inicio === 0 ? await expurgarVazias(db) : null;

  const comeco = Date.now();

  // a lista de clubes vem do cache normal de propósito: ela muda uma vez por
  // temporada, e re-raspá-la a cada lote seria uma requisição jogada fora
  let clubes;
  try {
    clubes = (await getLeagueOverview(liga.code)).clubs;
  } catch (e) {
    return Response.json(
      {erro: `não foi possível listar os clubes: ${(e as Error).message}`},
      {status: 502},
    );
  }

  const fatia = clubes.slice(inicio, inicio + limite);
  const erros: string[] = [];
  const recente = chaveDeDiasAtras(DIAS_JOGO_RECENTE);
  let jogadores = 0;
  let processados = 0;
  let sujos = 0;

  for (const [i, c] of fatia.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    try {
      const club = await renovarClube(c.id);
      jogadores += await gravarElencoBase(db, {
        clubeId: c.id,
        ligaCode: liga.code,
        club,
      });

      // DEPOIS de gravar o elenco, e não antes: `gravarElencoBase` faz o upsert
      // das linhas, e marcar um jogador que ainda não existe na base não teria
      // efeito nenhum — o `update` do `marcarSujos` não alcança linha ausente.
      // `players` pode vir vazio de um clube sem elenco publicado, e aí só o
      // sinal de lesão tem o que dizer. O `?? []` não é zelo gratuito:
      // `gravarElencoBase` trata esse caso devolvendo 0, e um `.map` em
      // undefined aqui derrubaria o clube inteiro para o `catch` de fora.
      const marcar = await sinaisDeMudanca(
        c.id,
        club.players?.map((p) => p.id) ?? [],
        recente,
      );
      if (marcar.length) {
        try {
          sujos += await marcarSujos(db, marcar);
        } catch (e) {
          // o elenco já está gravado; o que se perde é a marcação de hoje
          erros.push(`marcar sujos ${c.name || c.id}: ${(e as Error).message}`);
        }
      }

      processados++;
    } catch (e) {
      // um clube fora do ar não pode abortar a série inteira: ele volta no
      // lote de amanhã, e a linha antiga dele continua servindo até lá
      erros.push(`${c.name || c.id}: ${(e as Error).message}`);
    }
  }

  const fim = inicio + fatia.length;
  const proximo = fim < clubes.length ? fim : null;

  const resumo: ResumoExecucao = {
    liga: liga.code,
    clubes: processados,
    jogadores,
    erros,
    duracaoMs: Date.now() - comeco,
  };

  // só carimba a execução quando a série terminou; carimbar por lote faria o
  // painel mostrar "20 jogadores" no lugar de "600"
  if (proximo === null) await registrarExecucao(db, resumo);

  return Response.json({
    ok: erros.length === 0,
    ...resumo,
    // quantos jogadores a sentinela mandou para a fila de raspagem profunda.
    // Vai no corpo porque é o número que diz se ela está VIVA: zero sujos
    // durante uma rodada inteira é sintoma, não silêncio.
    sujos,
    de: inicio,
    ate: fim,
    total: clubes.length,
    proximo,
    // sai só quando houve o que limpar: num dia normal é ruído no log do job
    ...(expurgo?.removidas.length ? {expurgadas: expurgo.removidas} : {}),
  });
}

/** GET não escreve nada: serve para conferir se a base está viva. */
export async function loader({request, context}: Route.LoaderArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const [execucao, contagem] = await Promise.all([
    db
      .from('jogadores_base_execucao')
      .select('*')
      .order('concluido_em', {ascending: false}),
    db.from('jogadores_base').select('id', {count: 'exact', head: true}),
  ]);

  // `count ?? 0` sozinho mentia: tabela ausente e tabela vazia devolviam o
  // mesmo `{jogadores: 0}`, e a migração 005 não aplicada ficava indistinguível
  // de um aquecimento que ainda não rodou. O erro do Postgres precisa aparecer.
  const erros = [contagem.error, execucao.error]
    .filter((e) => e)
    .map((e) => e!.message);

  return Response.json({
    jogadores: contagem.count ?? 0,
    execucoes: execucao.data ?? [],
    ...(erros.length ? {erros} : {}),
  });
}
