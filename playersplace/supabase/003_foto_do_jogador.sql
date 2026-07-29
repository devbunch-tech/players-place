-- ============================================================================
-- Players Place — Game Fantasy · migração 003
--
-- Cole no SQL Editor do Supabase e rode. Pode rodar mais de uma vez.
-- ============================================================================

-- A escalação agora é desenhada num campo, com a foto do jogador em cada
-- posição. A URL da foto do Transfermarkt tem um sufixo próprio por jogador
-- (não é derivável do id), então precisa ser guardada junto com o palpite —
-- caso contrário a foto some quando o usuário recarrega a página.
--
-- Fica desnormalizada pelo mesmo motivo de player_name: a escalação daquela
-- rodada deve continuar mostrando o que foi escolhido na época.
alter table fantasy_picks
  add column if not exists player_photo text;
