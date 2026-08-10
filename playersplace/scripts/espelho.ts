/**
 * Espelho do Transfermarkt — o job que enche e mantém o banco.
 *
 * O QUE MUDA COM ELE
 *
 * Até aqui a `tm_cache` guardava o que ALGUÉM JÁ TINHA VISITADO: uma página de
 * jogador nunca aberta não tinha nenhuma linha, e quando a origem caía ela
 * devolvia 502 como se a migração 004 não existisse. Este job inverte a
 * ordem — primeiro o banco tem tudo, depois a raspagem serve só para
 * atualizar. Fora do ar, o site continua inteiro.
 *
 * POR QUE FORA DO WORKER
 *
 * São ~120 mil chaves nas 24 ligas cobertas. O Oxygen tem teto de subrequests
 * por requisição, o que daria uns 4 jogadores por chamada e milhares de
 * chamadas HTTP só para orquestrar. Aqui é um processo Node no GitHub Actions
 * que importa os MESMOS getters de `app/lib/tm` que as páginas usam — não há
 * uma segunda implementação da raspagem para divergir da primeira.
 *
 * OS DOIS MODOS
 *
 *   raso   — as 24 ligas: competição, clubes, elencos e as sentinelas.
 *            ~5 requisições por clube, roda inteiro em uma passada.
 *            É ele que decide QUEM mudou.
 *
 *   fundo  — as ~9 chaves pesadas de cada jogador (carreira, jogos, desempenho,
 *            valor de mercado, seleção, lesões, transferências, rumores).
 *            Processa a fila de sujos, do mais antigo para o mais novo, dentro
 *            de um orçamento de requisições.
 *
 * O `fundo` NÃO tem modo backfill: a fila ordena por `fundo_em nulls first`,
 * então enquanto houver jogador nunca raspado ele tem prioridade, e quando a
 * base fica completa a mesma fila passa a conter só quem a sentinela marcou.
 * O primeiro carregamento e a manutenção diária são o mesmo código rodando.
 *
 * USO
 *
 *   npm run espelho -- raso
 *   npm run espelho -- raso  --ligas=BRA1,BRA2
 *   npm run espelho -- fundo --ligas=BRA1,BRA2 --orcamento=8000
 *   npm run espelho -- fundo --orcamento=8000 --minutos=300
 *
 * Precisa de SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.
 */
import {createClient} from '@supabase/supabase-js';

// só o tipo: `app/lib/db.ts` fala com o `Env` do Oxygen, que não existe aqui
import type {Db} from '../app/lib/db';
import {
  LEAGUES,
  findLeague,
  getClubAbsences,
  getClubForm,
  getClubTransfers,
  getLeagueOverview,
  getLeagueStandings,
  getLeagueStats,
  getLeagueTopPlayers,
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
  renovarClube,
} from '../app/lib/tm';
import {
  ativarModoEspelho,
  definirRitmo,
  registrarDb,
  requisicoesFeitas,
} from '../app/lib/tm/client';
import {
  gravarElencoBase,
  lerJogadoresSujos,
  marcarFundo,
  marcarSujos,
} from '../app/lib/jogadores.server';

// ---------------------------------------------------------------------------
// Parâmetros
// ---------------------------------------------------------------------------

/**
 * Intervalo mínimo entre duas requisições ao Transfermarkt.
 *
 * 400 ms é o mesmo ritmo que `/api/aquecer` já usa há meses sem incidente —
 * abaixo do de uma pessoa navegando rápido. Este é o único lugar do sistema
 * que consulta a origem aos milhares, então é aqui que a boa vizinhança se
 * decide. Vale a pena repetir: descer isto acelera o backfill e aumenta a
 * chance de sermos bloqueados, o que custaria MUITO mais tempo do que economiza.
 */
const RITMO_MS = 400;

/** teto de requisições por execução, para o job caber na janela do Actions */
const ORCAMENTO_PADRAO = 8000;

/** teto de tempo de parede; o Actions corta em 6 h sem dó */
const MINUTOS_PADRAO = 300;

interface Opcoes {
  modo: 'raso' | 'fundo';
  ligas: string[];
  orcamento: number;
  minutos: number;
}

function lerOpcoes(argv: string[]): Opcoes {
  const modo = argv.find((a) => !a.startsWith('-'));
  if (modo !== 'raso' && modo !== 'fundo') {
    throw new Error(
      'uso: espelho <raso|fundo> [--ligas=..] [--orcamento=N] [--minutos=N]',
    );
  }

  const flag = (nome: string): string | undefined =>
    argv
      .find((a) => a.startsWith(`--${nome}=`))
      ?.split('=')
      .slice(1)
      .join('=');

  const brutas =
    flag('ligas')
      ?.split(',')
      .map((s) => s.trim())
      .filter(Boolean) ?? [];

  // resolver pelo registro serve de validação e conserta a caixa: a origem
  // DIFERENCIA maiúsculas (`TDeC` responde 200, `TDEC` responde 302)
  const ligas = brutas.map((c) => {
    const l = findLeague(c);
    if (!l) throw new Error(`competição desconhecida: ${c}`);
    return l.code;
  });

  return {
    modo,
    ligas,
    orcamento: Number(flag('orcamento')) || ORCAMENTO_PADRAO,
    minutos: Number(flag('minutos')) || MINUTOS_PADRAO,
  };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

// a saída padrão é a interface deste programa — é ela que vira o log do
// GitHub Actions, onde alguém vai procurar por que um clube não entrou
// eslint-disable-next-line no-console
const log = (msg: string) => console.log(msg);

/** aaaammdd de N dias atrás — o formato de `sortKey` de `ClubMatch` */
function chaveDeDiasAtras(dias: number): string {
  const d = new Date(Date.now() - dias * 24 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

const motivo = (e: unknown) => (e as Error)?.message ?? String(e);

/**
 * Roda a tarefa e engole a falha, devolvendo o padrão.
 *
 * Uma chave que não respondeu não pode abortar o clube, e um clube não pode
 * abortar a liga: o espelho é incremental por natureza — o que faltou hoje é
 * exatamente o que a fila vai priorizar amanhã.
 */
async function tentar<T>(
  rotulo: string,
  fn: () => Promise<T>,
  padrao: T,
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    log(`  ! ${rotulo}: ${motivo(e)}`);
    return padrao;
  }
}

// ---------------------------------------------------------------------------
// Modo raso — a varredura que decide quem mudou
// ---------------------------------------------------------------------------

/**
 * Quantos dias para trás um jogo conta como "acabou de acontecer".
 *
 * O job roda diariamente, então 2 dias dá uma passada de folga: um dia em que
 * o Actions falhe não deixa uma rodada inteira passar sem ninguém marcar os
 * elencos que entraram em campo.
 */
const DIAS_JOGO_RECENTE = 2;

async function rodarRaso(db: Db, opcoes: Opcoes) {
  const ligas = opcoes.ligas.length
    ? LEAGUES.filter((l) => opcoes.ligas.includes(l.code))
    : LEAGUES;

  const limite = Date.now() + opcoes.minutos * 60_000;
  const recente = chaveDeDiasAtras(DIAS_JOGO_RECENTE);
  let clubes = 0;
  let jogadores = 0;
  let sujos = 0;

  for (const liga of ligas) {
    if (Date.now() > limite || requisicoesFeitas() >= opcoes.orcamento) {
      log(`\norçamento esgotado antes de ${liga.code}`);
      break;
    }

    log(`\n=== ${liga.code} · ${liga.name}`);

    const overview = await tentar(
      `${liga.code} clubes`,
      () => getLeagueOverview(liga.code),
      null,
    );
    if (!overview?.clubs?.length) {
      log(`  ! ${liga.code}: sem clubes, pulando`);
      continue;
    }

    // as demais chaves da página de competição. São 3 requisições por liga —
    // 72 no total — e é o que mantém /competicoes/:code de pé numa queda
    await tentar(
      `${liga.code} tabela`,
      () => getLeagueStandings(liga.code),
      [],
    );
    await tentar(
      `${liga.code} artilharia`,
      () => getLeagueStats(liga.code),
      null,
    );
    await tentar(
      `${liga.code} valiosos`,
      () => getLeagueTopPlayers(liga.code),
      [],
    );

    for (const c of overview.clubs) {
      if (Date.now() > limite || requisicoesFeitas() >= opcoes.orcamento) break;

      // O elenco é a sentinela principal: `gravarElencoBase` compara a
      // assinatura de cada jogador com a da passada anterior e só move
      // `alterado_em` de quem mudou de nome, número, posição, valor ou clube.
      const club = await tentar(
        `clube ${c.id}`,
        () => renovarClube(c.id),
        null,
      );
      if (!club) continue;

      clubes++;
      jogadores += await gravarElencoBase(db, {
        clubeId: c.id,
        ligaCode: liga.code,
        club,
      });

      // Sinal 1 — quem está no departamento médico. Uma lesão nova não mexe em
      // nada do que o elenco publica, mas muda a página do jogador.
      const ausencias = await tentar(
        `ausências ${c.id}`,
        () => getClubAbsences(c.id),
        [],
      );
      const idsAusentes = ausencias.map((a) => a.playerId).filter(Boolean);

      // Sinal 2 — o clube entrou em campo. Aí o histórico de jogos e o
      // desempenho por temporada de TODO o elenco mudaram, sem que uma linha
      // sequer do elenco tenha mudado.
      const forma = await tentar(`forma ${c.id}`, () => getClubForm(c.id), {
        last: [],
        next: [],
      });
      const jogou = forma.last.some((m) => m.sortKey >= recente);
      const idsElenco = jogou ? club.players.map((p) => p.id) : [];

      await tentar(
        `transferências ${c.id}`,
        () => getClubTransfers(c.id),
        null,
      );

      const marcar = [...new Set([...idsAusentes, ...idsElenco])];
      if (marcar.length) {
        sujos += await tentar(
          `marcar sujos ${c.id}`,
          () => marcarSujos(db, marcar),
          0,
        );
      }

      log(
        `  ${String(c.name || c.id)
          .slice(0, 28)
          .padEnd(28)} ` +
          `${String(club.players.length).padStart(3)} jog` +
          `${jogou ? ' · jogou' : ''}` +
          `${idsAusentes.length ? ` · ${idsAusentes.length} fora` : ''}`,
      );
    }
  }

  log(
    `\nraso: ${clubes} clubes · ${jogadores} jogadores · ` +
      `${sujos} marcados para raspagem profunda · ${requisicoesFeitas()} requisições`,
  );
}

// ---------------------------------------------------------------------------
// Modo fundo — as chaves pesadas de cada jogador
// ---------------------------------------------------------------------------

/**
 * As ~9 chaves que compõem a página do jogador.
 *
 * Sequencial, e não `Promise.all`, por dois motivos: o ritmo de 400 ms serializa
 * tudo de qualquer jeito, e `perf`/`career`/`starts` são construídos sobre a
 * MESMA chave `perfraw:` — em série a segunda e a terceira acertam a memória do
 * processo, em paralelo as três iriam à origem buscar o mesmo JSON.
 *
 * Cada chave é tentada isoladamente: um jogador sem histórico de seleção não
 * pode custar a carreira dele.
 */
async function rasparFundo(id: string): Promise<void> {
  await tentar(`ficha ${id}`, () => getPlayer(id), null);
  await tentar(`desempenho ${id}`, () => getPlayerPerformance(id), []);
  await tentar(`carreira ${id}`, () => getPlayerCareer(id), null);
  await tentar(`titularidades ${id}`, () => getPlayerStartsBySeason(id), []);
  await tentar(`jogos ${id}`, () => getPlayerGameLog(id), null);
  await tentar(`seleção ${id}`, () => getPlayerNationalCareer(id), []);
  await tentar(`valor ${id}`, () => getPlayerMarketValueGraph(id), null);
  await tentar(`transferências ${id}`, () => getPlayerTransfers(id), []);
  await tentar(`lesões ${id}`, () => getPlayerInjuries(id), []);
  await tentar(`rumores ${id}`, () => getPlayerRumors(id), []);
}

/** quantos jogadores a fila entrega por vez */
const LOTE_FILA = 200;

async function rodarFundo(db: Db, opcoes: Opcoes) {
  const limite = Date.now() + opcoes.minutos * 60_000;
  let feitos = 0;
  let novos = 0;

  while (Date.now() < limite && requisicoesFeitas() < opcoes.orcamento) {
    const fila = await lerJogadoresSujos(db, {
      ligas: opcoes.ligas,
      limite: LOTE_FILA,
    });
    if (!fila.length) {
      log('\nfila vazia: o espelho está em dia');
      break;
    }

    const prontos: string[] = [];
    for (const j of fila) {
      if (Date.now() > limite || requisicoesFeitas() >= opcoes.orcamento) break;

      await rasparFundo(j.id);
      prontos.push(j.id);
      feitos++;
      if (j.novo) novos++;

      log(
        `  ${String(feitos).padStart(5)} ${j.novo ? '+' : '~'} ` +
          `${j.nome.slice(0, 30).padEnd(30)} ${j.ligaCode ?? '--'} ` +
          `· ${requisicoesFeitas()} req`,
      );

      // Carimbar de 20 em 20, e não no fim: o Actions pode cortar o job a
      // qualquer momento, e sem isto a próxima execução recomeçaria do zero e
      // o backfill nunca convergiria.
      if (prontos.length >= 20) {
        await marcarFundo(db, prontos.splice(0));
      }
    }

    if (prontos.length) await marcarFundo(db, prontos);

    // A fila voltou cheia mas nada foi processado: só acontece se o orçamento
    // ou o relógio estouraram no primeiro item. Sair evita laço infinito.
    if (!prontos.length && feitos === 0) break;
  }

  log(
    `\nfundo: ${feitos} jogadores (${novos} pela primeira vez) · ` +
      `${requisicoesFeitas()} requisições`,
  );
}

// ---------------------------------------------------------------------------

async function main() {
  const opcoes = lerOpcoes(process.argv.slice(2));

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias',
    );
  }

  const db = createClient(new URL(url).origin, key, {
    auth: {persistSession: false, autoRefreshToken: false},
  });

  registrarDb(db);
  ativarModoEspelho();
  definirRitmo(RITMO_MS);

  log(
    `espelho ${opcoes.modo} · ligas=${opcoes.ligas.join(',') || 'todas'} · ` +
      `orçamento=${opcoes.orcamento} req · teto=${opcoes.minutos} min`,
  );

  const comeco = Date.now();
  if (opcoes.modo === 'raso') await rodarRaso(db, opcoes);
  else await rodarFundo(db, opcoes);

  log(`concluído em ${Math.round((Date.now() - comeco) / 1000)}s`);
}

main().catch((e) => {
  console.error(`espelho falhou: ${motivo(e)}`);
  process.exit(1);
});
