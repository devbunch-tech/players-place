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

    /** URL do projeto Supabase, ex.: https://xxxx.supabase.co */
    SUPABASE_URL?: string;
    /**
     * Chave service_role do Supabase. Ela ignora o Row Level Security, então
     * SÓ pode ser usada em loader/action (servidor) e nunca pode ser devolvida
     * para o navegador. Toda checagem de permissão é feita no nosso código.
     */
    SUPABASE_SERVICE_ROLE_KEY?: string;

    /**
     * Segredo que libera POST /api/fantasy/apurar. Sem ele a rota fica
     * desligada: cada chamada custa ~11 requisições ao Transfermarkt, e uma
     * rota aberta viraria vetor de abuso contra a origem.
     */
    FANTASY_APURACAO_TOKEN?: string;

    /**
     * Segredo que libera POST /api/aquecer, o job que materializa os elencos
     * do Brasileirão em `jogadores_base`. Mesma razão do token acima: cada
     * chamada custa até 20 raspagens, então sem a variável a rota fica
     * desligada em vez de aberta.
     */
    AQUECIMENTO_TOKEN?: string;

    /**
     * Chave da YouTube Data API v3, usada para achar o vídeo de highlights da
     * página do jogador. Opcional: sem ela o bloco vira um botão que abre a
     * busca no YouTube, em vez de sumir ou quebrar.
     *
     * A cota gratuita é de 10.000 unidades/dia e cada busca custa 100 — daí o
     * resultado ficar 7 dias em cache (ver lib/youtube.ts).
     */
    YOUTUBE_API_KEY?: string;
  }
}
