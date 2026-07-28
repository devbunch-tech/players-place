import {useState} from 'react';
import {Link, useRouteLoaderData} from 'react-router';
import type {SponsorVideo} from '~/lib/sponsors';
import {SectionTitle} from '~/components/ui';

const VISIBLE_DEFAULT = 5;

function SubscriberBadge() {
  return (
    <span className="rounded bg-lime px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest text-ink uppercase">
      Assinante
    </span>
  );
}

/**
 * Análises em vídeo do jogador — espaço vendido a canais de YouTube
 * (R$ 10/vídeo ou R$ 100/mês ilimitado, ver /canais).
 * Exibe até 5 vídeos por padrão, canais assinantes primeiro; havendo
 * mais, o botão "Ver mais análises" revela o restante. Sem vídeos, o
 * convite "seu canal aqui" aparece apenas para quem não é PRO.
 */
export function VideoAnalysis({videos}: {videos: SponsorVideo[]}) {
  const root = useRouteLoaderData('root') as {pro?: boolean} | undefined;
  const [selected, setSelected] = useState(0);
  const [showAll, setShowAll] = useState(false);

  if (videos.length === 0) {
    if (root?.pro) return null;
    return (
      <section>
        <SectionTitle>Análises em vídeo</SectionTitle>
        <div className="rounded-card border border-dashed border-addash bg-card p-5">
          <div className="text-[8.5px] font-bold tracking-[0.18em] text-faint uppercase">
            Espaço patrocinado
          </div>
          <div className="mt-3 flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-btn bg-soft text-xl">
              ▶️
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold">Seu canal de YouTube aqui</div>
              <div className="mt-0.5 text-[13px] leading-relaxed text-muted">
                Publique sua análise em vídeo deste jogador e alcance quem
                pesquisa por ele.{' '}
                <Link
                  to="/canais"
                  className="font-semibold text-pitch underline-offset-2 hover:underline"
                >
                  Conheça os planos para canais
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const current = videos[Math.min(selected, videos.length - 1)];
  const visible = showAll ? videos : videos.slice(0, VISIBLE_DEFAULT);
  const hidden = videos.length - VISIBLE_DEFAULT;

  return (
    <section>
      <SectionTitle
        action={
          <span className="text-[8.5px] font-bold tracking-[0.18em] text-faint uppercase">
            Espaço patrocinado
          </span>
        }
      >
        Análises em vídeo
      </SectionTitle>
      <div className="overflow-hidden rounded-card border border-line bg-card">
        <div className="aspect-video w-full bg-ink">
          <iframe
            key={current.youtubeId}
            src={`https://www.youtube-nocookie.com/embed/${current.youtubeId}`}
            title={current.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-innerline px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold">{current.title}</span>
              {current.subscriber ? <SubscriberBadge /> : null}
            </div>
            <a
              href={current.channelUrl}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-semibold text-pitch underline-offset-2 hover:underline"
            >
              ▶ {current.channel} · ver canal no YouTube
            </a>
          </div>
          <Link
            to="/canais"
            className="text-xs font-semibold text-faint hover:text-pitch"
          >
            Quer seu canal aqui?
          </Link>
        </div>

        {videos.length > 1 ? (
          <div>
            {visible.map((v, i) => (
              <button
                key={v.youtubeId}
                type="button"
                onClick={() => setSelected(i)}
                className={`flex w-full items-center gap-3 border-b border-innerline px-4 py-2.5 text-left last:border-b-0 ${
                  i === selected ? 'bg-soft' : 'hover:bg-hoverrow'
                }`}
              >
                <span className="relative h-10 w-[71px] shrink-0 overflow-hidden rounded-md bg-avatarbg">
                  <img
                    src={`https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  {i === selected ? (
                    <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-[10px] font-bold text-white">
                      ▶
                    </span>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold">
                    {v.title}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-faint">
                    {v.channel}
                    {v.subscriber ? <SubscriberBadge /> : null}
                  </span>
                </span>
              </button>
            ))}
            {!showAll && hidden > 0 ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px] font-bold text-pitch hover:bg-hoverrow"
              >
                Ver mais análises ({hidden})
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
