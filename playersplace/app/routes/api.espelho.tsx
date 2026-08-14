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
import {findLeague, LEAGUES} from '~/lib/tm';
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

/**
 * O escopo da raspagem profunda: TODAS as ligas do registro.
 *
 * ERA `['BRA1', 'BRA2']`, E ISSO ERA A CAUSA DOS 502.
 *
 * A página do jogador devolve 502 num caso só — quando não há linha na
 * `jogadores_base` E nenhuma chave em nenhuma camada de cache. Com o espelho
 * cobrindo duas ligas de vinte e quatro, todo jogador de Premier League,
 * LaLiga, Liga MX ou J1 estava exatamente nesse caso: dependia de a raspagem ao
 * vivo dar certo naquele instante. Quando o Transfermarkt engasgava — e ele
 * engasga —, o visitante levava o erro.
 *
 * POR QUE DÁ PARA COBRIR TUDO AGORA
 *
 * O medo antigo, registrado no `espelho.yml`, era o tamanho da
 * `jogadores_base`: 125.418 linhas × 10 chaves = 1,25 milhão de requisições.
 * Mas esse número é da tabela INTEIRA, que acumulou jogadores de competições
 * que a plataforma nem lista (entram por visita avulsa a página de clube).
 * Filtrando pelas ligas do registro — que é o que `lerJogadoresSujos` faz — o
 * conjunto é de outra ordem: ~20 clubes por liga × ~28 jogadores ≈ 13 mil
 * jogadores, ~134 mil chaves. Algumas noites de backfill, e depois só o que a
 * sentinela marcar.
 *
 * Sai do registro, e não de uma lista à parte, para não haver duas verdades:
 * liga nova em `leagues.ts` entra no espelho sozinha.
 */
const LIGAS_PADRAO = LEAGUES.map((l) => l.code);

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
    // De que nível do lote vieram — ver `lerJogadoresSujos`. Serve para ler o
    // andamento sem consultar o banco: enquanto `backfill` domina, o espelho
    // ainda está sendo montado; quando ele zera e sobram só `atualizacoes`, o
    // regime permanente chegou.
    atualizacoes: fila.filter((j) => !j.novo).length,
    backfill: fila.filter((j) => j.novo).length,
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
    // As contagens exatas, e não uma amostra: `head: true` traz só o número,
    // sem uma linha de payload. É o que dá para acompanhar o backfill andando
    // noite após noite — a amostra de 50 que havia aqui antes não distinguia
    // "faltam 60" de "faltam 12 mil".
    const contar = (novos: boolean) => {
      let q = db
        .from('jogadores_base')
        .select('id', {count: 'exact', head: true})
        .eq('sujo', true);
      q = novos ? q.is('fundo_em', null) : q.not('fundo_em', 'is', null);
      return q.in('liga_code', ligas);
    };

    const [atualizacoes, backfill, amostra] = await Promise.all([
      contar(false),
      contar(true),
      lerJogadoresSujos(db, {ligas, limite: 5}),
    ]);

    const erros = [atualizacoes.error, backfill.error]
      .filter((e) => e)
      .map((e) => e!.message);

    return Response.json({
      ligas,
      // os dois níveis da fila, na ordem em que são servidos — ver
      // `lerJogadoresSujos`. `atualizacoes` nunca espera pelo `backfill`.
      atualizacoes: atualizacoes.count ?? 0,
      backfill: backfill.count ?? 0,
      naFila: (atualizacoes.count ?? 0) + (backfill.count ?? 0),
      proximos: amostra.map((j) => ({id: j.id, nome: j.nome, novo: j.novo})),
      ...(erros.length ? {erros} : {}),
    });
  } catch (e) {
    return Response.json({erro: (e as Error).message}, {status: 502});
  }
}
