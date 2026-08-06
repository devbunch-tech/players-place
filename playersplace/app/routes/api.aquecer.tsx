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
import {findLeague, getLeagueOverview, renovarClube} from '~/lib/tm';
import {getDb} from '~/lib/db';
import {
  gravarElencoBase,
  registrarExecucao,
  type ResumoExecucao,
} from '~/lib/jogadores.server';
import type {Route} from './+types/api.aquecer';

/** as competições que a plataforma trata como prioritárias */
const PADRAO = 'BRA1';

/**
 * Quantos clubes por chamada. Dez porque a Série A tem 20 e a B tem 20: duas
 * chamadas por série é pouco o bastante para o job ser simples e pequeno o
 * bastante para caber com folga no teto de subrequests do Worker.
 */
const LOTE_PADRAO = 10;

/** teto do que aceitamos numa chamada, mesmo se pedirem mais */
const LOTE_MAX = 20;

/**
 * Pausa entre clubes. A origem é de terceiros e este job é a única parte do
 * sistema que a consulta em rajada — 400 ms mantém o ritmo abaixo do de um
 * humano navegando rápido.
 */
const PAUSA_MS = 400;

function autorizado(request: Request, env: Env): boolean {
  const esperado = env.AQUECIMENTO_TOKEN;
  // sem token cadastrado a rota fica desligada, e não aberta: ela custa
  // dezenas de requisições ao Transfermarkt por chamada
  if (!esperado) return false;
  const recebido =
    request.headers.get('x-aquecer-token') ??
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
  let jogadores = 0;
  let processados = 0;

  for (const [i, c] of fatia.entries()) {
    if (i > 0) await esperar(PAUSA_MS);
    try {
      const club = await renovarClube(c.id);
      jogadores += await gravarElencoBase(db, {
        clubeId: c.id,
        ligaCode: liga.code,
        club,
      });
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
    de: inicio,
    ate: fim,
    total: clubes.length,
    proximo,
  });
}

/** GET não escreve nada: serve para conferir se a base está viva. */
export async function loader({request, context}: Route.LoaderArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const [{data: execucoes}, {count}] = await Promise.all([
    db
      .from('jogadores_base_execucao')
      .select('*')
      .order('concluido_em', {ascending: false}),
    db.from('jogadores_base').select('id', {count: 'exact', head: true}),
  ]);

  return Response.json({jogadores: count ?? 0, execucoes: execucoes ?? []});
}
