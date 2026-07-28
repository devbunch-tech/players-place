/**
 * Logout. Só por POST — um GET aqui seria disparado por prefetch de link e
 * derrubaria a sessão do visitante sem que ele pedisse.
 */
import {redirect} from 'react-router';
import type {Route} from './+types/account.logout';

export async function loader() {
  return redirect('/');
}

export async function action({context}: Route.ActionArgs) {
  return context.customerAccount.logout();
}
