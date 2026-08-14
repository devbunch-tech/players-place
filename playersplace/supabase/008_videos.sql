-- ============================================================================
-- Players Place — vídeos de highlights · migração 008
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
--
-- POR QUE ISTO EXISTE
--
-- O vídeo de highlights de cada jogador já é buscado sob demanda, quando
-- alguém abre a página dele (`getPlayerHighlight` em app/lib/youtube.ts). Isso
-- deixa a plataforma inteira dependendo de visita: um jogador que ninguém
-- abriu nunca teve vídeo, e o primeiro visitante paga a espera.
--
-- Esta migração dá à busca de vídeo o mesmo tratamento que a 006 deu à
-- raspagem profunda — uma fila que um job noturno consome — com UMA diferença
-- decisiva de escala, explicada abaixo.
--
-- A COTA É O RECURSO ESCASSO, E ELA É PEQUENA
--
-- A YouTube Data API v3 dá 10.000 unidades por dia e cobra 100 por busca:
-- **100 buscas diárias** para a plataforma toda. Com ~13 mil jogadores nas 24
-- ligas, cobrir todo mundo leva ~130 dias usando 100% da cota — e nesse regime
-- não sobra nenhuma unidade para os visitantes reais.
--
-- Por isso a fila daqui NÃO é "todos os jogadores, do mais antigo para o mais
-- novo", como a do espelho. Ela é ordenada por VALOR DE MERCADO, que é o
-- melhor proxy disponível de quem será visitado: os 500 jogadores mais caros
-- da plataforma concentram a esmagadora maioria das visitas, e são cobertos em
-- cinco dias em vez de quatro meses.
--
-- A coluna aqui é o que impede o job de gastar cota repetindo jogador — sem
-- ela, não há como perguntar "quem ainda não tem vídeo?" sem varrer a
-- `tm_cache` por `chave like 'yt:highlight:<id>:%'`, uma consulta que não usa
-- índice e cujo custo cresce com o cache inteiro.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- `video_em` — quando este jogador teve a busca de vídeo executada.
--
-- NULL = nunca buscado, e é o que a fila procura. A data é preenchida MESMO
-- QUANDO A BUSCA NÃO ACHA VÍDEO: "procurei e não existe" também custou 100
-- unidades, e repetir amanhã torraria a cota nos mesmos jogadores sem vídeo.
--
-- Quem quiser forçar uma nova rodada para alguém zera a coluna:
--   update jogadores_base set video_em = null where id = '...';
--
-- Note que ela NÃO tem par com `sujo`, ao contrário de `fundo_em`. É
-- deliberado: não existe sentinela barata que revele "saiu um highlight novo
-- deste jogador", e inventar uma re-busca periódica seria exatamente o gasto
-- que a cota não comporta. A atualização de quem já tem vídeo fica a cargo da
-- validade adaptativa da `tm_cache`, com o teto de 180 dias das chaves `yt:`.
-- ----------------------------------------------------------------------------
alter table jogadores_base add column if not exists video_em timestamptz;


-- ----------------------------------------------------------------------------
-- O índice da fila.
--
-- Parcial em `video_em is null` porque é só isso que o job pergunta, e porque
-- assim ele ENCOLHE conforme a cobertura avança — o oposto de um índice que
-- cresce com a tabela. Ordenado por `valor_num` desc para a consulta do job
-- sair pronta do índice, sem sort.
--
-- `nulls last`: jogador sem valor de mercado publicado (garoto de base recém
-- promovido, por exemplo) é o menos provável de ser procurado no YouTube, e
-- por isso vai para o fim da fila em vez de encabeçá-la.
-- ----------------------------------------------------------------------------
create index if not exists jogadores_base_video_idx
  on jogadores_base (valor_num desc nulls last)
  where video_em is null;


-- ----------------------------------------------------------------------------
-- O PostgREST guarda o schema em cache; sem isto a primeira consulta que
-- filtra por `video_em` volta com PGRST204 ("column not found") por alguns
-- minutos — que parece bug de código e é só cache.
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';


-- ----------------------------------------------------------------------------
-- Conferência
--
--   -- quanto da plataforma já tem vídeo buscado?
--   select count(*) filter (where video_em is not null) as buscados,
--          count(*)                                     as total
--     from jogadores_base
--    where liga_code is not null;
--
--   -- e quantos deles ACHARAM vídeo? (a busca pode ter voltado vazia)
--   select count(*) from tm_cache where chave like 'yt:highlight:%';
--
--   -- os próximos da fila, na ordem em que o job vai pegá-los
--   select nome, clube_nome, valor
--     from jogadores_base
--    where video_em is null and liga_code is not null
--    order by valor_num desc nulls last
--    limit 20;
--
--   -- forçar uma nova busca para um jogador específico
--   update jogadores_base set video_em = null where id = '28003';
-- ----------------------------------------------------------------------------
