-- ============================================================================
-- Players Place — cache durável do Transfermarkt · migração 004
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- POR QUE ISTO EXISTE
--
-- As páginas de jogador, clube e competição são montadas raspando o
-- Transfermarkt. O cache da aplicação tinha só duas camadas, ambas efêmeras:
-- memória do isolate (que no Oxygen vive pouco) e Cache API do Worker (que é
-- por PoP e despeja entrada quando quer). Quando o visitante caía num PoP frio
-- e a origem estava instável, não havia nada para servir e o loader devolvia
-- 502.
--
-- Esta tabela é a terceira camada — a única que sobrevive a despejo, deploy e
-- troca de PoP. Com ela a raspagem vira atualização, e não pré-requisito para
-- a página existir: se a origem falhar, o visitante recebe a última cópia boa
-- com um aviso discreto de quando ela foi coletada.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Uma linha por consulta.
--
-- `chave` é a mesma string usada no cache da aplicação ('player:28003',
-- 'club:210', 'league:BRA1', 'perf:28003', …) — ver `cached()` em
-- app/lib/tm/client.ts.
--
-- `payload` guarda o valor embrulhado em {"v": …} porque a coluna é NOT NULL e
-- várias consultas legitimamente devolvem null (carreira e histórico de jogos
-- de quem não tem nenhum). Sem o embrulho, "não tem dado" e "erro ao gravar"
-- ficariam indistinguíveis.
--
-- `fresco_ate` é a validade lógica (o TTL de cada consulta, entre 15 min e
-- 24 h). Linha vencida NÃO é lixo: é justamente ela que segura a página no ar
-- enquanto a atualização roda em segundo plano. Por isso nada aqui é apagado
-- por vencimento — só por desuso, no cron do final do arquivo.
-- ----------------------------------------------------------------------------
create table if not exists tm_cache (
  chave      text        primary key,
  payload    jsonb       not null,
  fresco_ate timestamptz not null,
  updated_at timestamptz not null default now()
);

-- a limpeza varre por idade; sem este índice ela vira seq scan na tabela toda
create index if not exists tm_cache_updated_idx on tm_cache (updated_at);

-- Mesma postura do resto do schema: a aplicação entra com a chave service_role
-- (que ignora RLS), e o RLS fica ligado sem nenhuma policy para que a chave
-- anon — a pública, do navegador — não leia nem escreva nada aqui.
alter table tm_cache enable row level security;


-- ----------------------------------------------------------------------------
-- Limpeza por desuso.
--
-- A tabela cresce com a cauda longa: cada jogador visitado uma única vez deixa
-- ~9 linhas para trás. 90 dias sem nenhuma atualização significa que ninguém
-- abriu aquela página nesse período — se abrirem de novo, a linha volta na
-- primeira raspagem.
--
-- pg_cron e pg_net já foram instalados na migração 002.
-- ----------------------------------------------------------------------------
create or replace function tm_cache_limpar() returns void as $$
begin
  delete from tm_cache where updated_at < now() - interval '90 days';
end;
$$ language plpgsql;

select cron.unschedule('tm-cache-limpeza')
  where exists (select 1 from cron.job where jobname = 'tm-cache-limpeza');

select cron.schedule(
  'tm-cache-limpeza',
  '30 4 * * *',                       -- todo dia às 4h30 (UTC), fora do pico
  $$ select tm_cache_limpar(); $$
);


-- ----------------------------------------------------------------------------
-- Conferência
--
--   -- quantas consultas já estão salvas, e quanto ocupam?
--   select count(*) as linhas,
--          pg_size_pretty(pg_total_relation_size('tm_cache')) as tamanho
--     from tm_cache;
--
--   -- quantas estão vencidas (servindo como rede de segurança)?
--   select count(*) from tm_cache where fresco_ate < now();
--
--   -- as maiores, para conferir se o teto de 512 KB está sendo respeitado
--   select chave, pg_column_size(payload) as bytes
--     from tm_cache order by bytes desc limit 10;
--
--   -- um jogador específico já está salvo?
--   select chave, fresco_ate, updated_at
--     from tm_cache where chave like '%:28003' order by chave;
-- ----------------------------------------------------------------------------
