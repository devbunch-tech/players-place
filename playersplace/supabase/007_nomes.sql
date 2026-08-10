-- ============================================================================
-- Players Place — dicionário de nomes · migração 007
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- POR QUE ISTO EXISTE
--
-- Cinco painéis da página do jogador (desempenho, carreira, titularidades,
-- seleção e histórico de jogos) recebem da origem apenas o ID numérico do
-- clube e da competição. O nome vem de uma SEGUNDA chamada, a
-- `/clubs?ids[]=` da `tmapi.transfermarkt.technology`.
--
-- Quando essa chamada falha — e ela falha justamente quando tudo mais falha,
-- o 403 do WAF do CloudFront — o código caía para "usa o ID como nome". O
-- resultado apareceu em produção em 10/08/2026: a tabela "Desempenho por
-- clube" listando 931, 210, 294 no lugar de Fulham, Grêmio e Benfica. E, pior
-- que o erro na tela, o erro GRAVADO: aquele resultado ia para as três camadas
-- de cache como valor legítimo e sobrevivia à volta da origem.
--
-- Esta tabela quebra a dependência. Nome de clube não envelhece: uma vez
-- sabido, fica sabido. E como os ~500 clubes de BRA1 e BRA2 se repetem na
-- carreira de milhares de jogadores, uma resolução serve para todos eles — o
-- custo na origem cai de "uma consulta por jogador" para "uma por clube, na
-- vida".
--
-- POR QUE UMA TABELA, E NÃO MAIS CHAVES NA `tm_cache`
--
-- A consulta aqui é sempre "estes 60 IDs de uma vez", que numa tabela normal é
-- UM `in (...)`. Na `tm_cache`, indexada por chave única, seriam 60 leituras —
-- e o Worker tem teto de subrequisições por requisição.
-- ============================================================================

create table if not exists tm_nomes (
  -- 'clube' (inclui seleções) ou 'competicao'
  tipo          text        not null,
  -- o ID do Transfermarkt, como texto: eles são numéricos para clube e
  -- alfanuméricos para competição ('BRA1', 'CLI')
  id            text        not null,
  nome          text        not null,
  atualizado_em timestamptz not null default now(),
  primary key (tipo, id)
);

-- Sem índice extra de propósito: toda leitura é `where tipo = ? and id in (?)`,
-- que a própria chave primária já resolve.

alter table tm_nomes enable row level security;

-- O acesso é só pelo Worker com a chave service_role, que ignora RLS. Nenhuma
-- policy é criada, então qualquer outro caminho (anon, authenticated) não lê
-- nem escreve nada.


-- ----------------------------------------------------------------------------
-- Semente: o que a `jogadores_base` já sabe.
--
-- Cada linha de jogador carrega `clube_id`/`clube_nome` e `liga_code`/
-- `liga_nome` desnormalizados, gravados pela raspagem do elenco — que vem do
-- host de HTML, e não da API que leva 403. Ou seja: o dicionário já nasce com
-- todo clube e toda competição do Brasileirão resolvidos, sem depender de a
-- origem estar de pé.
--
-- `on conflict do nothing` porque o que já está lá veio da API, que é a fonte
-- mais precisa (nome curto oficial); esta semente é o piso, não a verdade.
-- ----------------------------------------------------------------------------
insert into tm_nomes (tipo, id, nome)
select distinct 'clube', clube_id, clube_nome
  from jogadores_base
 where clube_id is not null
   and coalesce(clube_nome, '') <> ''
on conflict (tipo, id) do nothing;

insert into tm_nomes (tipo, id, nome)
select distinct 'competicao', liga_code, liga_nome
  from jogadores_base
 where liga_code is not null
   and coalesce(liga_nome, '') <> ''
on conflict (tipo, id) do nothing;


-- ----------------------------------------------------------------------------
-- Conferência
--
--   -- tamanho do dicionário
--   select tipo, count(*) from tm_nomes group by tipo;
--
--   -- os clubes do Brasileirão já estão resolvidos?
--   select b.clube_id, b.clube_nome, n.nome
--     from (select distinct clube_id, clube_nome from jogadores_base
--            where liga_code in ('BRA1','BRA2')) b
--     left join tm_nomes n on n.tipo = 'clube' and n.id = b.clube_id
--    where n.nome is null;
--
--   -- alguém entrou com o ID como nome? (não deveria acontecer nunca mais)
--   select * from tm_nomes where nome = id;
-- ----------------------------------------------------------------------------
