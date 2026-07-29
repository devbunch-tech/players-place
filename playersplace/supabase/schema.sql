-- ============================================================================
-- Players Place — Game Fantasy
--
-- Cole este arquivo INTEIRO no SQL Editor do Supabase e clique em Run.
-- Pode rodar mais de uma vez sem problema: tudo é "if not exists" / "replace".
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Rodadas do campeonato.
--
-- Existe para guardar o prazo: a escalação fecha 2h antes do primeiro jogo.
-- Sem esta tabela o prazo teria que ser recalculado do Transfermarkt a cada
-- request, e uma instabilidade da origem viraria "rodada sem prazo".
-- ----------------------------------------------------------------------------
create table if not exists fantasy_rounds (
  competition_code text        not null default 'BRA1',
  season           int         not null,
  round            int         not null,
  -- horário do primeiro jogo da rodada
  first_match_at   timestamptz,
  -- first_match_at - 2h; é o que trava a edição
  deadline_at      timestamptz not null,
  -- preenchido quando a rodada já foi apurada
  scored_at        timestamptz,
  primary key (competition_code, season, round)
);


-- ----------------------------------------------------------------------------
-- A escalação de um usuário numa rodada.
--
-- customer_id é o GID do cliente na Shopify (gid://shopify/Customer/123).
-- A unique impede duas escalações do mesmo usuário para a mesma rodada.
-- ----------------------------------------------------------------------------
create table if not exists fantasy_entries (
  id               uuid        primary key default gen_random_uuid(),
  customer_id      text        not null,
  competition_code text        not null default 'BRA1',
  season           int         not null,
  round            int         not null,
  -- ex.: '4-3-3'
  formation        text        not null,
  -- total da rodada; null enquanto não apurado
  points           int,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id, competition_code, season, round)
);


-- ----------------------------------------------------------------------------
-- Jogadores escalados e o palpite de cada um.
--
-- Só gols e assistências: são as únicas estatísticas que a fonte de dados
-- (Transfermarkt) publica por jogador e por jogo. Desarme e passe errado não
-- existem lá, então não dá para apurar palpite sobre eles.
--
-- player_name / club_name ficam desnormalizados de propósito: se o jogador
-- mudar de clube depois, a escalação daquela rodada continua contando a
-- história certa.
-- ----------------------------------------------------------------------------
create table if not exists fantasy_picks (
  id             bigserial primary key,
  entry_id       uuid    not null references fantasy_entries(id) on delete cascade,
  -- posição do jogador dentro da formação (1..11)
  slot           int     not null,
  player_id      text    not null,
  player_name    text    not null,
  club_id        text,
  club_name      text,
  position       text,
  pred_goals     int     not null default 0,
  pred_assists   int     not null default 0,
  -- preenchidos na apuração
  actual_goals   int,
  actual_assists int,
  points         int,
  unique (entry_id, slot),
  -- o mesmo jogador não pode ocupar duas vagas
  unique (entry_id, player_id)
);


-- ----------------------------------------------------------------------------
-- Índices para as consultas que a aplicação realmente faz.
-- ----------------------------------------------------------------------------
create index if not exists fantasy_entries_customer_idx
  on fantasy_entries (customer_id);

create index if not exists fantasy_entries_round_idx
  on fantasy_entries (competition_code, season, round);

create index if not exists fantasy_picks_entry_idx
  on fantasy_picks (entry_id);


-- ----------------------------------------------------------------------------
-- updated_at automático nas escalações.
-- ----------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists fantasy_entries_updated on fantasy_entries;
create trigger fantasy_entries_updated
  before update on fantasy_entries
  for each row execute function set_updated_at();


-- ----------------------------------------------------------------------------
-- Ranking mensal — é ele que decide o ganhador do prêmio.
--
-- O mês vem do prazo da rodada convertido para o fuso de São Paulo: uma
-- rodada que fecha 31/08 às 22h em Brasília é 01/09 em UTC, e cairia no mês
-- errado se agrupássemos pelo horário bruto.
-- ----------------------------------------------------------------------------
create or replace view fantasy_monthly_ranking as
select
  e.customer_id,
  to_char(r.deadline_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as mes,
  sum(coalesce(e.points, 0))                                          as pontos,
  count(*)                                                            as rodadas
from fantasy_entries e
join fantasy_rounds r
  on  r.competition_code = e.competition_code
  and r.season           = e.season
  and r.round            = e.round
where e.points is not null
group by e.customer_id,
         to_char(r.deadline_at at time zone 'America/Sao_Paulo', 'YYYY-MM');


-- ----------------------------------------------------------------------------
-- Segurança.
--
-- A aplicação acessa com a chave service_role, que ignora RLS. Ligamos o RLS
-- mesmo assim e não criamos nenhuma policy: assim, se a chave `anon` (a que é
-- pública, feita para navegador) for usada por engano em qualquer lugar, ela
-- não lê nem escreve nada. É cinto de segurança, não a trava principal.
-- ----------------------------------------------------------------------------
alter table fantasy_rounds  enable row level security;
alter table fantasy_entries enable row level security;
alter table fantasy_picks   enable row level security;
