import {useEffect, useId, useRef, useState} from 'react';
import {useFetcher, useNavigate} from 'react-router';
import {Avatar, Crest} from '~/components/ui';

/**
 * Busca com sugestões ao vivo.
 *
 * A partir da 4ª letra consulta /api/busca e mostra os jogadores encontrados
 * (mais os clubes, quando houver). Enter ou "Ver mais resultados" levam para
 * a página /busca com a mesma consulta.
 *
 * Mobile-first: as linhas têm altura de toque confortável e o dropdown ocupa
 * toda a largura do campo. O `useFetcher` cuida das respostas fora de ordem —
 * digitar rápido chega a disparar várias consultas, e sem isso a resposta
 * antiga poderia sobrescrever a nova.
 */

const MIN_CHARS = 4;
const DEBOUNCE_MS = 250;

interface Suggestions {
  q: string;
  players: {id: string; name: string; photo: string | null; club: string; value: string}[];
  clubs: {id: string; name: string; crest: string | null; country: string}[];
  tooShort?: boolean;
  erro?: boolean;
}

export function SmartSearch({
  placeholder = 'Buscar jogadores, clubes, ligas…',
  size = 'lg',
  autoFocus = false,
  className = '',
}: {
  placeholder?: string;
  size?: 'lg' | 'md';
  autoFocus?: boolean;
  className?: string;
}) {
  const fetcher = useFetcher<Suggestions>();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  // dispara a consulta com atraso, para não bater na origem a cada tecla
  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_CHARS) return;
    const t = setTimeout(() => {
      fetcher.load(`/api/busca?q=${encodeURIComponent(term)}`);
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // fetcher muda de identidade a cada render; incluí-lo aqui re-dispararia
    // a busca em loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const data = fetcher.data;
  const term = q.trim();
  const short = term.length < MIN_CHARS;
  // só mostramos resultados da consulta atual: enquanto a resposta anterior
  // não foi substituída, ela não corresponde ao que está digitado
  const fresh = data && data.q === term ? data : null;
  const players = fresh?.players ?? [];
  const clubs = fresh?.clubs ?? [];
  const loading = fetcher.state !== 'idle';
  const showPanel = open && !short;

  const goToSearch = () => {
    if (!term) return;
    setOpen(false);
    navigate(`/busca?q=${encodeURIComponent(term)}`);
  };

  const options = [...players, ...clubs];

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!options.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + options.length) % options.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = active >= 0 ? options[active] : null;
      if (chosen) {
        setOpen(false);
        const isPlayer = active < players.length;
        navigate(`${isPlayer ? '/jogadores' : '/clubes'}/${chosen.id}`);
      } else {
        goToSearch();
      }
    }
  };

  const h = size === 'lg' ? 'h-12 text-[15px] px-5' : 'h-10 text-[14px] px-4';

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Buscar
      </label>
      <input
        id={`${listId}-input`}
        type="search"
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        className={`w-full rounded-full border border-line bg-card outline-none placeholder:text-faint focus:border-pitch ${h}`}
      />

      {showPanel ? (
        <div
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-card border border-line bg-card shadow-lg"
        >
          {players.length === 0 && clubs.length === 0 ? (
            <p className="px-4 py-3.5 text-[13px] text-muted">
              {loading
                ? 'Buscando…'
                : fresh?.erro
                  ? 'A busca falhou agora. Tente de novo em instantes.'
                  : `Nenhum resultado para “${term}”.`}
            </p>
          ) : (
            <>
              {players.map((p, i) => (
                <button
                  key={`p-${p.id}`}
                  type="button"
                  role="option"
                  aria-selected={active === i}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/jogadores/${p.id}`);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-innerline px-3 py-2.5 text-left last:border-b-0 ${
                    active === i ? 'bg-hoverrow' : ''
                  }`}
                >
                  <Avatar src={p.photo} name={p.name} size={34} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{p.name}</span>
                    <span className="block truncate text-xs text-faint">{p.club}</span>
                  </span>
                  {p.value ? (
                    <span className="shrink-0 text-xs font-extrabold tabular-nums">
                      {p.value}
                    </span>
                  ) : null}
                </button>
              ))}

              {clubs.map((c, i) => (
                <button
                  key={`c-${c.id}`}
                  type="button"
                  role="option"
                  aria-selected={active === players.length + i}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/clubes/${c.id}`);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-innerline px-3 py-2.5 text-left last:border-b-0 ${
                    active === players.length + i ? 'bg-hoverrow' : ''
                  }`}
                >
                  <Crest src={c.crest} name={c.name} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{c.name}</span>
                    <span className="block truncate text-xs text-faint">{c.country}</span>
                  </span>
                </button>
              ))}
            </>
          )}

          <button
            type="button"
            onClick={goToSearch}
            className="flex w-full items-center justify-center border-t border-innerline bg-soft px-4 py-3 text-[13px] font-bold text-pitch"
          >
            Ver mais resultados
          </button>
        </div>
      ) : null}
    </div>
  );
}
