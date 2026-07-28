/**
 * Callback do OAuth: valida a resposta, troca o código pelos tokens e grava
 * na sessão. Este caminho precisa estar cadastrado como redirect URI nas
 * configurações da Customer Account API no admin, senão o login falha.
 */
import type {Route} from './+types/account.authorize';

export async function loader({context}: Route.LoaderArgs) {
  return context.customerAccount.authorize();
}
