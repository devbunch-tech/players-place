# Players Place

Plataforma de valores de mercado do futebol — clubes, elencos, jogadores e
transferências de **15 ligas**, com dados consultados em tempo real no
[Transfermarkt](https://www.transfermarkt.com.br) (com cache). Interface em
português, mobile-first, seguindo o design do pacote
`design_handoff_playersplace`.

## Como rodar

```bash
npm install
npm run dev      # → http://localhost:3000
```

Build de produção: `npm run build` (saída em `dist/`).

## Stack

- **Shopify Hydrogen** (React Router 7 + mini-oxygen) — pronto para deploy na
  Oxygen e para a integração de cobrança via Shopify.
- **Tailwind CSS v4** com os tokens do handoff (`app/styles/tailwind.css`).
- **node-html-parser** para ler as páginas do Transfermarkt no servidor.

## Estrutura

| Caminho | O que faz |
| --- | --- |
| `app/lib/tm/leagues.ts` | Registro das 15 ligas (código do Transfermarkt, país, região, cor) |
| `app/lib/tm/client.ts` | HTTP + cache em memória com TTL (não sobrecarrega a origem) |
| `app/lib/tm/parse.ts` | Parsers do HTML (liga, tabela, clube, jogador, busca, valores, transferências) |
| `app/lib/tm/index.ts` | Serviço usado pelos loaders (inclui as APIs JSON `ceapi` de histórico/valor de mercado e a `tmapi.transfermarkt.technology` de desempenho por temporada) |
| `app/routes/` | Páginas: home, competições, clube, jogador, valores, transferências, busca, PRO |
| `app/components/` | Shell (nav/menu/footer), AdSlot, ProCard, Sparkline, UI |

### Rotas

`/` · `/competicoes` · `/competicoes/:code` · `/clubes/:id` ·
`/jogadores/:id` · `/valores?liga=CODE` · `/transferencias?tab=recordes` ·
`/busca?q=` · `/pro`

### Adicionar uma nova liga

Descubra o código da competição na URL do Transfermarkt
(`/wettbewerb/XXXX`) e acrescente uma linha em `app/lib/tm/leagues.ts`.
Nada mais é necessário — todas as páginas passam a funcionar para ela.

Códigos que exigiram atenção: Argentina usa **ARGC** (Torneo Clausura;
`ARG1` é o Apertura — a antiga Superliga `AR1N` foi extinta), Equador usa
**EC1N** (LigaPro Serie A) e Colômbia usa **COL1** (Finalización; `COLP` é
o Apertura do 1º semestre).

## Monetização

- **Anúncios**: componente `AdSlot` presente em todas as páginas
  (venda de espaços para anunciantes).
- **Vídeo-análise para YouTubers** (`app/lib/sponsors.ts` +
  `components/VideoAnalysis.tsx` + página `/canais`): espaço na página do
  jogador, antes do histórico de transferências, vendido a canais de
  YouTube — **R$ 10 por vídeo** ou **R$ 100/mês por vídeos ilimitados**
  (canal assinante). A página exibe até 5 vídeos, assinantes primeiro;
  havendo mais, o botão "Ver mais análises" revela o restante. Vídeos
  aparecem para todos (são conteúdo); o convite "seu canal aqui" aparece
  só para quem não é PRO. Demo ativa: Santiago Sosa (`/jogadores/576026`,
  7 vídeos reais). Em produção, o mapa de patrocínios será alimentado
  pelos pedidos da Shopify.
- **PRO — R$ 5/mês sem anúncios**: página `/pro`. Localmente a assinatura é
  simulada por um cookie (`pp_pro=1`), lido no loader do root; o `AdSlot`
  some automaticamente para assinantes.

### Integração Shopify (próximo passo)

1. Criar na loja um produto de assinatura "Players Place PRO" (R$ 5/mês,
   app de subscriptions) e produtos/planos de mídia para anunciantes.
2. Trocar o botão de `/pro` por um link de checkout da Shopify.
3. Após o pagamento (webhook `orders/paid` ou tag no cliente via Customer
   Account API), emitir o cookie/sessão PRO em vez do cookie manual.
4. Deploy na Oxygen: `npx shopify hydrogen deploy` (definir `SESSION_SECRET`
   e vincular a storefront no painel Hydrogen).

## Espelho do Transfermarkt

O site não depende mais de o Transfermarkt estar de pé. Tudo o que ele sabe
exibir fica gravado no Supabase, e a raspagem serve só para **atualizar** —
não para a página existir.

**As peças**

| Onde | O que faz |
| --- | --- |
| `supabase/006_espelho.sql` | Detecção de mudança por conteúdo (`hash`) e a fila de jogadores (`sujo`) |
| `scripts/espelho.ts` | O job que enche e mantém o banco (roda em Node, fora do Oxygen) |
| `.github/workflows/espelho.yml` | Dispara o job todo dia às 03:00 BRT |

**Como ele evita re-raspar 120 mil chaves por dia**

1. O modo `raso` percorre as 24 competições e todos os clubes. A página de
   elenco publica, numa requisição só, nome, número, posição, valor e clube dos
   ~28 jogadores — comparar isso com a passada anterior revela de graça quem se
   mexeu. Somam-se dois sinais que o elenco não mostra: quem está no
   departamento médico, e se o clube entrou em campo desde ontem.
2. O modo `fundo` raspa as ~9 chaves pesadas **só dos marcados**.
3. Em cada gravação, `tm_cache_gravar` compara o hash do conteúdo. Se nada
   mudou, o payload não é reescrito e a validade lógica da chave **dobra**, até
   o teto de 7 dias. Uma carreira encerrada deixa de ser buscada sozinha; um
   histórico de jogos que muda toda quarta volta ao TTL curto sozinho. Ninguém
   ajusta TTL na mão.

Requisição condicional não ajudaria: medido em 10/08/2026, o `Last-Modified` do
Transfermarkt é a hora de renderização, e com conteúdo idêntico ele avança a
cada 60 s — o `If-Modified-Since` volta 200, nunca 304.

**Colocar para funcionar**

1. Rodar `supabase/006_espelho.sql` no SQL Editor (é idempotente).
2. Cadastrar `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nos *secrets* do
   repositório no GitHub.
3. O primeiro carregamento são ~130 mil requisições: com o orçamento padrão
   leva cerca de uma semana de execuções noturnas. Para acelerar, dispare pela
   aba Actions com `orcamento` maior (o teto útil é ~50000, as 6 h do runner).
   A fila é retomável — cada jogador é carimbado assim que termina.

Localmente:

```bash
npm run espelho -- raso  --ligas=BRA1
npm run espelho -- fundo --ligas=BRA1 --orcamento=500
```

O progresso se lê no SQL Editor — as consultas estão no rodapé da migração.

## Avisos

- Os dados são obtidos do Transfermarkt **sem afiliação oficial**, por
  leitura das páginas públicas, com cache de 1–24 h por rota. Antes de
  lançar comercialmente, revise os termos de uso do site e o licenciamento
  de dados/escudos/fotos.
- Protótipo local: `robots.txt` bloqueia indexação.
