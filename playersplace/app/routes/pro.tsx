import {Form, Link} from 'react-router';
import type {Route} from './+types/pro';
import {resolveProState} from '~/lib/pro';
import {productConfig} from '~/lib/commerce';

export const meta: Route.MetaFunction = () => [
  {title: 'Players Place PRO — sem anúncios por R$ 5/mês'},
];

export async function loader({request, context}: Route.LoaderArgs) {
  const {pro, loggedIn} = await resolveProState(context);
  const {available} = productConfig(context.env, 'pro');
  const erro = new URL(request.url).searchParams.get('erro');
  return {pro, loggedIn, available, erro};
}

const BENEFITS = [
  'Nenhum anúncio em toda a plataforma',
  'Consultas ilimitadas a ligas, clubes e jogadores',
  'Acesso antecipado a novas ligas e recursos',
  'Você apoia a evolução do Players Place',
];

export default function Pro({loaderData}: Route.ComponentProps) {
  const {pro, loggedIn, available, erro} = loaderData;
  return (
    <div className="mx-auto max-w-3xl pp-in">
      <span className="inline-block rounded-md bg-lime px-2.5 py-1 text-[11px] font-extrabold tracking-widest text-ink">
        PRO
      </span>
      <h1 className="mt-4 font-display text-[32px] leading-tight font-extrabold tracking-tight sm:text-[40px]">
        Consulte o mercado <span className="rounded-md bg-lime px-1.5">sem anúncios</span>.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
        O Players Place é gratuito com publicidade. Com o plano PRO, você
        navega por todas as ligas, elencos e valores de mercado sem nenhum
        anúncio.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-[1fr_300px]">
        <ul className="space-y-3 rounded-card border border-line bg-card p-5">
          {BENEFITS.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm font-semibold">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-lime">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M5 13l5 5L20 6" stroke="#131711" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {b}
            </li>
          ))}
        </ul>

        <div className="rounded-card bg-pitch p-5 text-white">
          <div className="text-[10px] font-bold tracking-[0.14em] text-white/60 uppercase">
            Plano mensal
          </div>
          <div className="mt-1 font-display text-[40px] leading-none font-extrabold tracking-tight">
            R$ 5
            <span className="text-base font-bold text-white/60">/mês</span>
          </div>
          <p className="mt-2 text-xs text-white/60">
            Cancele quando quiser.
          </p>
          {pro ? (
            <p className="mt-4 rounded-btn border border-lime/40 bg-lime/10 p-3 text-xs font-semibold text-lime">
              ✓ Assinatura ativa — anúncios ocultos em toda a plataforma.
            </p>
          ) : (
            <Form method="post" action="/comprar" className="mt-4">
              <input type="hidden" name="produto" value="pro" />
              <button
                type="submit"
                disabled={!available}
                className="flex h-11 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Assinar agora
              </button>
            </Form>
          )}

          {!pro && !available ? (
            <p className="mt-3 text-xs text-white/60">
              Assinatura ainda não disponível. Estamos finalizando a
              configuração do pagamento.
            </p>
          ) : null}

          {erro === 'carrinho' ? (
            <p className="mt-3 text-xs font-semibold text-white">
              Não foi possível abrir o checkout agora. Tente de novo em
              instantes.
            </p>
          ) : null}

          {pro ? (
            <Form method="post" action="/account/logout" className="mt-3">
              <button
                type="submit"
                className="text-xs font-semibold text-white/60 underline-offset-2 hover:underline"
              >
                Sair da conta
              </button>
            </Form>
          ) : loggedIn ? null : (
            <p className="mt-3 text-xs text-white/60">
              Já assina?{' '}
              <Link
                to="/account/login"
                className="font-semibold text-lime underline-offset-2 hover:underline"
              >
                Entrar na sua conta
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="mt-8 rounded-card border border-dashed border-addash bg-card p-5 text-[13px] leading-relaxed text-muted">
        <strong className="text-ink">Como funciona:</strong> o pagamento de
        R$ 5/mês é processado pelo checkout da Shopify. Para assinar é preciso
        entrar com uma conta de cliente da loja — é ela que guarda a
        assinatura e libera a navegação sem anúncios em qualquer dispositivo
        onde você entrar. O cancelamento é feito pelo portal da conta.
      </div>

      <div className="mt-6 rounded-card border border-line bg-card p-5">
        <h2 className="font-display text-base font-extrabold tracking-tight">
          Para anunciantes
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
          Quer colocar sua marca nos espaços de publicidade do Players Place?
          Fale com a gente:{' '}
          <a
            href="mailto:anuncie@playersplace.com.br"
            className="font-semibold text-pitch underline-offset-2 hover:underline"
          >
            anuncie@playersplace.com.br
          </a>
        </p>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">
          Tem um canal de YouTube? Publique suas análises na página dos
          jogadores —{' '}
          <Link
            to="/canais"
            className="font-semibold text-pitch underline-offset-2 hover:underline"
          >
            conheça os planos para canais
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
