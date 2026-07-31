import {useEffect, useState} from 'react';
import {Link, useFetcher} from 'react-router';
import {Crest} from '~/components/ui';
import type {
  MatchBriefing,
  RoundFixture,
  RoundFixtures as Rodada,
} from '~/lib/tm';

/** ‹ Rodada N › — navegação entre as rodadas da temporada */
export function RoundNav({
  rodada,
  href,
}: {
  rodada: Rodada;
  href: (n: number) => string;
}) {
  const {round, totalRounds, currentRound} = rodada;
  const max = totalRounds || round;
  const seta =
    'flex h-9 w-9 items-center justify-center rounded-[11px] border border-line bg-card text-muted';

  const Passo = ({para, label, d}: {para: number; label: string; d: string}) =>
    para >= 1 && para <= max ? (
      <Link
        to={href(para)}
        preventScrollReset
        aria-label={label}
        className={`${seta} hover:bg-hoverrow`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d={d}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
    ) : (
      <span className={`${seta} text-faint opacity-40`} aria-hidden>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <path
            d={d}
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );

  return (
    <div className="flex items-center gap-1.5">
      {round !== currentRound && currentRound >= 1 && currentRound <= max ? (
        <Link
          to={href(currentRound)}
          preventScrollReset
          className="mr-1 text-[12px] font-semibold text-muted hover:text-pitch"
        >
          Rodada atual
        </Link>
      ) : null}
      <Passo para={round - 1} label="Rodada anterior" d="M15 18l-6-6 6-6" />
      <span className="min-w-[74px] text-center text-[13px] font-semibold text-muted tabular-nums">
        {round}
        {totalRounds ? ` de ${totalRounds}` : ''}
      </span>
      <Passo para={round + 1} label="Próxima rodada" d="M9 18l6-6-6-6" />
    </div>
  );
}

/**
 * Jogos da rodada corrente, cada um abrindo a preparação do confronto.
 *
 * A preparação é carregada sob demanda (3 requisições ao Transfermarkt por
 * jogo) — a rodada inteira de uma vez estouraria o limite de subrequests do
 * worker. Um `fetcher` só, compartilhado: só há um jogo aberto por vez.
 */
export function RoundFixtures({
  round,
  fixtures,
}: {
  round: number;
  fixtures: RoundFixture[];
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  const fetcher = useFetcher<MatchBriefing & {erro?: string}>();

  const jogo = fixtures.find((f) => f.reportId === aberto);
  useEffect(() => {
    if (jogo) {
      void fetcher.load(
        `/api/jogo?id=${jogo.reportId}&casa=${jogo.home.id}&fora=${jogo.away.id}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  // não devolver `null`: a navegação de rodada fica no cabeçalho da seção e
  // some junto, prendendo quem chegou numa rodada sem jogos publicados
  if (!fixtures.length) {
    return (
      <div className="rounded-card border border-line bg-card p-6 text-center text-sm text-muted">
        Nenhum jogo publicado para a rodada {round}.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-line bg-card">
      {fixtures.map((f) => {
        const open = aberto === f.reportId;
        return (
          <div
            key={f.reportId}
            className="border-b border-innerline last:border-b-0"
          >
            <button
              type="button"
              onClick={() => setAberto(open ? null : f.reportId)}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-3 py-3 text-left hover:bg-hoverrow sm:px-4"
            >
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
                <span className="truncate text-sm font-bold">
                  {f.home.name}
                </span>
                <Crest src={f.home.crest} name={f.home.name} size={22} />
              </span>

              <span className="w-[68px] shrink-0 text-center">
                <span
                  className={`block text-sm font-extrabold tabular-nums ${
                    f.finished ? 'text-ink' : 'text-pitch'
                  }`}
                >
                  {f.finished ? f.score : f.time || '—'}
                </span>
                <span className="block text-[10px] text-faint">{f.date}</span>
              </span>

              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Crest src={f.away.crest} name={f.away.name} size={22} />
                <span className="truncate text-sm font-bold">
                  {f.away.name}
                </span>
              </span>

              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                className={`shrink-0 text-faint transition-transform ${
                  open ? 'rotate-180' : ''
                }`}
              >
                <path
                  d="M6 9l6 6 6-6"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            {open ? (
              <div className="border-t border-innerline bg-soft px-3 py-4 sm:px-4">
                {fetcher.state !== 'idle' ? (
                  <p className="text-[13px] text-muted">
                    Carregando preparação do jogo…
                  </p>
                ) : fetcher.data && !fetcher.data.erro ? (
                  <Briefing fixture={f} data={fetcher.data} />
                ) : (
                  <p className="text-[13px] text-muted">
                    Não foi possível carregar a preparação deste jogo agora.
                  </p>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
      <p className="border-t border-innerline px-4 py-2.5 text-[11px] text-faint">
        Rodada {round} · dados do Transfermarkt. A escalação oficial só é
        publicada perto do apito — até lá valem as dúvidas e os desfalques.
      </p>
    </div>
  );
}

function Briefing({
  fixture,
  data,
}: {
  fixture: RoundFixture;
  data: MatchBriefing;
}) {
  const nada =
    (['home', 'away'] as const).every(
      (l) =>
        !data[l].suspended.length &&
        !data[l].injured.length &&
        !data[l].risk.length,
    ) && !data.preview.doubts.length;

  return (
    <div>
      {data.preview.stadium || data.preview.referee ? (
        <p className="mb-3 text-[12px] text-muted">
          {data.preview.stadium}
          {data.preview.stadium && data.preview.referee ? ' · ' : ''}
          {data.preview.referee ? `Árbitro: ${data.preview.referee}` : ''}
        </p>
      ) : null}

      {nada ? (
        <p className="text-[13px] text-muted">
          Nenhum desfalque ou dúvida publicado para este jogo.
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {(['home', 'away'] as const).map((lado) => {
            const club = fixture[lado];
            const {suspended, injured, risk} = data[lado];
            // quem já está confirmado fora não precisa reaparecer como dúvida
            const fora = new Set(
              [...suspended, ...injured].map((a) => a.playerId),
            );
            const doubts = (
              data.preview.doubts.find((d) => d.clubId === club.id)?.players ??
              []
            ).filter((p) => !fora.has(p.id));
            return (
              <div key={lado} className="min-w-0">
                <div className="mb-2 flex items-center gap-2">
                  <Crest src={club.crest} name={club.name} size={18} />
                  <span className="truncate text-[13px] font-extrabold">
                    {club.name}
                  </span>
                </div>

                <Bloco titulo="Suspensos" vazio="nenhum suspenso">
                  {suspended.map((p) => (
                    <Item
                      key={p.playerId}
                      id={p.playerId}
                      name={p.name}
                      nota={p.reason}
                    />
                  ))}
                </Bloco>

                <Bloco
                  titulo="Fora por lesão"
                  vazio="ninguém no departamento médico"
                >
                  {injured.map((p) => (
                    <Item
                      key={p.playerId}
                      id={p.playerId}
                      name={p.name}
                      nota={p.until ? `${p.reason} · até ${p.until}` : p.reason}
                    />
                  ))}
                </Bloco>

                <Bloco titulo="Em dúvida" vazio="ninguém em dúvida">
                  {doubts.map((p) => (
                    <Item key={p.id} id={p.id} name={p.name} nota={p.reason} />
                  ))}
                </Bloco>

                <Bloco titulo="Pendurados" vazio="ninguém pendurado">
                  {risk.map((p) => (
                    <Item
                      key={p.playerId}
                      id={p.playerId}
                      name={p.name}
                      nota={`${p.yellows} amarelos em ${p.games} jogos`}
                    />
                  ))}
                </Bloco>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Bloco({
  titulo,
  vazio,
  children,
}: {
  titulo: string;
  vazio: string;
  children: React.ReactNode;
}) {
  const itens = Array.isArray(children) ? children : [children];
  const cheio = itens.filter(Boolean).length > 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-[10px] font-bold tracking-[0.1em] text-faint uppercase">
        {titulo}
      </div>
      {cheio ? (
        <ul className="mt-1 space-y-0.5">{children}</ul>
      ) : (
        <p className="mt-1 text-[12px] text-faint">— {vazio}</p>
      )}
    </div>
  );
}

function Item({id, name, nota}: {id: string; name: string; nota: string}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-1.5 text-[12px]">
      <Link to={`/jogadores/${id}`} className="font-semibold hover:text-pitch">
        {name}
      </Link>
      {nota ? <span className="text-faint">{nota}</span> : null}
    </li>
  );
}
