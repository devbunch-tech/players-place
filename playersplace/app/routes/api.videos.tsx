/**
 * Preenchimento da fila de vídeos de highlights, rodando dentro do Oxygen.
 *
 * O QUE FAZ: pega os próximos jogadores sem vídeo buscado, chama a mesma
 * `getPlayerHighlight` que a página do jogador usa e carimba quem foi
 * processado. Depois disto o vídeo já está no cache durável quando o primeiro
 * visitante chegar — em vez de ele pagar a busca e a espera.
 *
 * POR QUE ELE É PEQUENO E DEVAGAR, AO CONTRÁRIO DO /api/espelho
 *
 * A YouTube Data API v3 dá **10.000 unidades por dia** e cobra **100 por
 * busca**: cem buscas diárias para a plataforma inteira. Isso é duas ordens de
 * grandeza abaixo do que o Transfermarkt tolera, e muda o desenho todo:
 *
 *  - o lote é minúsculo, porque não há pressa que a cota permita;
 *  - a fila é ordenada por valor de mercado, e não por antiguidade, para que a
 *    cota do dia vá para os jogadores que serão de fato visitados;
 *  - o job carimba quem NÃO achou vídeo também, senão a fila nunca anda.
 *
 * A CONTA, PARA NINGUÉM SE ILUDIR
 *
 * Com ~13 mil jogadores nas 24 ligas e 100 buscas/dia, a cobertura completa
 * leva ~130 dias usando 100% da cota. Não é lentidão de implementação: é o
 * limite do plano gratuito da API. Cobrir os 500 mais valiosos — que
 * concentram quase todas as visitas — leva cinco dias.
 *
 * Para acelerar de verdade só há um caminho, e ele é externo: pedir aumento de
 * cota ao Google no console da API.
 *
 * USO
 *
 *   POST /api/videos?limite=10          → busca os próximos 10
 *   GET  /api/videos                    → só relata o tamanho da fila
 *   header: x-espelho-token: <ESPELHO_TOKEN ou AQUECIMENTO_TOKEN>
 */
import {getDb} from '~/lib/db';
import {LEAGUES} from '~/lib/tm';
import {lerJogadoresSemVideo, marcarVideo} from '~/lib/jogadores.server';
import {getPlayerHighlight} from '~/lib/youtube';
import type {Route} from './+types/api.videos';

/**
 * Jogadores por chamada.
 *
 * Dez porque cada um custa uma requisição à API do YouTube mais a gravação no
 * Supabase — vinte subrequisições, folgadíssimo para o Worker. Quem limita
 * aqui não é o teto do runtime, é a cota: dez chamadas destas já são o dia
 * inteiro de orçamento da API.
 */
const LOTE_PADRAO = 10;
const LOTE_MAX = 25;

/**
 * O escopo: as ligas do registro, como no /api/espelho e pelo mesmo motivo —
 * a `jogadores_base` tem dezenas de milhares de linhas de competições que a
 * plataforma não exibe, e cota gasta com elas é cota perdida.
 */
const LIGAS = LEAGUES.map((l) => l.code);

/** mesma política das outras rotas de manutenção — ver `api.aquecer.tsx` */
function autorizado(request: Request, env: Env): boolean {
  const esperado = env.ESPELHO_TOKEN || env.AQUECIMENTO_TOKEN;
  if (!esperado) return false;
  const recebido =
    request.headers.get('x-espelho-token') ??
    request.headers.get('x-aquecer-token') ??
    new URL(request.url).searchParams.get('token');
  return recebido === esperado;
}

export async function action({request, context}: Route.ActionArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  // Sem chave não há o que fazer, e é melhor dizer isso alto do que carimbar
  // uma fila inteira de jogadores como "buscados" tendo devolvido null para
  // todos — o que os tiraria da fila para sempre sem nenhum vídeo gravado.
  if (!context.env.YOUTUBE_API_KEY) {
    return Response.json(
      {erro: 'YOUTUBE_API_KEY não está no ambiente'},
      {status: 503},
    );
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const url = new URL(request.url);
  const limite = Math.min(
    LOTE_MAX,
    Math.max(1, Number(url.searchParams.get('limite')) || LOTE_PADRAO),
  );

  const comeco = Date.now();

  let fila;
  try {
    fila = await lerJogadoresSemVideo(db, {ligas: LIGAS, limite});
  } catch (e) {
    // fila vazia por erro de banco seria lida pelo job como "está tudo em dia"
    return Response.json({erro: (e as Error).message}, {status: 502});
  }

  if (!fila.length) {
    return Response.json({ok: true, processados: 0, proximo: false});
  }

  const processados: string[] = [];
  let comVideo = 0;
  let semVideo = 0;

  for (const j of fila) {
    // Em série, e não em paralelo: dez buscas simultâneas contra a API do
    // YouTube com a mesma chave é o padrão que rende 429, e um 429 aqui não
    // custa uma requisição — custa o resto da cota do dia em tentativas.
    const video = await getPlayerHighlight(
      j.id,
      j.nome,
      context.env.YOUTUBE_API_KEY,
      j.clube,
    );

    if (video) comVideo++;
    else semVideo++;

    // Carimba nos DOIS casos. Ver `marcarVideo`: a busca vazia custou as
    // mesmas 100 unidades, e repeti-la amanhã travaria a fila para sempre nos
    // jogadores que simplesmente não têm highlight publicado.
    processados.push(j.id);
  }

  try {
    await marcarVideo(db, processados);
  } catch (e) {
    // sem o carimbo eles voltam amanhã e a cota é gasta de novo nos mesmos —
    // desperdício caro, precisa aparecer como falha
    return Response.json(
      {
        erro: `buscou ${processados.length}, mas não conseguiu carimbar: ${(e as Error).message}`,
      },
      {status: 502},
    );
  }

  return Response.json({
    ok: true,
    processados: fila.length,
    comVideo,
    semVideo,
    // o job continua enquanto a fila devolver gente; quem para de verdade é o
    // orçamento de cota do lado de lá
    proximo: fila.length === limite,
    duracaoMs: Date.now() - comeco,
  });
}

/** GET não gasta cota nenhuma: serve para ver quanto falta. */
export async function loader({request, context}: Route.LoaderArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  try {
    const conta = (buscados: boolean) => {
      const q = db
        .from('jogadores_base')
        .select('id', {count: 'exact', head: true})
        .in('liga_code', LIGAS);
      return buscados ? q.not('video_em', 'is', null) : q.is('video_em', null);
    };

    const [feitos, faltam, proximos] = await Promise.all([
      conta(true),
      conta(false),
      lerJogadoresSemVideo(db, {ligas: LIGAS, limite: 5}),
    ]);

    const naFila = faltam.count ?? 0;

    return Response.json({
      buscados: feitos.count ?? 0,
      naFila,
      // A projeção em dias é o número que importa para decidir se vale pedir
      // aumento de cota ao Google. 100 buscas/dia é o teto do plano gratuito.
      diasNoRitmoAtual: Math.ceil(naFila / 100),
      proximos: proximos.map((j) => ({nome: j.nome, clube: j.clube})),
      chaveConfigurada: Boolean(context.env.YOUTUBE_API_KEY),
    });
  } catch (e) {
    return Response.json({erro: (e as Error).message}, {status: 502});
  }
}
