-- ============================================================================
-- Players Place — base de jogadores do Brasileirão · migração 005
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- POR QUE ISTO EXISTE
--
-- A `tm_cache` da migração 004 resolveu a DISPONIBILIDADE (nunca faltar cópia),
-- mas não resolveu a LATÊNCIA da primeira pintura: a página do jogador só
-- renderizava depois de resolver `player:<id>` — uma raspagem inteira do
-- Transfermarkt quando a chave estava fria, ou pelo menos uma ida ao banco
-- buscando um JSON grande quando estava quente.
--
-- Esta tabela é o índice achatado do que a página precisa para pintar o topo:
-- nome, foto, clube, posição, idade, nacionalidade, número e valor. Sai de
-- graça — todos esses campos já vêm na MESMA raspagem do elenco do clube
-- (`club:<id>`), então cobrir as duas séries custa ~40 requisições por dia, e
-- não uma por jogador.
--
-- Com ela o loader de /jogadores/:id espera uma consulta indexada por chave
-- primária (~30 ms) em vez de nove raspagens, e todo o resto da página desce
-- em streaming, cada painel com seu próprio esqueleto.
--
-- O que ela NÃO é: fonte da verdade. É cache derivado. Se estiver vazia,
-- vencida ou fora do ar, o loader cai de volta na raspagem de sempre.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- Uma linha por jogador, com o clube desnormalizado dentro.
--
-- `id` é o identificador do jogador no Transfermarkt — o mesmo que aparece na
-- URL /jogadores/:id e nas chaves de `tm_cache` ('player:28003').
--
-- `valor` guarda o rótulo exibido ("€ 12,00 mi") e `valor_num` o mesmo número
-- em milhões de euros. Os dois porque a origem só dá o texto, e ordenar por
-- texto colocaria "€ 900 mil" acima de "€ 12,00 mi".
--
-- `atualizado_em` é o que decide se a linha ainda vale — ver VALIDADE_BASE em
-- app/lib/jogadores.server.ts. Linha velha não é apagada: ela ainda serve de
-- rede de segurança se o aquecimento parar de rodar.
-- ----------------------------------------------------------------------------
create table if not exists jogadores_base (
  id            text primary key,
  nome          text not null,
  foto          text,
  numero        text,
  posicao       text,
  nascimento    text,
  idade         int,
  nacionalidade text,
  valor         text,
  valor_num     numeric,
  clube_id      text,
  clube_nome    text,
  clube_escudo  text,
  liga_code     text,
  liga_nome     text,
  atualizado_em timestamptz not null default now()
);

-- o aquecimento reescreve um clube inteiro por vez e apaga quem saiu do elenco
create index if not exists jogadores_base_clube_idx on jogadores_base (clube_id);

-- listagens por competição ("os mais valiosos da Série B")
create index if not exists jogadores_base_liga_valor_idx
  on jogadores_base (liga_code, valor_num desc nulls last);

-- busca por nome sem acento/caixa continua indo para a origem; aqui o índice
-- serve só para o prefixo simples usado em telas internas
create index if not exists jogadores_base_nome_idx on jogadores_base (nome);

-- Mesma postura do resto do schema: a aplicação entra com a chave service_role
-- (que ignora RLS), e o RLS fica ligado sem nenhuma policy para que a chave
-- anon — a pública, do navegador — não leia nem escreva nada aqui.
alter table jogadores_base enable row level security;


-- ----------------------------------------------------------------------------
-- Registro de cada passada do aquecimento.
--
-- Serve para duas coisas concretas: saber se o job parou de rodar (a página
-- ainda funciona, mas silenciosamente na base velha) e saber por onde retomar
-- quando o aquecimento é fatiado em lotes por causa do limite de subrequests
-- do Worker.
-- ----------------------------------------------------------------------------
create table if not exists jogadores_base_execucao (
  liga_code    text primary key,
  clubes       int         not null default 0,
  jogadores    int         not null default 0,
  erros        int         not null default 0,
  duracao_ms   int         not null default 0,
  concluido_em timestamptz not null default now()
);

alter table jogadores_base_execucao enable row level security;


-- ----------------------------------------------------------------------------
-- Conferência
--
--   -- quantos jogadores por competição, e de quando é a base?
--   select liga_code, count(*), max(atualizado_em), min(atualizado_em)
--     from jogadores_base group by liga_code order by 2 desc;
--
--   -- a última passada do aquecimento
--   select * from jogadores_base_execucao order by concluido_em desc;
--
--   -- alguma linha ficou para trás (clube que sumiu do aquecimento)?
--   select clube_nome, count(*), max(atualizado_em)
--     from jogadores_base
--    where atualizado_em < now() - interval '7 days'
--    group by clube_nome order by 3;
--
--   -- os mais valiosos da Série B
--   select nome, clube_nome, valor from jogadores_base
--    where liga_code = 'BRA2' order by valor_num desc nulls last limit 20;
-- ----------------------------------------------------------------------------
