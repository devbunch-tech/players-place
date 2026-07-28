/**
 * Inicia o fluxo OAuth da Customer Account API. Redireciona para a página de
 * login hospedada pela Shopify; o retorno cai em /account/authorize.
 */
import type {Route} from './+types/account.login';

export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.login({
    uiLocales: 'PT_BR',
  });
}
