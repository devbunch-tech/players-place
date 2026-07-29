/**
 * Persistência do Game Fantasy — leitura e escrita no Supabase.
 *
 * Só servidor. Toda função recebe o `customerId` e filtra por ele: como
 * usamos a chave service_role (que ignora RLS), é aqui que a permissão é
 * garantida. Nenhuma consulta pode deixar de filtrar por customer_id.
 */
import type {Db} from '~/lib/db';
import {calcularDeadline, pontuarPick} from '~/lib/fantasy';

export interface RodadaFantasy {
  competitionCode: string;
  season: number;
  round: number;
  deadlineISO: string;
  firstMatchISO: string | null;
}

export interface PickSalvo {
  slot: number;
  playerId: string;
  playerName: string;
  clubId: string | null;
  clubName: string | null;
  position: string | null;
  predGoals: number;
  predAssists: number;
}

export interface EscalacaoSalva {
  id: string;
  formation: string;
  points: number | null;
  picks: PickSalvo[];
}

/** Busca a rodada; cria o registro se ainda não existir. */
export async function obterOuCriarRodada(
  db: Db,
  competitionCode: string,
  season: number,
  round: number,
  primeiroJogo: Date | null,
): Promise<RodadaFantasy | null> {
  const {data} = await db
    .from('fantasy_rounds')
    .select('*')
    .eq('competition_code', competitionCode)
    .eq('season', season)
    .eq('round', round)
    .maybeSingle();

  if (data) {
    return {
      competitionCode,
      season,
      round,
      deadlineISO: data.deadline_at,
      firstMatchISO: data.first_match_at,
    };
  }

  // sem data de jogo não dá para calcular prazo — melhor não inventar um
  if (!primeiroJogo) return null;

  const deadline = calcularDeadline(primeiroJogo);
  const {error} = await db.from('fantasy_rounds').insert({
    competition_code: competitionCode,
    season,
    round,
    first_match_at: primeiroJogo.toISOString(),
    deadline_at: deadline.toISOString(),
  });
  if (error) return null;

  return {
    competitionCode,
    season,
    round,
    deadlineISO: deadline.toISOString(),
    firstMatchISO: primeiroJogo.toISOString(),
  };
}

export async function buscarEscalacao(
  db: Db,
  customerId: string,
  competitionCode: string,
  season: number,
  round: number,
): Promise<EscalacaoSalva | null> {
  const {data: entry} = await db
    .from('fantasy_entries')
    .select('id, formation, points')
    .eq('customer_id', customerId)
    .eq('competition_code', competitionCode)
    .eq('season', season)
    .eq('round', round)
    .maybeSingle();

  if (!entry) return null;

  const {data: picks} = await db
    .from('fantasy_picks')
    .select('*')
    .eq('entry_id', entry.id)
    .order('slot');

  return {
    id: entry.id,
    formation: entry.formation,
    points: entry.points,
    picks: (picks ?? []).map((p) => ({
      slot: p.slot,
      playerId: p.player_id,
      playerName: p.player_name,
      clubId: p.club_id,
      clubName: p.club_name,
      position: p.position,
      predGoals: p.pred_goals,
      predAssists: p.pred_assists,
    })),
  };
}

/**
 * Grava a escalação, substituindo a anterior da mesma rodada.
 *
 * Não é transacional: o supabase-js não expõe transação. Na prática o risco
 * é baixo (um usuário salvando a própria escalação), e a ordem escolhida —
 * apagar os picks e regravar — deixa no pior caso uma escalação incompleta,
 * que a validação de leitura detecta, em vez de picks duplicados.
 */
export async function salvarEscalacao(
  db: Db,
  customerId: string,
  competitionCode: string,
  season: number,
  round: number,
  formation: string,
  picks: PickSalvo[],
): Promise<{ok: boolean; erro?: string}> {
  const {data: entry, error: upErr} = await db
    .from('fantasy_entries')
    .upsert(
      {
        customer_id: customerId,
        competition_code: competitionCode,
        season,
        round,
        formation,
      },
      {onConflict: 'customer_id,competition_code,season,round'},
    )
    .select('id')
    .single();

  if (upErr || !entry) {
    return {ok: false, erro: upErr?.message ?? 'falha ao gravar a escalação'};
  }

  const {error: delErr} = await db
    .from('fantasy_picks')
    .delete()
    .eq('entry_id', entry.id);
  if (delErr) return {ok: false, erro: delErr.message};

  const {error: insErr} = await db.from('fantasy_picks').insert(
    picks.map((p) => ({
      entry_id: entry.id,
      slot: p.slot,
      player_id: p.playerId,
      player_name: p.playerName,
      club_id: p.clubId,
      club_name: p.clubName,
      position: p.position,
      pred_goals: p.predGoals,
      pred_assists: p.predAssists,
    })),
  );
  if (insErr) return {ok: false, erro: insErr.message};

  return {ok: true};
}

// ---------------------------------------------------------------------------
// Apuração
// ---------------------------------------------------------------------------

export interface ResultadoApuracao {
  ok: boolean;
  motivo?: string;
  escalacoes?: number;
  picks?: number;
}

/**
 * Apura uma rodada: compara cada palpite com o que aconteceu e grava pontos.
 *
 * `stats` traz gols e assistências por jogador na rodada; quem não aparece
 * fez zero — daí o default. Roda uma vez só: `scored_at` na tabela de rodadas
 * é a trava, e é verificado antes de qualquer escrita.
 */
export async function apurarRodada(
  db: Db,
  competitionCode: string,
  season: number,
  round: number,
  stats: Record<string, {goals: number; assists: number}>,
): Promise<ResultadoApuracao> {
  const {data: rodada} = await db
    .from('fantasy_rounds')
    .select('scored_at')
    .eq('competition_code', competitionCode)
    .eq('season', season)
    .eq('round', round)
    .maybeSingle();

  if (!rodada) return {ok: false, motivo: 'rodada-nao-cadastrada'};
  if (rodada.scored_at) return {ok: false, motivo: 'ja-apurada'};

  const {data: entries} = await db
    .from('fantasy_entries')
    .select('id')
    .eq('competition_code', competitionCode)
    .eq('season', season)
    .eq('round', round);

  if (!entries?.length) {
    await db
      .from('fantasy_rounds')
      .update({scored_at: new Date().toISOString()})
      .eq('competition_code', competitionCode)
      .eq('season', season)
      .eq('round', round);
    return {ok: true, escalacoes: 0, picks: 0};
  }

  const ids = entries.map((e) => e.id);
  const {data: picks} = await db
    .from('fantasy_picks')
    .select('id, entry_id, player_id, pred_goals, pred_assists')
    .in('entry_id', ids);

  const porEntry = new Map<string, number>();
  let gravados = 0;

  for (const p of picks ?? []) {
    const real = stats[p.player_id] ?? {goals: 0, assists: 0};
    const pontos = pontuarPick({
      predGoals: p.pred_goals,
      predAssists: p.pred_assists,
      actualGoals: real.goals,
      actualAssists: real.assists,
    });

    const {error} = await db
      .from('fantasy_picks')
      .update({
        actual_goals: real.goals,
        actual_assists: real.assists,
        points: pontos,
      })
      .eq('id', p.id);
    if (!error) gravados += 1;

    porEntry.set(p.entry_id, (porEntry.get(p.entry_id) ?? 0) + pontos);
  }

  for (const [entryId, total] of porEntry) {
    await db.from('fantasy_entries').update({points: total}).eq('id', entryId);
  }

  await db
    .from('fantasy_rounds')
    .update({scored_at: new Date().toISOString()})
    .eq('competition_code', competitionCode)
    .eq('season', season)
    .eq('round', round);

  return {ok: true, escalacoes: entries.length, picks: gravados};
}

export interface LinhaRanking {
  customerId: string;
  pontos: number;
  rodadas: number;
}

/** Ranking do mês, no formato 'YYYY-MM'. */
export async function rankingMensal(
  db: Db,
  mes: string,
  limite = 20,
): Promise<LinhaRanking[]> {
  const {data} = await db
    .from('fantasy_monthly_ranking')
    .select('customer_id, pontos, rodadas')
    .eq('mes', mes)
    .order('pontos', {ascending: false})
    .limit(limite);

  return (data ?? []).map((r) => ({
    customerId: r.customer_id,
    pontos: r.pontos,
    rodadas: r.rodadas,
  }));
}

// ---------------------------------------------------------------------------
// Perfil do jogador
// ---------------------------------------------------------------------------

export interface PerfilFantasy {
  customerId: string;
  nickname: string;
}

export async function buscarPerfil(
  db: Db,
  customerId: string,
): Promise<PerfilFantasy | null> {
  const {data} = await db
    .from('fantasy_profiles')
    .select('customer_id, nickname')
    .eq('customer_id', customerId)
    .maybeSingle();

  return data ? {customerId: data.customer_id, nickname: data.nickname} : null;
}

/**
 * Grava o apelido. O unique em `nickname_normalizado` é quem garante que dois
 * participantes não fiquem com o mesmo nome no ranking — tratamos o erro de
 * conflito como "já em uso" em vez de consultar antes, que teria corrida.
 */
export async function salvarApelido(
  db: Db,
  customerId: string,
  nickname: string,
  normalizado: string,
): Promise<{ok: boolean; erro?: string}> {
  const {error} = await db.from('fantasy_profiles').upsert(
    {
      customer_id: customerId,
      nickname,
      nickname_normalizado: normalizado,
    },
    {onConflict: 'customer_id'},
  );

  if (!error) return {ok: true};
  if (error.code === '23505') {
    return {ok: false, erro: 'Esse apelido já está em uso. Escolha outro.'};
  }
  return {ok: false, erro: 'Não foi possível salvar o apelido agora.'};
}

export interface LinhaRankingNomeada {
  customerId: string;
  nickname: string;
  pontos: number;
  rodadas: number;
}

export async function rankingMensalNomeado(
  db: Db,
  mes: string,
  limite = 50,
): Promise<LinhaRankingNomeada[]> {
  const {data} = await db
    .from('fantasy_monthly_ranking_named')
    .select('customer_id, nickname, pontos, rodadas')
    .eq('mes', mes)
    .order('pontos', {ascending: false})
    .limit(limite);

  return (data ?? []).map((r) => ({
    customerId: r.customer_id,
    nickname: r.nickname,
    pontos: r.pontos,
    rodadas: r.rodadas,
  }));
}

export interface ResumoJogador {
  totalPontos: number;
  rodadasJogadas: number;
  ultima: {
    round: number;
    season: number;
    formation: string;
    points: number | null;
    picks: (PickSalvo & {
      actualGoals: number | null;
      actualAssists: number | null;
      points: number | null;
    })[];
  } | null;
}

/** Tudo do jogador para a tela de perfil: pontos, rodadas e a última escalação. */
export async function resumoDoJogador(
  db: Db,
  customerId: string,
  competitionCode: string,
): Promise<ResumoJogador> {
  const {data: entries} = await db
    .from('fantasy_entries')
    .select('id, season, round, formation, points')
    .eq('customer_id', customerId)
    .eq('competition_code', competitionCode)
    .order('round', {ascending: false});

  const lista = entries ?? [];
  const totalPontos = lista.reduce((s, e) => s + (e.points ?? 0), 0);
  if (!lista.length) return {totalPontos: 0, rodadasJogadas: 0, ultima: null};

  const ultima = lista[0];
  const {data: picks} = await db
    .from('fantasy_picks')
    .select('*')
    .eq('entry_id', ultima.id)
    .order('slot');

  return {
    totalPontos,
    rodadasJogadas: lista.length,
    ultima: {
      round: ultima.round,
      season: ultima.season,
      formation: ultima.formation,
      points: ultima.points,
      picks: (picks ?? []).map((p) => ({
        slot: p.slot,
        playerId: p.player_id,
        playerName: p.player_name,
        clubId: p.club_id,
        clubName: p.club_name,
        position: p.position,
        predGoals: p.pred_goals,
        predAssists: p.pred_assists,
        actualGoals: p.actual_goals,
        actualAssists: p.actual_assists,
        points: p.points,
      })),
    },
  };
}
