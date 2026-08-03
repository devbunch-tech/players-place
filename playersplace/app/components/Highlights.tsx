import {SectionTitle} from '~/components/ui';
import {highlightsSearchUrl, type HighlightVideo} from '~/lib/youtube';

/**
 * Vídeo de highlights do atleta.
 *
 * Fica separado do bloco de vídeo-análises patrocinadas (`VideoAnalysis`) de
 * propósito: aquilo é espaço vendido a canais, isto é conteúdo escolhido por
 * busca automática. Misturar os dois confundiria o que é publicidade.
 *
 * Sem o vídeo — falta de chave da API, cota estourada ou busca sem resultado —
 * mostra o botão que leva à busca no YouTube, no mesmo espírito dos botões de
 * compra quando falta a variável de ambiente: nunca um recurso quebrado.
 */
export function Highlights({
  video,
  playerName,
}: {
  video: HighlightVideo | null;
  playerName: string;
}) {
  return (
    <section>
      <SectionTitle>Highlights</SectionTitle>

      {video ? (
        <div className="overflow-hidden rounded-card border border-line bg-card">
          <div className="aspect-video w-full bg-ink">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${video.youtubeId}`}
              title={video.title}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              // sem referrerPolicy="no-referrer": o player do YouTube exige o
              // referer e devolve "Erro 153" sem ele
            />
          </div>
          <div className="px-4 py-3">
            <p className="text-sm font-bold">{video.title}</p>
            <p className="mt-0.5 text-[12.5px] text-muted">
              {video.channel ? `${video.channel} · ` : ''}
              Encontrado automaticamente no YouTube
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-card px-4 py-4">
          <p className="text-[13px] text-muted">
            Ainda não temos um vídeo de highlights selecionado para{' '}
            <strong className="font-semibold text-ink">{playerName}</strong>.
          </p>
          <a
            href={highlightsSearchUrl(playerName)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 shrink-0 items-center rounded-full bg-ink px-4 text-[13px] font-bold text-white"
          >
            Buscar no YouTube
          </a>
        </div>
      )}
    </section>
  );
}
