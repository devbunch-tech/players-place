/**
 * Base achatada de jogadores — o que a página precisa para pintar o topo.
 *
 * POR QUE EXISTE
 *
 * `lib/tm/client.ts` já garante que nunca falte uma cópia (três camadas de
 * cache com stale-while-revalidate). O que ele não resolve é a latência da
 * PRIMEIRA pintura: o loader de /jogadores/:id só renderizava depois de
 * resolver `player:<id>`, que na chave fria é uma raspagem inteira e na quente
 * ainda é um JSON grande vindo do Supabase.
 *
 * Aqui a troca é outra: uma consulta indexada por chave primária devolvendo
 * nove colunas curtas. Com ela o topo da página sai na hora e todo o resto
 * desce em streaming.
 *
 * DE ONDE VÊM OS DADOS
 *
 * Da mesma raspagem do elenco do clube (`club:<id>`) que a página do clube já
 * faz — nome, foto, número, posição, idade, nacionalidade e valor estão todos
 * lá. Cobrir Série A e Série B custa ~40 requisições ao Transfermarkt, não uma
 * por jogador. Quem alimenta são dois caminhos:
 *
 *  1. o aquecimento diário (`/api/aquecer`, chamado pelo GitHub Actions);
 *  2. toda visita a uma página de clube, que grava o elenco em segundo plano —
 *     é o que mantém a base viva mesmo se o job parar de rodar.
 *
 * A base é cache derivado, nunca fonte da verdade: vazia, vencida ou fora do
 * ar, quem chama cai de volta na raspagem de sempre.
 *
 * O sufixo `.server` é obrigatório: este módulo importa o cliente do Supabase
 * com a chave service_role e não pode acabar no bundle do navegador.
 */
import type {Db} from '~/lib/db';
import {euroToMillions, sumValues} from '~/lib/format';
import {findLeague, type ClubProfile} from '~/lib/tm';
import {guardarNomes} from '~/lib/tm/client';

const TABELA = 'jogadores_base';
const TABELA_EXECUCAO = 'jogadores_base_execucao';

/**
 * Depois disto a linha é ignorada e a página volta a raspar.
 *
 * Sete dias é folgado de propósito: o aquecimento roda diariamente, então só
 * chegamos perto deste limite se o job estiver quebrado há uma semana — e aí
 * o certo é degradar para a origem, não continuar mostrando valor de mercado
 * de sete dias atrás como se fosse de hoje.
 */
const VALIDADE_BASE = 7 * 24 * 3600 * 1000;

/** o que a página consegue montar sem tocar no Transfermarkt */
export interface JogadorBase {
  id: string;
  nome: string;
  foto: string | null;
  numero: string;
  posicao: string;
  nascimento: string;
  idade: number | null;
  nacionalidade: string;
  valor: string;
  clube: {id: string; nome: string; escudo: string | null} | null;
  liga: {code: string; nome: string} | null;
  /** epoch ms da última vez que esta linha foi reescrita pelo aquecimento */
  atualizadoEm: number;
}

interface Linha {
  id: string;
  nome: string;
  foto: string | null;
  numero: string | null;
  posicao: string | null;
  nascimento: string | null;
  idade: number | null;
  nacionalidade: string | null;
  valor: string | null;
  clube_id: string | null;
  clube_nome: string | null;
  clube_escudo: string | null;
  liga_code: string | null;
  liga_nome: string | null;
  atualizado_em: string;
}

const COLUNAS =
  'id, nome, foto, numero, posicao, nascimento, idade, nacionalidade, valor, ' +
  'clube_id, clube_nome, clube_escudo, liga_code, liga_nome, atualizado_em';

function daLinha(l: Linha): JogadorBase {
  return {
    id: l.id,
    nome: l.nome,
    foto: l.foto,
    numero: l.numero ?? '',
    posicao: l.posicao ?? '',
    nascimento: l.nascimento ?? '',
    idade: l.idade,
    nacionalidade: l.nacionalidade ?? '',
    valor: l.valor ?? '',
    clube: l.clube_id
      ? {id: l.clube_id, nome: l.clube_nome ?? '', escudo: l.clube_escudo}
      : null,
    liga: l.liga_code ? {code: l.liga_code, nome: l.liga_nome ?? ''} : null,
    atualizadoEm: Date.parse(l.atualizado_em),
  };
}

function vencida(base: JogadorBase): boolean {
  return (
    Number.isNaN(base.atualizadoEm) ||
    Date.now() - base.atualizadoEm > VALIDADE_BASE
  );
}

/**
 * O jogador na base, ou null quando não está lá / está vencido / o banco não
 * respondeu. Os três casos são o mesmo caso para quem chama: raspe.
 *
 * Nunca lança. Uma falha aqui não pode derrubar a página que esta base existe
 * justamente para acelerar.
 */
export async function lerJogadorBase(
  db: Db | null,
  id: string,
): Promise<JogadorBase | null> {
  if (!db) return null;
  try {
    const {data, error} = await db
      .from(TABELA)
      .select(COLUNAS)
      .eq('id', id)
      .maybeSingle();
    if (error || !data) return null;
    // via `unknown` porque `COLUNAS` é uma string montada em tempo de
    // execução: o supabase-js não consegue inferir a forma da linha a partir
    // dela e cai no tipo de erro genérico
    const base = daLinha(data as unknown as Linha);
    return vencida(base) ? null : base;
  } catch {
    return null;
  }
}

/** o elenco inteiro de um clube, já ordenado por valor de mercado */
export async function lerElencoBase(
  db: Db | null,
  clubeId: string,
): Promise<JogadorBase[]> {
  if (!db) return [];
  try {
    const {data, error} = await db
      .from(TABELA)
      .select(COLUNAS)
      .eq('clube_id', clubeId)
      .order('valor_num', {ascending: false, nullsFirst: false});
    if (error || !data) return [];
    return (data as unknown as Linha[]).map(daLinha);
  } catch {
    return [];
  }
}

/**
 * O clube remontado a partir da base achatada, ou null se não há elenco salvo.
 *
 * POR QUE EXISTE: em 06/08/2026 o Transfermarkt saiu do ar e TODA página de
 * clube passou a devolver 502. As três camadas de `tm/client.ts` não seguraram
 * porque nenhuma delas tinha `club:<id>` — o aquecimento só visitava páginas de
 * competição, então a chave nunca chegou ao L3 e não havia cópia velha para
 * servir. A `jogadores_base`, por outro lado, é escrita explicitamente pelo
 * `/api/aquecer`, com uma linha por jogador.
 *
 * O que volta daqui é menos do que a raspagem: não há forma recente, nem
 * transferências, e o valor total é a soma dos jogadores em vez do número que o
 * Transfermarkt publica (que desconta empréstimos). É de propósito — a escolha
 * aqui é entre uma página um pouco mais pobre e nenhuma página.
 *
 * Não filtra por validade: cópia velha é exatamente o que se quer quando a
 * alternativa é o erro. Quem chama já tentou o cache antes.
 */
export async function lerClubeBase(
  db: Db | null,
  clubeId: string,
): Promise<{club: ClubProfile; salvoEm: number | null} | null> {
  const elenco = await lerElencoBase(db, clubeId);
  if (!elenco.length) return null;

  // todas as linhas do clube carregam o mesmo nome/escudo desnormalizado;
  // a primeira serve de cabeçalho
  const [primeiro] = elenco;
  if (!primeiro.clube?.nome) return null;

  // a página mostra "Dados de …", e aqui a marca honesta é a da linha mais
  // recente: o aquecimento reescreve o elenco inteiro numa passada só
  const marcas = elenco
    .map((j) => j.atualizadoEm)
    .filter((m) => !Number.isNaN(m));

  return {
    salvoEm: marcas.length ? Math.max(...marcas) : null,
    club: {
      name: primeiro.clube.nome,
      crest: primeiro.clube.escudo,
      league: primeiro.liga
        ? {code: primeiro.liga.code, name: primeiro.liga.nome}
        : null,
      totalValue: sumValues(elenco.map((j) => j.valor)),
      players: elenco.map((j) => ({
        id: j.id,
        name: j.nome,
        photo: j.foto,
        number: j.numero,
        position: j.posicao,
        birth: j.nascimento,
        age: j.idade,
        nationality: j.nacionalidade,
        value: j.valor,
      })),
    },
  };
}

/**
 * Reescreve o elenco de um clube.
 *
 * Faz o upsert de quem está no elenco e apaga as linhas que ainda apontam para
 * este clube mas sumiram da lista — jogador vendido, emprestado ou dispensado.
 *
 * A remoção é segura mesmo com transferências dentro das ligas cobertas, em
 * qualquer ordem de aquecimento: se o clube de destino já foi processado, a
 * linha do jogador não aponta mais para a origem e o `delete` não a alcança;
 * se ainda não foi, a linha é apagada aqui e recriada quando o destino rodar.
 *
 * Devolve quantos jogadores foram gravados. Não lança.
 */
export async function gravarElencoBase(
  db: Db | null,
  entrada: {
    clubeId: string;
    ligaCode: string | null;
    club: ClubProfile;
  },
): Promise<number> {
  if (!db) return 0;
  const {clubeId, club} = entrada;
  if (!club?.players?.length) return 0;

  const ligaCode = entrada.ligaCode ?? club.league?.code ?? null;
  const ligaNome = ligaCode
    ? (findLeague(ligaCode)?.name ?? club.league?.name ?? null)
    : null;
  const agora = new Date().toISOString();

  // As assinaturas de antes desta passada. Uma consulta de ~28 linhas curtas
  // para saber quais jogadores realmente se moveram — ver `assinaturaDe`.
  const anteriores = await lerAssinaturas(db, clubeId);

  const linhas = club.players.map((p) => {
    const assinatura = assinaturaDe({...p, clubeId});
    const antes = anteriores.get(p.id);
    // Jogador novo nesta linha (contratação, ou base ainda vazia) conta como
    // alterado: ele nunca foi raspado a fundo, ou foi sob outro clube.
    const mudou = !antes || antes.assinatura !== assinatura;
    return {
      id: p.id,
      nome: p.name,
      foto: p.photo,
      numero: p.number,
      posicao: p.position,
      nascimento: p.birth,
      idade: p.age,
      nacionalidade: p.nationality,
      valor: p.value,
      valor_num: euroToMillions(p.value),
      clube_id: clubeId,
      clube_nome: club.name,
      clube_escudo: club.crest,
      liga_code: ligaCode,
      liga_nome: ligaNome,
      atualizado_em: agora,
      assinatura,
      alterado_em: mudou ? agora : (antes?.alteradoEm ?? agora),
      // Preservar o `sujo` antigo quando nada mudou é o ponto todo. Note que
      // é PRESERVAR, e não escrever `false`: um jogador que a sentinela de
      // lesões marcou nesta mesma passada, ou que sobrou da fila de ontem,
      // seria desmarcado sem nunca ter sido raspado. Quem apaga a marca é só
      // `marcarFundo`, depois de a raspagem ter de fato acontecido.
      sujo: mudou ? true : (antes?.sujo ?? true),
    };
  });

  try {
    // `fundo_em` fica DE FORA do upsert de propósito: o PostgREST só atualiza
    // as colunas presentes no payload, e mandá-la aqui zeraria a marca de
    // raspagem profunda de todo o elenco a cada aquecimento — todos voltariam
    // à fila todos os dias, que é exatamente o oposto do que se quer.
    let {error} = await db.from(TABELA).upsert(linhas, {onConflict: 'id'});

    // `assinatura`, `sujo` e `alterado_em` são da migração 006. Antes dela o
    // PostgREST recusa o upsert inteiro por causa das colunas desconhecidas, e
    // a base — que é o que segura a página do clube quando a origem cai —
    // pararia de ser escrita sem nenhum sinal. Aqui a passada vira a de antes:
    // sem sentinela, mas gravando.
    if (error) {
      const semSentinela = linhas.map((l) => {
        const copia: Record<string, unknown> = {...l};
        for (const c of ['assinatura', 'sujo', 'alterado_em']) delete copia[c];
        return copia;
      });
      ({error} = await db
        .from(TABELA)
        .upsert(semSentinela, {onConflict: 'id'}));
    }
    if (error) return 0;

    await db
      .from(TABELA)
      .delete()
      .eq('clube_id', clubeId)
      .not('id', 'in', `(${linhas.map((l) => l.id).join(',')})`);

    // Alimenta o dicionário de nomes com o que esta raspagem descobriu.
    //
    // Importa QUAL origem é esta: o elenco vem do host de HTML, que continua
    // respondendo 200 quando a API `tmapi` está devolvendo 403. Então todo
    // clube e toda competição que passam por aqui ficam resolvidos no
    // dicionário ANTES de a página do jogador precisar deles — e ela não vai
    // mais mostrar "210" no lugar de "Grêmio" nem quando a API estiver fora.
    const nomes = new Map<string, string>();
    if (club.name) nomes.set(clubeId, club.name);
    guardarNomes('clube', nomes);
    if (ligaCode && ligaNome) {
      guardarNomes('competicao', new Map([[ligaCode, ligaNome]]));
    }

    return linhas.length;
  } catch {
    // a base é acessório: falhar aqui só significa que a próxima visita raspa
    return 0;
  }
}

// ---------------------------------------------------------------------------
// A SENTINELA
//
// O espelho tem ~9 chaves por jogador (ficha, carreira, jogos, desempenho,
// valor de mercado, seleção, lesões, transferências, rumores). Nas 24 ligas
// cobertas isso dá da ordem de 120 mil chaves — re-raspar tudo todo dia são
// ~33 h de requisições contínuas ao Transfermarkt, o que não é aceitável nem
// para eles nem para nós.
//
// A saída é que a página de elenco de um clube JÁ PUBLICA, numa única
// requisição, o nome, o número, a posição, o clube e o valor de mercado de
// todos os ~28 jogadores. Se nenhum desses campos mudou, é altíssima a chance
// de que nada relevante mudou no jogador. Então 480 requisições (uma por
// clube) elegem, por noite, as poucas dezenas de jogadores que valem a
// re-raspagem completa.
//
// A sentinela é uma heurística, e assumidamente: ela não vê um jogo disputado
// que só mexeu no histórico. Por isso ela não trabalha sozinha — o job também
// marca como sujo o elenco de todo clube que jogou desde a última passada, e
// a validade adaptativa de `tm_cache_gravar` cobre o resto sozinha.
// ---------------------------------------------------------------------------

/**
 * O que a sentinela observa: os campos que o elenco do clube publica de graça.
 *
 * Texto puro em vez de hash de propósito — cabe em 60 caracteres, some do
 * custo de banco e, quando algo estranho acontece, dá para abrir a linha no
 * SQL Editor e enxergar o que mudou sem decodificar nada.
 */
function assinaturaDe(p: {
  name: string;
  number: string;
  position: string;
  value: string;
  clubeId: string;
}): string {
  return [p.name, p.number, p.position, p.value, p.clubeId].join('|');
}

interface Anterior {
  assinatura: string | null;
  alteradoEm: string;
  sujo: boolean;
}

async function lerAssinaturas(
  db: Db,
  clubeId: string,
): Promise<Map<string, Anterior>> {
  const mapa = new Map<string, Anterior>();
  try {
    const {data, error} = await db
      .from(TABELA)
      .select('id, assinatura, alterado_em, sujo')
      .eq('clube_id', clubeId);
    if (error || !data) return mapa;
    for (const l of data as ({id: string; alterado_em: string} & Omit<
      Anterior,
      'alteradoEm'
    >)[]) {
      mapa.set(l.id, {
        assinatura: l.assinatura,
        alteradoEm: l.alterado_em,
        sujo: l.sujo,
      });
    }
  } catch {
    // sem as assinaturas antigas todo mundo conta como alterado: o job da
    // noite fica mais caro uma vez, e nada fica desatualizado
  }
  return mapa;
}

/** um jogador na fila de raspagem profunda */
export interface JogadorSujo {
  id: string;
  nome: string;
  ligaCode: string | null;
  /** true quando nunca foi raspado a fundo (backfill), false quando é update */
  novo: boolean;
}

/** uma fatia da fila: só atualizações, ou só backfill */
async function consultarFila(
  db: Db,
  opcoes: {ligas?: string[]; limite: number; novos: boolean},
): Promise<JogadorSujo[]> {
  if (opcoes.limite <= 0) return [];

  let q = db
    .from(TABELA)
    .select('id, nome, liga_code, fundo_em')
    .eq('sujo', true)
    .limit(opcoes.limite);

  // O que separa os dois níveis. `fundo_em is null` é "nunca foi espelhado"
  // (backfill); qualquer outra coisa é "já está no espelho e a sentinela
  // marcou que mudou" (atualização).
  q = opcoes.novos
    ? q.is('fundo_em', null)
    : q.not('fundo_em', 'is', null).order('fundo_em', {ascending: true});

  if (opcoes.ligas?.length) q = q.in('liga_code', opcoes.ligas);

  const {data, error} = await q;
  if (error) throw new Error(`fila de jogadores: ${error.message}`);

  return (data ?? [])
    .map(
      (l) =>
        l as {
          id: string;
          nome: string;
          liga_code: string | null;
          fundo_em: string | null;
        },
    )
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      ligaCode: l.liga_code,
      novo: !l.fundo_em,
    }));
}

/**
 * Quem precisa ser raspado a fundo, na ordem certa — e a ordem certa mudou.
 *
 * ANTES: uma consulta só, `order('fundo_em', nullsFirst: true)`. Isso punha o
 * backfill inteiro na frente das atualizações, e com duas ligas era inofensivo
 * (o backfill fechava na primeira noite). Com as 24 do registro deixou de ser:
 * são ~13 mil jogadores nunca espelhados, três ou quatro noites de fila — e
 * durante todo esse tempo um jogador que MUDOU de clube ontem ficaria atrás de
 * todos eles, porque `null` ordena antes de qualquer data. A mudança real
 * esperaria o backfill terminar.
 *
 * AGORA são dois níveis, e o primeiro nunca espera:
 *
 *   1. ATUALIZAÇÕES — quem já está no espelho e a sentinela marcou como
 *      mudado. Do carimbo mais antigo para o mais novo. Estas passam sempre
 *      à frente, em qualquer liga.
 *   2. BACKFILL — quem nunca foi espelhado. Ocupa o que sobrar do lote.
 *
 * O efeito prático: numa noite normal o nível 1 são algumas dezenas de
 * jogadores, some em minutos, e o resto da noite inteira vai para o backfill.
 * Numa segunda-feira de rodada cheia o nível 1 pode tomar o lote todo — e é
 * exatamente o que se quer, porque o backfill não tem pressa e a mudança tem.
 *
 * Continua sendo O MESMO job, sem "modo backfill" para ligar e desligar, e
 * continua retomável: cada jogador é carimbado assim que termina.
 *
 * DUAS CONSULTAS, E NÃO UMA COM `order` COMPOSTO: o PostgREST ordena por
 * coluna, e não por expressão — não há como pedir "primeiro os não-nulos, por
 * data". Daria para fazer com uma função no banco, mas isso é uma migração a
 * mais para resolver o que duas consultas indexadas resolvem; e a segunda só
 * roda quando a primeira não encheu o lote, que é o caso comum.
 *
 * Lança em caso de erro, ao contrário do resto deste módulo: aqui quem chama é
 * um job, e uma fila que voltou vazia porque o banco recusou a consulta seria
 * lida como "está tudo em dia" — o pior desfecho possível.
 */
export async function lerJogadoresSujos(
  db: Db,
  opcoes: {ligas?: string[]; limite: number},
): Promise<JogadorSujo[]> {
  const atualizacoes = await consultarFila(db, {...opcoes, novos: false});
  if (atualizacoes.length >= opcoes.limite) return atualizacoes;

  const novos = await consultarFila(db, {
    ligas: opcoes.ligas,
    limite: opcoes.limite - atualizacoes.length,
    novos: true,
  });

  return [...atualizacoes, ...novos];
}

/**
 * Tira da fila os jogadores cuja raspagem profunda terminou.
 *
 * É o ÚNICO lugar que apaga a marca `sujo`, e isso é deliberado: enquanto a
 * raspagem não acontece de fato, nada pode dizer que ela aconteceu.
 */
export async function marcarFundo(db: Db, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const {error} = await db
    .from(TABELA)
    .update({fundo_em: new Date().toISOString(), sujo: false})
    .in('id', ids);
  if (error) throw new Error(`marcar fundo: ${error.message}`);
}

/**
 * Empurra jogadores para a fila mesmo sem mudança de assinatura.
 *
 * É por aqui que entram os sinais que o elenco não mostra: o clube entrou em
 * campo (mudou histórico de jogos e desempenho) ou apareceu na lista de
 * lesionados e suspensos. Sem isto, um jogador que joga toda quarta e domingo
 * sem mudar de valor nem de número ficaria congelado no espelho.
 */
export async function marcarSujos(db: Db, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const {error, count} = await db
    .from(TABELA)
    .update(
      {sujo: true, alterado_em: new Date().toISOString()},
      {count: 'exact'},
    )
    .in('id', ids);
  if (error) throw new Error(`marcar sujos: ${error.message}`);
  return count ?? 0;
}

export interface ResumoExecucao {
  liga: string;
  clubes: number;
  jogadores: number;
  erros: string[];
  duracaoMs: number;
}

/**
 * Carimba a passada do aquecimento, para dar para ver que ele ainda roda.
 *
 * Os números saem da BASE, e não do `resumo` de quem chamou. O motivo é o
 * fatiamento: o aquecimento vem em lotes, cada requisição só conhece o próprio
 * lote, e quem carimba é a última. Somar o resumo do último lote registrava
 * "BRA1 → 5 clubes, 168 jogadores" no fim de uma série que gravou 20 clubes e
 * 666 jogadores — exatamente o que o comentário em `005_jogadores_base.sql`
 * dizia que não queria. Pior que impreciso: quem lê o painel para saber se o
 * job está saudável via um número de tamanho errado e não tinha como
 * desconfiar.
 *
 * Contar as linhas resolve sem estado nenhum entre os lotes, e mede o que
 * importa de verdade — o que ficou GRAVADO, não o que foi processado.
 */
export async function registrarExecucao(
  db: Db | null,
  resumo: ResumoExecucao,
): Promise<void> {
  if (!db) return;
  try {
    const {data} = await db
      .from(TABELA)
      .select('clube_id')
      .eq('liga_code', resumo.liga);

    const linhas = (data ?? []) as unknown as {clube_id: string | null}[];
    const clubes = new Set(linhas.map((l) => l.clube_id).filter(Boolean)).size;

    await db.from(TABELA_EXECUCAO).upsert(
      {
        liga_code: resumo.liga,
        // sem linhas na base o `select` acima pode ter falhado; aí o número do
        // lote é melhor que zero
        clubes: clubes || resumo.clubes,
        jogadores: linhas.length || resumo.jogadores,
        erros: resumo.erros.length,
        duracao_ms: Math.round(resumo.duracaoMs),
        concluido_em: new Date().toISOString(),
      },
      {onConflict: 'liga_code'},
    );
  } catch {
    // idem: telemetria não pode derrubar o job que ela observa
  }
}
