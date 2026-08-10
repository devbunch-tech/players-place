/**
 * Raspagem profunda do espelho, rodando DENTRO do Oxygen.
 *
 * POR QUE ESTE ENDPOINT EXISTE
 *
 * O plano original era o `scripts/espelho.ts` fazer isto no GitHub Actions, sem
 * gastar tempo de Worker nem esbarrar no teto de subrequisições. Medido em
 * 10/08/2026, não dá: os runners do Actions levam **403 do WAF do CloudFront**
 * em `tmapi.transfermarkt.technology`, que é a origem de cinco das dez chaves
 * de um jogador — desempenho, carreira, titularidades, jogos e seleção.
 *
 * A prova de que é a rede, e não o código: no mesmo minuto em que o job falhava
 * com 403 no runner, a chave `perf:686445` era gravada por produção. O Oxygen
 * passa; o Actions não. Então a raspagem profunda muda de casa, e o Actions vira
 * só o orquestrador — ele chama ESTE endpoint, no nosso próprio domínio, que
 * obviamente não bloqueia ninguém.
 *
 * POR QUE EM LOTES PEQUENOS
 *
 * Cada jogador custa ~10 requisições à origem mais as gravações no Supabase, e
 * o Worker tem teto de subrequisições por requisição. `limite` é deliberadamente
 * baixo: o job chama muitas vezes, em vez de pedir muito de uma vez e estourar
 * no meio — deixando jogadores marcados sem terem sido raspados.
 *
 * O QUE ELE NÃO FAZ
 *
 * Não liga o modo espelho. Aquilo é estado de módulo e desligaria as três
 * camadas de cache para TODOS os visitantes do isolate. Aqui os getters normais
 * bastam: chave ausente vai à origem e é gravada — que é o caso de todo jogador
 * com `fundo_em is null`, ou seja, o backfill inteiro. Chave fresca não é
 * rebuscada porque já está atual, e é isso que se quer.
 *
 * Também não impõe ritmo. `definirRitmo` é global do isolate e atrasaria as
 * páginas de visitantes reais. Quem espaça as chamadas é o job.
 *
 * USO
 *
 *   POST /api/espelho?ligas=BRA1,BRA2&limite=3
 *   header: x-espelho-token: <ESPELHO_TOKEN ou AQUECIMENTO_TOKEN>
 *
 *   GET  /api/espelho?ligas=BRA1,BRA2   → só relata o tamanho da fila
 */
import {getDb} from '~/lib/db';
import {rasparJogador} from '~/lib/tm/fundo';
import {findLeague} from '~/lib/tm';
import {lerJogadoresSujos, marcarFundo} from '~/lib/jogadores.server';
import type {Route} from './+types/api.espelho';

/**
 * Jogadores por chamada.
 *
 * Três porque cada um custa ~10 requisições à origem mais ~10 gravações no
 * Supabase: trinta a sessenta subrequisições, que cabe com folga em qualquer
 * teto plausível. Subir isto para ganhar velocidade é a troca errada — o custo
 * de estourar no meio é uma resposta perdida, e o de chamar mais vezes é
 * alguns segundos no job.
 */
const LOTE_PADRAO = 3;
const LOTE_MAX = 6;

/** o escopo combinado da raspagem profunda — ver o README */
const LIGAS_PADRAO = ['BRA1', 'BRA2'];

/**
 * Aceita os dois nomes de propósito: `AQUECIMENTO_TOKEN` já existe para o
 * `/api/aquecer`, e obrigar a cadastrar um segundo segredo para o mesmo tipo de
 * job de manutenção seria burocracia sem ganho de segurança.
 */
function autorizado(request: Request, env: Env): boolean {
  const esperado = env.ESPELHO_TOKEN || env.AQUECIMENTO_TOKEN;
  // sem token cadastrado a rota fica DESLIGADA, e não aberta: ela custa
  // dezenas de requisições ao Transfermarkt por chamada
  if (!esperado) return false;
  const recebido =
    request.headers.get('x-espelho-token') ??
    new URL(request.url).searchParams.get('token');
  return recebido === esperado;
}

/** os códigos pedidos, validados contra o registro; vazio = o padrão */
function lerLigas(url: URL): string[] | null {
  const bruto = url.searchParams.get('ligas');
  if (!bruto) return LIGAS_PADRAO;

  const codes: string[] = [];
  for (const c of bruto
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)) {
    const liga = findLeague(c);
    // resolver pelo registro conserta a caixa, e isso importa: a origem
    // DIFERENCIA maiúsculas (`TDeC` responde 200, `TDEC` responde 302)
    if (!liga) return null;
    codes.push(liga.code);
  }
  return codes;
}

export async function action({request, context}: Route.ActionArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const url = new URL(request.url);
  const ligas = lerLigas(url);
  if (!ligas) {
    return Response.json({erro: 'competição desconhecida'}, {status: 400});
  }

  const limite = Math.min(
    LOTE_MAX,
    Math.max(1, Number(url.searchParams.get('limite')) || LOTE_PADRAO),
  );

  const comeco = Date.now();

  let fila;
  try {
    fila = await lerJogadoresSujos(db, {ligas, limite});
  } catch (e) {
    // a fila vazia por erro de banco seria lida pelo job como "está tudo em
    // dia" — o pior desfecho possível. Precisa aparecer como falha.
    return Response.json({erro: (e as Error).message}, {status: 502});
  }

  if (!fila.length) {
    return Response.json({ok: true, processados: 0, proximo: false, fila: 0});
  }

  const prontos: string[] = [];
  const incompletos: {id: string; nome: string; faltando: number}[] = [];
  const erros: string[] = [];

  for (const j of fila) {
    const {faltando, erros: quais} = await rasparJogador(j.id);

    // SÓ sai da fila quem voltou inteiro. Marcar um jogador com metade das
    // chaves faltando o tiraria da fila para sempre, e o espelho ficaria
    // permanentemente furado sem nenhum sinal de que ficou.
    if (faltando === 0) prontos.push(j.id);
    else {
      incompletos.push({id: j.id, nome: j.nome, faltando});
      erros.push(...quais.map((q) => `${j.nome}: ${q}`));
    }
  }

  try {
    await marcarFundo(db, prontos);
  } catch (e) {
    // sem o carimbo, estes jogadores voltam na próxima chamada e são raspados
    // de novo — desperdício, não corrupção. Melhor relatar do que fingir.
    return Response.json(
      {
        erro: `raspou ${prontos.length}, mas não conseguiu carimbar: ${(e as Error).message}`,
      },
      {status: 502},
    );
  }

  return Response.json({
    ok: incompletos.length === 0,
    processados: fila.length,
    completos: prontos.length,
    incompletos,
    // o job continua enquanto a fila devolver gente; quando ela seca, `fila`
    // volta menor que o limite e não há mais o que pedir
    proximo: fila.length === limite,
    duracaoMs: Date.now() - comeco,
    ...(erros.length ? {erros: erros.slice(0, 20)} : {}),
  });
}

/** GET não raspa nada: serve para ver quanto falta. */
export async function loader({request, context}: Route.LoaderArgs) {
  if (!autorizado(request, context.env)) {
    return Response.json({erro: 'não autorizado'}, {status: 401});
  }

  const db = getDb(context.env);
  if (!db) return Response.json({erro: 'banco indisponível'}, {status: 503});

  const ligas = lerLigas(new URL(request.url));
  if (!ligas) {
    return Response.json({erro: 'competição desconhecida'}, {status: 400});
  }

  try {
    // pede um a mais que o lote para distinguir "acabou" de "ainda tem"
    const fila = await lerJogadoresSujos(db, {ligas, limite: 50});
    return Response.json({
      ligas,
      naFila: fila.length,
      // `50` é o teto desta amostra, não o tamanho da fila — dizer "50" seco
      // faria parecer que falta pouco quando podem faltar milhares
      amostraCompleta: fila.length < 50,
      proximos: fila.slice(0, 5).map((j) => ({id: j.id, nome: j.nome})),
    });
  } catch (e) {
    return Response.json({erro: (e as Error).message}, {status: 502});
  }
}
