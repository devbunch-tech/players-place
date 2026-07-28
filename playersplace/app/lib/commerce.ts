/**
 * Catálogo dos produtos vendidos pela loja Shopify.
 *
 * São três:
 *   pro    — Players Place PRO, R$ 5/mês (assinatura)
 *   video  — vídeo-análise avulsa, R$ 10 (compra única)
 *   canal  — canal assinante, R$ 100/mês (assinatura)
 *
 * Os dois planos mensais só cobram de forma recorrente se a variante tiver
 * um selling plan associado *e* houver um app de assinaturas instalado na
 * loja (o Shopify Subscriptions, por exemplo). Selling plan sozinho pinta a
 * página de "assinatura" mas ninguém é cobrado no segundo mês.
 */

export type ProductKey = 'pro' | 'video' | 'canal';

export interface ProductConfig {
  /** gid da variante, ex.: gid://shopify/ProductVariant/123 */
  variantId: string | null;
  /** gid do selling plan; null nas compras únicas */
  sellingPlanId: string | null;
  /** SKU da variante, usado para reconhecer a assinatura ativa */
  sku: string | null;
  /** se falta configuração, o botão correspondente fica desabilitado */
  available: boolean;
}

const empty = (): ProductConfig => ({
  variantId: null,
  sellingPlanId: null,
  sku: null,
  available: false,
});

export function productConfig(env: Env, key: ProductKey): ProductConfig {
  switch (key) {
    case 'pro': {
      const variantId = env.PP_PRO_VARIANT_ID ?? null;
      const sellingPlanId = env.PP_PRO_SELLING_PLAN_ID ?? null;
      return {
        variantId,
        sellingPlanId,
        sku: env.PP_PRO_SKU ?? null,
        // assinatura sem selling plan não cobra o segundo mês, então
        // preferimos desabilitar a vender algo que não renova
        available: Boolean(variantId && sellingPlanId),
      };
    }
    case 'canal': {
      const variantId = env.PP_CANAL_VARIANT_ID ?? null;
      const sellingPlanId = env.PP_CANAL_SELLING_PLAN_ID ?? null;
      return {
        variantId,
        sellingPlanId,
        sku: env.PP_CANAL_SKU ?? null,
        available: Boolean(variantId && sellingPlanId),
      };
    }
    case 'video': {
      const variantId = env.PP_VIDEO_VARIANT_ID ?? null;
      return {
        variantId,
        sellingPlanId: null,
        sku: null,
        available: Boolean(variantId),
      };
    }
    default:
      return empty();
  }
}
