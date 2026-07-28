/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  /**
   * Identificadores dos produtos vendidos na loja Shopify.
   *
   * Ficam em variáveis de ambiente porque são específicos de cada loja: em
   * produção entram nas Environments and variables da storefront (admin) e
   * localmente no `.env`. São opcionais de propósito — sem elas o botão
   * correspondente aparece desabilitado, em vez de mandar o visitante para
   * um checkout quebrado.
   */
  interface Env {
    /** variante do plano PRO (R$ 5/mês) */
    PP_PRO_VARIANT_ID?: string;
    /** selling plan mensal do PRO — sem ele não há cobrança recorrente */
    PP_PRO_SELLING_PLAN_ID?: string;
    /**
     * SKU da variante do PRO. É por ele que reconhecemos a assinatura ativa:
     * a Customer Account API não expõe id de produto/variante nas linhas do
     * contrato, só `name`, `title`, `variantTitle` e `sku`.
     */
    PP_PRO_SKU?: string;

    /** variante do vídeo avulso (R$ 10, compra única) */
    PP_VIDEO_VARIANT_ID?: string;

    /** variante do plano de canal (R$ 100/mês) */
    PP_CANAL_VARIANT_ID?: string;
    /** selling plan mensal do canal */
    PP_CANAL_SELLING_PLAN_ID?: string;
    /** SKU da variante do canal — mesma razão do PP_PRO_SKU */
    PP_CANAL_SKU?: string;
  }
}
