/**
 * Busca do vídeo de highlights de um jogador na YouTube Data API v3.
 *
 * Roda no servidor (loader), nunca no navegador: a chave da API não pode ir
 * para o cliente. O resultado passa pelo mesmo cache do Transfermarkt porque
 * a cota gratuita é o recurso escasso aqui — 10.000 unidades/dia e cada busca
 * custa 100, ou seja, ~100 buscas por dia. Sem cache, um punhado de visitantes
 * navegando por jogadores queima a cota antes do almoço.
 */
import {cached} from '~/lib/tm/client';

export interface HighlightVideo {
  youtubeId: string;
  title: string;
  channel: string;
  publishedAt: string;
}

/** TTL longo: highlights de um atleta não mudam de hora em hora, e a cota manda. */
const TTL = 7 * 24 * 3600;

/**
 * Vídeos fixados à mão, quando a busca automática erra.
 *
 * Existe porque a busca do YouTube não distingue homônimos: pesquisando
 * "Rodrigo highlights" ela devolve vídeos do **Rodrygo**, e acrescentar o
 * clube não resolve quando os dois jogam no mesmo time. Medido em 03/08/2026.
 *
 * Chave = id do jogador no Transfermarkt; valor = id do vídeo no YouTube.
 */
const FIXADOS: Record<string, string> = {};

/**
 * A API devolve o título com entidades HTML escapadas ("D&#39;Or", "Goals
 * &amp; Skills"). O React renderiza texto literalmente, então sem desescapar
 * o visitante lê o "&#39;" na tela.
 */
function desescapar(texto: string): string {
  const mapa: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  return texto
    .replace(/&(amp|lt|gt|quot|#39|apos);/g, (m) => mapa[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** URL de busca no YouTube — é para onde caímos sem chave configurada. */
export function highlightsSearchUrl(playerName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(
    `${playerName} highlights`,
  )}`;
}

interface YouTubeSearchResponse {
  items?: Array<{
    id?: {videoId?: string};
    snippet?: {
      title?: string;
      channelTitle?: string;
      publishedAt?: string;
    };
  }>;
}

/**
 * Melhor vídeo de highlights do jogador, ou null.
 *
 * Devolve null — em vez de estourar — quando não há chave, quando a cota
 * acabou ou quando a busca não achou nada. Quem chama decide o que exibir; a
 * página do jogador cai no botão de busca, nunca num bloco quebrado.
 *
 * Ressalva: a busca do YouTube não garante que o vídeo é do atleta certo
 * (homônimos são comuns no futebol) nem que a qualidade presta. É o melhor
 * palpite automatizado, não uma curadoria.
 */
export async function getPlayerHighlight(
  playerId: string,
  playerName: string,
  apiKey: string | undefined,
  clubName?: string | null,
): Promise<HighlightVideo | null> {
  const fixado = FIXADOS[playerId];
  if (fixado) {
    return {
      youtubeId: fixado,
      title: `Highlights de ${playerName}`,
      channel: '',
      publishedAt: '',
    };
  }
  if (!apiKey || !playerName.trim()) return null;

  // O clube entra na busca porque reduz o risco pior — mostrar OUTRO jogador.
  // Medido: sem ele, "Jefté highlights" trazia vídeo do Rangers, o ex-clube;
  // com ele, veio o Palmeiras atual. Não resolve homônimo do mesmo time.
  const termo = [playerName, clubName, 'highlights'].filter(Boolean).join(' ');

  const resultado = await cached<HighlightVideo | null | undefined>(
    `yt:highlight:${playerId}:${clubName ?? ''}`,
    TTL,
    async () => {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('key', apiKey);
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('q', termo);
      url.searchParams.set('type', 'video');
      // sem isto o resultado pode ser um vídeo que se recusa a tocar fora do
      // YouTube, e o embed apareceria preto na página
      url.searchParams.set('videoEmbeddable', 'true');
      url.searchParams.set('maxResults', '1');
      url.searchParams.set('order', 'relevance');
      url.searchParams.set('safeSearch', 'strict');
      url.searchParams.set('relevanceLanguage', 'pt');

      try {
        const res = await fetch(url, {signal: AbortSignal.timeout(8000)});
        // `undefined` = não guarde. Falha da API (403 de cota, 5xx, chave ainda
        // não propagada) é transitória: gravar isso congelaria a página no botão
        // de busca por 7 dias, muito depois de o problema ter passado.
        if (!res.ok) return undefined;

        const data = (await res.json()) as YouTubeSearchResponse;
        const item = data.items?.[0];
        const youtubeId = item?.id?.videoId;
        // aqui é `null`: a busca funcionou e realmente não achou vídeo para este
        // jogador — vale guardar, senão gastaríamos cota repetindo em vão
        if (!youtubeId) return null;

        return {
          youtubeId,
          title: desescapar(item?.snippet?.title ?? 'Highlights'),
          channel: desescapar(item?.snippet?.channelTitle ?? ''),
          publishedAt: item?.snippet?.publishedAt ?? '',
        };
      } catch {
        // rede fora, timeout ou JSON inesperado: também transitório, não guarda
        return undefined;
      }
    },
  );

  // para quem chama, "não achei" e "não deu para buscar" são a mesma tela
  return resultado ?? null;
}
