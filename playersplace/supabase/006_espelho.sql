-- ============================================================================
-- Players Place — espelho do Transfermarkt · migração 006
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- POR QUE ISTO EXISTE
--
-- A migração 004 criou a `tm_cache` e resolveu a disponibilidade das páginas
-- que ALGUÉM JÁ TINHA VISITADO. O que ficou de fora é o resto: uma página de
-- jogador nunca aberta não tem nenhuma linha no banco, então quando o
-- Transfermarkt cai ela devolve 502 exatamente como antes da 004.
--
-- Esta migração dá o passo que falta: a base deixa de ser "cache do que foi
-- visitado" e passa a ser ESPELHO — tudo o que a plataforma sabe exibir está
-- gravado, e a raspagem existe só para atualizar.
--
-- Duas peças:
--
--  1. `tm_cache` ganha detecção de mudança por conteúdo (`hash`), separando
--     "quando eu conferi" de "quando o dado mudou de verdade";
--  2. `jogadores_base` ganha o rastro que diz QUAIS jogadores mudaram, para o
--     job noturno re-raspar só esses em vez dos 13 mil.
--
-- POR QUE POR CONTEÚDO, E NÃO POR CABEÇALHO HTTP
--
-- Medido em 10/08/2026: o Transfermarkt manda `Last-Modified`, mas ele é a
-- hora de RENDERIZAÇÃO, não a da última alteração. Com o conteúdo idêntico,
-- 100 s depois o valor tinha pulado de 14:23:00 para 14:25:00 (o TTL de 60 s
-- do CloudFront) e o `If-Modified-Since` voltou 200, não 304. Ou seja:
-- requisição condicional não serve de nada aqui, e comparar o conteúdo já
-- baixado é a única forma honesta de saber se algo mudou.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. tm_cache: detecção de mudança por conteúdo
--
-- `hash`        — SHA-256 do valor serializado, calculado na aplicação.
-- `verificado_em` — a última vez que fomos à origem conferir, mudando ou não.
-- `estabilidade`  — quantas conferências seguidas deram "não mudou nada".
--
-- A partir daqui `updated_at` muda de significado: passa a ser a data da
-- última ALTERAÇÃO REAL do conteúdo, e não a da última gravação. Serve para
-- responder "quando este jogador se mexeu pela última vez".
--
-- A página continua lendo `verificado_em` para escrever "Dados de …", e isso é
-- deliberado: a carreira de um aposentado não muda há dois anos e está
-- perfeitamente atual — carimbá-la com 2024 assustaria o visitante à toa.
-- ----------------------------------------------------------------------------
alter table tm_cache add column if not exists hash text;
alter table tm_cache add column if not exists verificado_em timestamptz not null default now();
alter table tm_cache add column if not exists estabilidade int not null default 0;

-- linhas antigas nunca foram conferidas por hash; herdar a data de gravação é
-- o mais próximo da verdade e evita que a limpeza abaixo as trate como órfãs
update tm_cache set verificado_em = updated_at where verificado_em < updated_at;


-- ----------------------------------------------------------------------------
-- Gravação com comparação de conteúdo, em uma ida só ao banco.
--
-- POR QUE UMA FUNÇÃO, E NÃO UM UPSERT NA APLICAÇÃO: decidir "mudou?" no
-- cliente exigiria um SELECT antes de cada UPSERT — o dobro das idas ao
-- PostgREST em cada uma das ~120 mil chaves do espelho, com uma janela de
-- corrida entre a leitura e a escrita. Aqui é uma chamada, atômica.
--
-- VALIDADE ADAPTATIVA (é o coração do "atualizar só o que muda"): cada
-- conferência que não encontra diferença DOBRA a validade lógica da chave, até
-- o teto. A carreira de um jogador aposentado é conferida uma vez, depois em
-- 12 h, 24 h, 48 h… e em uma semana para de ser re-raspada na visita; o
-- histórico de jogos de quem joga toda quarta e domingo volta para o TTL base
-- toda vez que muda e continua sendo buscado de perto. Ninguém precisa
-- adivinhar TTL por tipo de dado — o próprio conteúdo decide.
--
-- Devolve `mudou` para o job noturno poder relatar o que de fato se moveu.
-- ----------------------------------------------------------------------------
create or replace function tm_cache_gravar(
  p_chave   text,
  p_payload jsonb,
  p_hash    text,
  p_ttl_s   int,
  p_teto_s  int default 604800          -- 7 dias
-- os nomes de saída levam sufixo `_out` de propósito: em plpgsql um parâmetro
-- OUT chamado `estabilidade` ou `fresco_ate` colide com a coluna homônima e o
-- corpo inteiro passa a falhar com "column reference is ambiguous"
) returns table (mudou_out boolean, estabilidade_out int, fresco_ate_out timestamptz)
as $$
declare
  v_hash  text;
  v_estab int;
  v_mudou boolean;
  v_valid int;
begin
  select c.hash, c.estabilidade into v_hash, v_estab
    from tm_cache c where c.chave = p_chave;

  -- `v_hash is null` cobre tanto "chave nova" quanto as linhas gravadas antes
  -- desta migração, que nunca tiveram hash: as duas contam como mudança e
  -- entram no ciclo normal a partir da próxima conferência
  v_mudou := v_hash is distinct from p_hash or v_hash is null;
  v_estab := case when v_mudou then 0 else least(coalesce(v_estab, 0) + 1, 9) end;

  -- 2^9 = 512× o TTL base já passa de qualquer teto razoável; o `least` com
  -- p_teto_s é quem manda, o expoente limitado só evita overflow
  v_valid := least(p_ttl_s * (2 ^ v_estab)::bigint, p_teto_s)::int;

  insert into tm_cache as t
         (chave,   payload,   hash,   fresco_ate,                    updated_at, verificado_em, estabilidade)
  values (p_chave, p_payload, p_hash, now() + make_interval(secs => v_valid), now(), now(), v_estab)
  on conflict (chave) do update set
    -- payload só é reescrito quando mudou: sem isto, uma chave estável de
    -- 300 KB seria regravada inteira toda noite sem nenhum ganho
    payload       = case when v_mudou then excluded.payload else t.payload end,
    hash          = excluded.hash,
    fresco_ate    = excluded.fresco_ate,
    updated_at    = case when v_mudou then now() else t.updated_at end,
    verificado_em = now(),
    estabilidade  = excluded.estabilidade;

  return query select v_mudou, v_estab, now() + make_interval(secs => v_valid);
end;
$$ language plpgsql;


-- ----------------------------------------------------------------------------
-- Limpeza — agora por DESUSO DE VERDADE.
--
-- CUIDADO, ISTO É UMA CORREÇÃO E NÃO UM AJUSTE: a limpeza da 004 apagava por
-- `updated_at < now() - 90 days`. Com o hash acima, `updated_at` passou a
-- significar "última vez que o conteúdo mudou" — então a regra antiga apagaria
-- justamente as chaves mais estáveis (a carreira de um jogador aposentado não
-- muda nunca), mesmo sendo conferidas todas as noites. `verificado_em` é o
-- critério certo: ele só para de avançar quando ninguém mais toca na chave.
--
-- O intervalo subiu para 180 dias porque agora existe um job que confere o
-- espelho inteiro: 90 dias sem NENHUMA conferência significa que a chave saiu
-- do espelho (jogador que deixou as ligas cobertas e página que ninguém mais
-- abre), e meio ano é a margem para uma temporada inteira de ausência.
-- ----------------------------------------------------------------------------
create index if not exists tm_cache_verificado_idx on tm_cache (verificado_em);

create or replace function tm_cache_limpar() returns void as $$
begin
  delete from tm_cache where verificado_em < now() - interval '180 days';
end;
$$ language plpgsql;


-- ----------------------------------------------------------------------------
-- 2. jogadores_base: o rastro de quem mudou
--
-- `assinatura` — os campos que o elenco do clube publica (nome, número,
--                posição, valor, clube). É a SENTINELA: uma única raspagem por
--                clube revela, de graça, quais dos ~28 jogadores se moveram.
-- `sujo`        — está na fila de raspagem profunda?
-- `alterado_em` — quando a assinatura mudou pela última vez (informativo).
-- `fundo_em`    — quando as ~9 chaves pesadas do jogador (carreira, jogos,
--                 desempenho, valor de mercado…) foram atualizadas por último.
--
-- É `sujo` que faz o job noturno re-raspar dezenas de jogadores em vez de treze
-- mil: 480 requisições de sentinela decidem o destino de ~120 mil chaves.
--
-- POR QUE UMA COLUNA, E NÃO A COMPARAÇÃO `alterado_em > fundo_em`: a fila é
-- lida pelo PostgREST, que não sabe comparar duas COLUNAS entre si — só coluna
-- com valor. Filtrar no cliente, depois de ordenar por `fundo_em`, parece
-- equivalente e não é: em regime permanente os `fundo_em` mais antigos são
-- justamente os jogadores que ninguém tocou (limpos), e um jogador marcado
-- hoje, cujo `fundo_em` é de ontem, ficaria no fim da ordenação — invisível
-- para sempre. Um booleano indexado resolve isso e ainda torna a fila legível
-- num `select` simples.
--
-- O default é `true` de propósito: toda linha que já existe entra na fila do
-- backfill sem precisar de UPDATE nenhum.
--
-- `atualizado_em` continua sendo "a linha foi confirmada", que é o que
-- VALIDADE_BASE em app/lib/jogadores.server.ts precisa saber.
-- ----------------------------------------------------------------------------
alter table jogadores_base add column if not exists assinatura  text;
alter table jogadores_base add column if not exists sujo        boolean not null default true;
alter table jogadores_base add column if not exists alterado_em timestamptz not null default now();
alter table jogadores_base add column if not exists fundo_em    timestamptz;

-- A fila é sempre "os sujos, do mais antigo para o mais novo". O índice parcial
-- cobre exatamente essa consulta e, melhor, ENCOLHE conforme o backfill avança:
-- em regime permanente ele indexa dezenas de linhas, não treze mil.
create index if not exists jogadores_base_fila_idx
  on jogadores_base (liga_code, fundo_em nulls first) where sujo;


-- ----------------------------------------------------------------------------
-- O PostgREST guarda o schema em cache e só reconhece `tm_cache_gravar` depois
-- de recarregá-lo. Sem isto, a primeira gravação da aplicação volta com
-- PGRST202 ("Could not find the function") por alguns minutos — que parece bug
-- de código e é só cache.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- Conferência
--
--   -- o espelho está completo? (chaves por tipo)
--   select split_part(chave, ':', 1) as tipo, count(*)
--     from tm_cache group by 1 order by 2 desc;
--
--   -- a validade adaptativa está funcionando? (deve haver massa em estabilidade alta)
--   select estabilidade, count(*) from tm_cache group by 1 order by 1;
--
--   -- quantos jogadores ainda faltam ser raspados a fundo, por liga?
--   select liga_code,
--          count(*) filter (where fundo_em is null) as nunca,
--          count(*) filter (where sujo)             as na_fila,
--          count(*)                                 as total
--     from jogadores_base group by 1 order by 2 desc;
--
--   -- quanto o espelho ocupa?
--   select pg_size_pretty(pg_total_relation_size('tm_cache'));
-- ----------------------------------------------------------------------------
