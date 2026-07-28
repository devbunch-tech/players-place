/**
 * Ponte para o checkout da Shopify.
 *
 * Recebe por POST qual produto o visitante quer, monta um carrinho novo com
 * a variante correspondente e redireciona para o `checkoutUrl`. Carrinho
 * novo a cada compra de propósito: aqui não existe navegação de loja, então
 * reaproveitar o carrinho da sessão só acumularia linhas esquecidas.
 */
import {redirect} from 'react-router';
import type {Route} from './+types/comprar';
import {productConfig, type ProductKey} from '~/lib/commerce';

const KEYS: ProductKey[] = ['pro', 'video', 'canal'];

/** de onde o botão foi clicado, para onde volta em caso de erro */
const ORIGIN: Record<ProductKey, string> = {
  pro: '/pro',
  video: '/canais',
  canal: '/canais',
};

export async function loader() {
  // nada a exibir: esta rota só existe para o POST
  return redirect('/pro');
}

export async function action({request, context}: Route.ActionArgs) {
  const form = await request.formData();
  const raw = String(form.get('produto') ?? '');
  const key = KEYS.find((k) => k === raw);

  if (!key) return redirect('/pro');

  const back = ORIGIN[key];
  const config = productConfig(context.env, key);

  if (!config.available || !config.variantId) {
    return redirect(`${back}?erro=indisponivel`);
  }

  // Assinatura precisa de cliente identificado — é dele que o contrato passa
  // a ser. Sem login, o contrato nasceria solto e o /pro nunca reconheceria
  // a assinatura depois.
  if (config.sellingPlanId) {
    const loggedIn = await context.customerAccount.isLoggedIn();
    if (!loggedIn) return context.customerAccount.login();
  }

  try {
    const result = await context.cart.create({
      lines: [
        {
          merchandiseId: config.variantId,
          quantity: 1,
          ...(config.sellingPlanId
            ? {sellingPlanId: config.sellingPlanId}
            : {}),
        },
      ],
    });

    const checkoutUrl = result?.cart?.checkoutUrl;
    if (!checkoutUrl) return redirect(`${back}?erro=carrinho`);

    return redirect(checkoutUrl);
  } catch {
    return redirect(`${back}?erro=carrinho`);
  }
}
