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
import {euroToMillions} from '~/lib/format';
import {findLeague, type ClubProfile} from '~/lib/tm';

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

  const linhas = club.players.map((p) => ({
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
  }));

  try {
    const {error} = await db.from(TABELA).upsert(linhas, {onConflict: 'id'});
    if (error) return 0;

    await db
      .from(TABELA)
      .delete()
      .eq('clube_id', clubeId)
      .not('id', 'in', `(${linhas.map((l) => l.id).join(',')})`);

    return linhas.length;
  } catch {
    // a base é acessório: falhar aqui só significa que a próxima visita raspa
    return 0;
  }
}

export interface ResumoExecucao {
  liga: string;
  clubes: number;
  jogadores: number;
  erros: string[];
  duracaoMs: number;
}

/** carimba a passada do aquecimento, para dar para ver que ele ainda roda */
export async function registrarExecucao(
  db: Db | null,
  resumo: ResumoExecucao,
): Promise<void> {
  if (!db) return;
  try {
    await db.from(TABELA_EXECUCAO).upsert(
      {
        liga_code: resumo.liga,
        clubes: resumo.clubes,
        jogadores: resumo.jogadores,
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
