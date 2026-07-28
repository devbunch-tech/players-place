/**
 * Estado PRO do visitante.
 *
 * Antes isto era o cookie `pp_pro=1`, que qualquer pessoa forjava no
 * DevTools. Agora a fonte de verdade é a assinatura na Shopify: o visitante
 * precisa estar logado (Customer Account API) e ter um subscription contract
 * ATIVO cuja linha bata com o SKU do plano PRO.
 *
 * Por que SKU e não id: a Customer Account API não expõe id de produto nem
 * de variante nas linhas do contrato — só `name`, `title`, `variantTitle` e
 * `sku`. O SKU é o mais estável dos quatro, então é ele que identifica o
 * plano. Precisa estar cadastrado na variante no admin.
 */
// O Hydrogen aumenta o RouterContextProvider do react-router com storefront,
// cart, customerAccount e env — é esse o tipo que chega nos loaders.
import type {RouterContextProvider} from 'react-router';

const PRO_SUBSCRIPTIONS_QUERY = `#graphql
  query ProSubscriptions {
    customer {
      subscriptionContracts(first: 20) {
        nodes {
          id
          status
          lines(first: 5) {
            nodes {
              sku
            }
          }
        }
      }
    }
  }
` as const;

interface ProSubscriptionsResult {
  customer?: {
    subscriptionContracts?: {
      nodes?: Array<{
        id?: string | null;
        status?: string | null;
        lines?: {
          nodes?: Array<{sku?: string | null} | null> | null;
        } | null;
      } | null> | null;
    } | null;
  } | null;
}

export interface ProState {
  /** o visitante está logado numa conta de cliente da loja */
  loggedIn: boolean;
  /** tem assinatura PRO ativa — é isto que esconde os anúncios */
  pro: boolean;
}

/**
 * Resolve o estado PRO. Roda no loader do root, ou seja, em toda página:
 * nunca pode lançar. Qualquer falha na Customer Account API degrada para
 * "não é PRO" (mostra anúncios) em vez de derrubar o site.
 */
export async function resolveProState(
  context: Readonly<RouterContextProvider>,
): Promise<ProState> {
  try {
    const loggedIn = await context.customerAccount.isLoggedIn();
    if (!loggedIn) return {loggedIn: false, pro: false};

    const sku = context.env.PP_PRO_SKU;
    // sem SKU configurado não há como reconhecer o plano; assumir que todo
    // cliente logado é PRO seria dar o produto de graça
    if (!sku) return {loggedIn: true, pro: false};

    // `query` chama handleAuthStatus() antes, que redireciona quem não está
    // logado — daí a checagem de isLoggedIn acima ser obrigatória
    const {data} = await context.customerAccount.query<ProSubscriptionsResult>(
      PRO_SUBSCRIPTIONS_QUERY,
    );

    const contracts = data?.customer?.subscriptionContracts?.nodes ?? [];
    const pro = contracts.some(
      (contract) =>
        contract?.status === 'ACTIVE' &&
        (contract.lines?.nodes ?? []).some((line) => line?.sku === sku),
    );

    return {loggedIn: true, pro};
  } catch {
    return {loggedIn: false, pro: false};
  }
}
