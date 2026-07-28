import {Form, Link, redirect} from 'react-router';
import type {Route} from './+types/pro';

export const meta: Route.MetaFunction = () => [
  {title: 'Players Place PRO — sem anúncios por R$ 5/mês'},
];

const COOKIE_ON = 'pp_pro=1; Path=/; Max-Age=2592000; SameSite=Lax';
const COOKIE_OFF = 'pp_pro=; Path=/; Max-Age=0; SameSite=Lax';

export async function loader({request}: Route.LoaderArgs) {
  const pro = /(?:^|;\s*)pp_pro=1(?:;|$)/.test(request.headers.get('Cookie') ?? '');
  return {pro};
}

export async function action({request}: Route.ActionArgs) {
  const form = await request.formData();
  const intent = form.get('intent');
  return redirect('/pro', {
    headers: {'Set-Cookie': intent === 'cancel' ? COOKIE_OFF : COOKIE_ON},
  });
}

const BENEFITS = [
  'Nenhum anúncio em toda a plataforma',
  'Consultas ilimitadas a ligas, clubes e jogadores',
  'Acesso antecipado a novas ligas e recursos',
  'Você apoia a evolução do Players Place',
];

export default function Pro({loaderData}: Route.ComponentProps) {
  const {pro} = loaderData;
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
          <Form method="post" className="mt-4">
            {pro ? (
              <button
                type="submit"
                name="intent"
                value="cancel"
                className="flex h-11 w-full items-center justify-center rounded-btn border border-white/25 text-sm font-bold text-white transition-colors hover:bg-white/10"
              >
                Cancelar assinatura
              </button>
            ) : (
              <button
                type="submit"
                name="intent"
                value="activate"
                className="flex h-11 w-full items-center justify-center rounded-btn bg-lime text-sm font-bold text-ink transition-colors hover:bg-limehover"
              >
                Assinar agora
              </button>
            )}
          </Form>
          {pro ? (
            <p className="mt-3 text-xs font-semibold text-lime">
              ✓ PRO ativo nesta sessão — anúncios ocultos.
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-8 rounded-card border border-dashed border-addash bg-card p-5 text-[13px] leading-relaxed text-muted">
        <strong className="text-ink">Como funciona no ambiente local:</strong>{' '}
        o botão acima simula a assinatura gravando um cookie no seu navegador
        (sem cobrança). Em produção, o pagamento de R$ 5/mês será processado
        pelo checkout da Shopify (produto de assinatura) e a venda de espaços
        publicitários para anunciantes também será gerenciada pela loja — o
        cookie passa a ser emitido após a confirmação do pagamento.
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
