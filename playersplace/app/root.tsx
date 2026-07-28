import {useNonce} from '@shopify/hydrogen';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Link,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
} from 'react-router';
import type {Route} from './+types/root';
import favicon from '~/assets/favicon.svg';
import tailwindStyles from '~/styles/tailwind.css?url';
import {Header, Footer} from '~/components/Shell';
import {resolveProState} from '~/lib/pro';

export type RootLoader = typeof loader;

export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalida quando há mutação (ex.: ativar/cancelar PRO)
  if (formMethod && formMethod !== 'GET') return true;
  if (currentUrl.toString() === nextUrl.toString()) return true;
  return false;
};

export function links() {
  return [
    {rel: 'preconnect', href: 'https://fonts.googleapis.com'},
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossOrigin: 'anonymous' as const,
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Archivo:wght@400..800&family=Bricolage+Grotesque:wght@500..800&family=Space+Grotesk:wght@700&display=swap',
    },
    {rel: 'icon', type: 'image/svg+xml', href: favicon},
    // PNG para quem não renderiza favicon SVG (Safari antigo) e para iOS
    {rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icone-app-512.png'},
    {rel: 'apple-touch-icon', href: '/apple-touch-icon.png'},
  ];
}

export async function loader({context}: Route.LoaderArgs) {
  // O AdSlot e a página /pro leem daqui. A fonte de verdade é a assinatura
  // na Shopify, não mais um cookie — ver app/lib/pro.ts.
  return resolveProState(context);
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();

  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={tailwindStyles}></link>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-[1140px] flex-1 px-4 pt-6 sm:px-6">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let message = 'Algo deu errado ao carregar esta página.';
  let status = 500;

  if (isRouteErrorResponse(error)) {
    status = error.status;
    if (typeof error.data === 'string' && error.data) message = error.data;
    else if (status === 404) message = 'Página não encontrada.';
  } else if (error instanceof Error && error.message) {
    message = error.message;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-[1140px] flex-1 flex-col items-center justify-center px-4 py-20 text-center">
        <div className="font-display text-6xl font-extrabold tracking-tight text-pitch">
          {status}
        </div>
        <p className="mt-3 max-w-md text-sm text-muted">{message}</p>
        <p className="mt-1 max-w-md text-xs text-faint">
          Os dados vêm do Transfermarkt em tempo real — se a origem estiver
          lenta ou indisponível, tente de novo em instantes.
        </p>
        <Link
          to="/"
          className="mt-6 flex h-10 items-center rounded-btn bg-ink px-5 text-sm font-bold text-white"
        >
          Voltar ao início
        </Link>
      </main>
      <Footer />
    </div>
  );
}
