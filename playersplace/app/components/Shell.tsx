import {useEffect, useState} from 'react';
import {Form, Link, NavLink, useLocation} from 'react-router';

const NAV = [
  {to: '/', label: 'Início'},
  // Game Fantasy fora do menu por ora — a rota /fantasy continua no ar, é só
  // devolver esta linha para o item voltar ao cabeçalho e ao menu mobile.
  // {to: '/fantasy', label: 'Game Fantasy'},
  {to: '/transferencias', label: 'Transferências'},
  {to: '/valores', label: 'Valores'},
  {to: '/competicoes', label: 'Competições'},
  {to: '/comparar', label: 'Comparar'},
  {to: '/busca', label: 'Busca'},
];

/**
 * Lockup PlayersPlace (oficial-logo/svg/playersplace-lockup-*.svg).
 *
 * `tone` segue a regra do pacote — "lima nunca como texto sobre fundo claro":
 * em fundo claro vale o positivo (tinta + verde), em fundo escuro o negativo
 * (creme + lima), que é o lockup do anexo.
 */
export function Logo({
  tone = 'positivo',
  className = '',
}: {
  tone?: 'positivo' | 'negativo';
  className?: string;
}) {
  const negativo = tone === 'negativo';
  return (
    <Link
      to="/"
      aria-label="PlayersPlace — Início"
      className={`flex shrink-0 items-center gap-2 ${
        negativo ? 'text-brandcream' : 'text-brandink'
      } ${className}`}
    >
      <svg
        viewBox="0 0 64 64"
        className="h-[26px] w-[26px] shrink-0"
        fill="none"
        aria-hidden
      >
        <path
          d="M8 50 L24 34 L32 42 L48 22"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx="52.5"
          cy="16"
          r="6.5"
          className={negativo ? 'fill-brandlime' : 'fill-brandgreen'}
        />
      </svg>
      <span className="font-brand text-[19px] leading-none font-bold tracking-[-0.03em]">
        Players
        <span className={negativo ? 'text-brandlime' : 'text-brandgreen'}>
          Place
        </span>
      </span>
    </Link>
  );
}

function SearchInput({className = ''}: {className?: string}) {
  return (
    <Form method="get" action="/busca" className={className}>
      <input
        type="search"
        name="q"
        placeholder="Buscar jogadores, clubes…"
        className="h-9 w-full rounded-full border border-line bg-card px-4 text-[13px] outline-none placeholder:text-faint focus:border-pitch"
      />
    </Form>
  );
}

export function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  // fecha o menu mobile ao navegar
  useEffect(() => setOpen(false), [location.pathname, location.search]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-[62px] max-w-[1140px] items-center gap-4 px-4 sm:px-6">
          <Logo />
          <nav className="ml-2 hidden items-center gap-1 md:flex">
            {NAV.slice(0, 5).map((item, i) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                // o 5º item só cabe a partir de lg; abaixo disso fica no menu
                className={({isActive}) =>
                  `${i < 4 ? 'flex' : 'hidden lg:flex'} h-9 items-center rounded-full px-4 text-[13px] font-semibold transition-colors ${
                    isActive ? 'bg-ink text-white' : 'text-muted hover:bg-chipbg'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <SearchInput className="hidden w-[230px] lg:block" />
            <Link
              to="/pro"
              className="hidden h-9 items-center rounded-btn bg-lime px-4 text-[13px] font-bold text-ink transition-colors hover:bg-limehover sm:flex"
            >
              Assinar PRO
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Abrir menu"
              className="flex h-11 w-11 items-center justify-center rounded-btn md:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M4 7h16M4 12h16M4 17h16"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-paper pp-in md:hidden">
          <div className="flex h-[62px] items-center justify-between px-4">
            <Logo />
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar menu"
              className="flex h-11 w-11 items-center justify-center rounded-btn"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pt-4">
            {NAV.map((item, i) => {
              const active =
                item.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`mb-2 flex items-center gap-4 rounded-card px-4 py-3.5 ${
                    active ? 'bg-menuactive' : ''
                  }`}
                >
                  <span className="text-xs font-bold text-faint tabular-nums">
                    0{i + 1}
                  </span>
                  <span className="font-display text-[26px] font-extrabold tracking-tight">
                    {item.label}
                  </span>
                  {active ? <span className="ml-auto h-2 w-2 rounded-full bg-lime" /> : null}
                </Link>
              );
            })}
          </nav>
          <div className="p-4">
            <div className="rounded-card bg-pitch p-4 text-white">
              <span className="rounded-md bg-lime px-2 py-0.5 text-[10px] font-extrabold tracking-widest text-ink">
                PRO
              </span>
              <p className="mt-2 text-sm text-white/80">
                Sem anúncios por R$ 5/mês.
              </p>
              <Link
                to="/pro"
                className="mt-3 flex h-10 items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink"
              >
                Assinar PRO
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function Footer() {
  return (
    <footer className="mt-14 border-t border-line bg-card">
      <div className="mx-auto max-w-[1140px] px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xs">
            <Logo />
            <p className="mt-3 text-[13px] leading-relaxed text-muted">
              Valores de mercado, elencos e transferências das principais ligas
              do mundo, em português.
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-[13px] font-semibold text-muted">
            <Link to="/competicoes" className="hover:text-pitch">Competições</Link>
            <Link to="/valores" className="hover:text-pitch">Valores de mercado</Link>
            <Link to="/transferencias" className="hover:text-pitch">Transferências</Link>
            <Link to="/comparar" className="hover:text-pitch">Comparar jogadores</Link>
            <Link to="/busca" className="hover:text-pitch">Busca</Link>
            <Link to="/pro" className="hover:text-pitch">Assinatura PRO</Link>
            <Link to="/canais" className="hover:text-pitch">Para YouTubers</Link>
            <a href="mailto:anuncie@playersplace.com.br" className="hover:text-pitch">
              Anuncie
            </a>
          </nav>
        </div>
        {/* no mobile empilha (crédito abaixo do copyright); no desktop, lado a lado */}
        <div className="mt-8 flex flex-col items-center gap-4 border-t border-innerline pt-5 sm:flex-row sm:justify-between">
          <p className="text-xs text-faint">
            PlayersPlace: Todos os direitos reservados.
          </p>
          <a
            href="https://agbunch.com"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 opacity-80 transition-opacity hover:opacity-100"
          >
            <span className="text-xs text-faint">Developed by</span>
            <img
              src="https://agbunch.com/assets/img/logo/logoBunchAG.png"
              alt="Bunch"
              loading="lazy"
              width={65}
              height={24}
              className="h-6 w-auto"
            />
          </a>
        </div>
      </div>
    </footer>
  );
}
