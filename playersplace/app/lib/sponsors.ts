/**
 * Espaços patrocinados de vídeo-análise por jogador.
 *
 * Canais de YouTube pagam para exibir suas análises na página do atleta:
 *   · R$ 10 por vídeo (avulso)
 *   · R$ 100/mês por vídeos ilimitados (canal assinante) + prioridade
 *
 * A página do jogador exibe até 5 vídeos (assinantes primeiro); havendo
 * mais, aparece o botão "Ver mais análises". Em produção, este mapa será
 * alimentado pelos pedidos pagos na Shopify; localmente é mantido à mão
 * como demonstração (exemplo: Santiago Sosa).
 */
export interface SponsorVideo {
  /** id do vídeo no YouTube */
  youtubeId: string;
  title: string;
  channel: string;
  channelUrl: string;
  /** canal com o plano mensal de R$ 100 — prioridade na exibição */
  subscriber?: boolean;
}

const PLAYER_VIDEOS: Record<string, SponsorVideo[]> = {
  // Santiago Sosa (Racing Club) — demonstração com vídeos reais
  '576026': [
    {
      youtubeId: 'jjQV3DVxhRY',
      title: 'Como realmente joga Santiago Sosa',
      channel: 'Sem Clubismo FC',
      channelUrl: 'https://www.youtube.com/@Semclubismofc',
      subscriber: true,
    },
    {
      youtubeId: 'nLNokfEqDlM',
      title: 'Santiago Sosa seria um reforço absurdo: veja como joga o argentino',
      channel: 'FB TV - Futebol sem clichê',
      channelUrl: 'https://www.youtube.com/@FelipeBarrosTV',
      subscriber: true,
    },
    {
      youtubeId: 'B7P-PcpGZ3Y',
      title: 'Por isso o Vasco quer contratar Santiago Sosa',
      channel: 'the football comps br',
      channelUrl: 'https://www.youtube.com/@thefootballcompsbr',
    },
    {
      youtubeId: 'f_sQuQMraVc',
      title: 'Santiago Sosa — Goals, Passes and Defensive Skills',
      channel: 'Osório Football - OzzyFutComps',
      channelUrl: 'https://www.youtube.com',
    },
    {
      youtubeId: '8_PX2Lfp4j8',
      title: 'Santiago Sosa — All Actions and Skills | Racing 2026',
      channel: 'FB Highlights',
      channelUrl: 'https://www.youtube.com',
    },
    {
      youtubeId: 'geU92BE2FCc',
      title: 'Melhores jogadas do volante argentino',
      channel: 'Compilados Flamengo',
      channelUrl: 'https://www.youtube.com',
    },
    {
      youtubeId: 'SUpT4DVL-os',
      title: 'Santiago Sosa — Defensive Skills, Goals & Assists 2026',
      channel: 'Renzo Cp',
      channelUrl: 'https://www.youtube.com',
    },
  ],
};

/** vídeos do jogador, canais assinantes primeiro */
export function getSponsorVideos(playerId: string): SponsorVideo[] {
  const list = PLAYER_VIDEOS[playerId] ?? [];
  return [...list].sort(
    (a, b) => Number(b.subscriber ?? false) - Number(a.subscriber ?? false),
  );
}
