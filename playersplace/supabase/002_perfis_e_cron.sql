-- ============================================================================
-- Players Place — Game Fantasy · migração 002
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- ATENÇÃO: a seção do cron no final tem DOIS valores para você substituir.
-- Procure por <<< PREENCHER >>>.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Perfil público do jogador.
--
-- O ranking precisa mostrar um nome. Só temos o GID do cliente Shopify, que
-- não serve para exibir, então cada participante escolhe um apelido no
-- primeiro acesso.
--
-- nickname_normalizado existe para o unique ser insensível a maiúsculas e
-- acentos: sem ele, "Zagueiro" e "zagueiro" conviveriam no ranking.
-- ----------------------------------------------------------------------------
create table if not exists fantasy_profiles (
  customer_id           text        primary key,
  nickname              text        not null,
  nickname_normalizado  text        not null unique,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists fantasy_profiles_updated on fantasy_profiles;
create trigger fantasy_profiles_updated
  before update on fantasy_profiles
  for each row execute function set_updated_at();

alter table fantasy_profiles enable row level security;


-- ----------------------------------------------------------------------------
-- Ranking mensal com apelido, para a tela não precisar de duas consultas.
-- ----------------------------------------------------------------------------
create or replace view fantasy_monthly_ranking_named as
select
  r.customer_id,
  coalesce(p.nickname, 'Participante') as nickname,
  r.mes,
  r.pontos,
  r.rodadas
from fantasy_monthly_ranking r
left join fantasy_profiles p on p.customer_id = r.customer_id;


-- ============================================================================
-- Apuração automática com pg_cron
--
-- A rota /api/fantasy/apurar já sabe se a rodada terminou: se ainda houver
-- jogo sem placar ela não grava nada. Por isso o cron pode rodar de hora em
-- hora sem risco — ele só "acerta" quando o último jogo da rodada fecha.
-- ============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- Guarda o token fora do agendamento, para não ficar repetido em vários
-- lugares e para poder ser trocado num UPDATE só.
create table if not exists fantasy_config (
  chave text primary key,
  valor text not null
);
alter table fantasy_config enable row level security;

-- O token NÃO fica aqui: este arquivo vai para o repositório. Ele é gravado
-- pelo UPDATE do bloco "PASSO 2", rodado direto no SQL Editor.
insert into fantasy_config (chave, valor) values
  ('apuracao_url',   'https://players-place-110242174453fe178c49.o2.myshopify.dev/api/fantasy/apurar'),
  ('apuracao_token', 'DEFINIR-VIA-UPDATE')
on conflict (chave) do nothing;


-- Chama a rota de apuração. Só isso: toda a regra de "a rodada acabou?" mora
-- na aplicação, que é quem sabe ler o placar dos jogos.
create or replace function fantasy_disparar_apuracao() returns void as $$
declare
  v_url   text;
  v_token text;
begin
  select valor into v_url   from fantasy_config where chave = 'apuracao_url';
  select valor into v_token from fantasy_config where chave = 'apuracao_token';

  if v_url is null or v_token is null or v_url like '%PREENCHER%' then
    raise notice 'fantasy: url/token não configurados, apuração não disparada';
    return;
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',    'application/json',
                 'x-fantasy-token', v_token
               ),
    body    := '{}'::jsonb
  );
end;
$$ language plpgsql;


-- De hora em hora. A rodada costuma terminar à noite; rodar de hora em hora
-- faz a apuração sair no máximo 59 minutos depois do apito final.
select cron.unschedule('fantasy-apuracao')
  where exists (select 1 from cron.job where jobname = 'fantasy-apuracao');

select cron.schedule(
  'fantasy-apuracao',
  '5 * * * *',                        -- todo minuto 5 de cada hora
  $$ select fantasy_disparar_apuracao(); $$
);

update fantasy_config set valor =
  'https://players-place-110242174453fe178c49.o2.myshopify.dev/api/fantasy/apurar'
  where chave = 'apuracao_url';

update fantasy_config set valor = '9d4f41561f17a571cabbd7b3ad3e07524204d0b1893ef195798ba8ddbf3f3aca'
  where chave = 'apuracao_token';
  
-- ============================================================================
-- PASSO 2 — grave o token (NÃO salve o valor real neste arquivo)
--
-- Abra uma nova query no SQL Editor, cole só as duas linhas abaixo trocando
-- o texto pelo seu token, e rode. Precisa ser o MESMO valor que está em
-- FANTASY_APURACAO_TOKEN nas variáveis da storefront.
--
--   update fantasy_config set valor = 'SEU-TOKEN-AQUI'
--    where chave = 'apuracao_token';
--
-- Por que UPDATE e não editar o INSERT acima: o insert tem
-- `on conflict do nothing`, então se a linha já existe ele ignora o valor
-- novo em silêncio. UPDATE sempre grava.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- PASSO 3 — conferência
--
--   -- os valores ficaram certos?
--   select chave, left(valor, 24) || '…' from fantasy_config;
--
--   -- o agendamento existe?
--   select jobname, schedule, active from cron.job where jobname = 'fantasy-apuracao';
--
--   -- ele rodou?
--   select status, start_time from cron.job_run_details order by start_time desc limit 5;
--
--   -- o que a aplicação respondeu? (é aqui que se vê se funcionou)
--   select status_code, content, created from net._http_response order by created desc limit 5;
--
-- Em `content` você deve ver {"ok":false,"motivo":"rodada-em-andamento"}
-- enquanto a rodada não terminar. Se vier {"erro":"não autorizado"}, o token
-- do banco e o da storefront estão diferentes.
-- ----------------------------------------------------------------------------
