# Handoff: PlayersPlace — Plataforma de valores de mercado do futebol

## Overview
PlayersPlace é uma plataforma global (concorrente do Transfermarkt) de valores de mercado, transferências/rumores e estatísticas de futebol, com dados mantidos pela comunidade (crowdsourcing com votação/debate), monetizada por publicidade e um tier PRO (B2B para clubes, agentes e olheiros). Idioma: Português (BR). Tema claro. Filosofia: **mobile-first, flat, sensação de app nativo**.

Este pacote cobre 3 entregas:
1. **App mobile** (`PlayersPlace App.dc.html`) — 8 telas navegáveis
2. **Versão desktop** (`PlayersPlace Desktop.dc.html`) — mesmas telas em layout web
3. **Landing page** (`PlayersPlace Landing.dc.html`) — página de marketing

## About the Design Files
Os arquivos deste bundle são **referências de design criadas em HTML** — protótipos que mostram aparência e comportamento pretendidos, NÃO código de produção para copiar. A tarefa é **recriar estes designs no stack do projeto: React + TypeScript + Tailwind CSS, sobre Shopify Hydrogen (framework) e Oxygen (hosting)**, usando os padrões e bibliotecas desse ambiente (componentes Hydrogen, roteamento Remix/React Router, etc.). Os arquivos `.dc.html` usam um runtime próprio de template (`support.js`, `<x-dc>`, `{{ holes }}`) — ignore essa mecânica; extraia apenas o markup, os estilos inline e a lógica descrita neste README. A pasta `standalone/` contém versões navegáveis em navegador para referência visual rápida.

## Fidelity
**High-fidelity (hifi).** Cores, tipografia, espaçamentos, raios e copy são finais. Recriar pixel-perfect com Tailwind usando os tokens abaixo. Os dados (jogadores, valores, jogos) são placeholders realistas — em produção virão de API/banco.

## Design Tokens (Tailwind)

```ts
// tailwind.config.ts — theme.extend
colors: {
  pitch:   '#0E4632',  // verde-campo — primária (cards hero, fundo PRO)
  lime:    '#C8F04B',  // destaque / CTA / selo PRO / gráficos
  ink:     '#131711',  // texto forte, botões dark, chips ativos
  paper:   '#F3F4EF',  // fundo de página (nunca branco puro)
  card:    '#FFFFFF',  // superfícies de card
  line:    '#E4E6DC',  // bordas de card (linhas internas: #EEF0E6)
  hover:   '#FAFBF6',  // hover de linhas de lista
  soft:    '#F6F7F1',  // fundos internos (rota de rumor, stats)
  chipbg:  '#E7E9DF',  // trilho de tab segmentada
  muted:   '#70776B',  // texto secundário
  faint:   '#9AA093',  // texto terciário / rótulos
  up:      '#189A5A',  // variação positiva ▲ (bg claro: #E6F4E9)
  down:    '#DE4A32',  // variação negativa ▼ / dot "ao vivo" / rumor quente
  warm:    '#E07B12',  // rumor morno (bg claro: #FBEEE0)
},
fontFamily: {
  display: ['"Bricolage Grotesque"', 'sans-serif'], // títulos + números-herói, weight 800, tracking negativo
  sans:    ['Archivo', 'sans-serif'],               // UI e texto, weights 400–800
},
borderRadius: { card: '16px', btn: '12px' }
```

- Fontes: Google Fonts (`Bricolage Grotesque` variável 500–800; `Archivo` 400–800).
- Números SEMPRE com `font-variant-numeric: tabular-nums` (classe `tabular-nums`).
- Espaçamento base 4 px; paddings usuais 12–20 px; gaps 8–14 px.
- Sombras: nenhuma em repouso (flat). Exceção: cards flutuantes do hero da landing.
- Hover: linhas de lista → bg `hover`; botões lime → `#D6F86B`; dark → `pitch`.
- Alvos de toque mobile ≥ 44 px.
- Links: cor `pitch`, hover `#0A3325`.

## Screens / Views

### App mobile (viewport 402×874, iPhone)
Header fixo (62 px de safe-area top): logo à esquerda (clique → Home), hambúrguer 44×44 à direita. Conteúdo em área de scroll única. Navegação: **menu fullscreen** (drawer) com 5 itens numerados 01–05 em Bricolage 26 px (item ativo: bg `#EAEDDF`, dot lime) + card PRO no rodapé.

1. **Home** — data/status da janela; busca (pill branca, placeholder "Buscar jogadores, clubes, ligas…"); carrossel horizontal "Ao vivo" (cards 172 px: competição, badge AO VIVO lime com dot vermelho pulsante, 2 linhas de time com escudo-inicial colorido + placar); lista "Transferências de impacto" (avatar-iniciais 38 px, nome, rota A → B, taxa, tag CONFIRMADA verde / RUMOR % laranja); anúncio nativo (card com borda tracejada `#D5D8CB`, rótulo PUBLICIDADE 8.5 px); "Manchetes" (categoria eyebrow verde + tempo + título 14 px/600); card PRO verde-campo (badge lime, título Bricolage 19 px, CTA lime "Testar 7 dias grátis").
2. **Transferências** — título 26 px; tab segmentada Rumores/Confirmadas (trilho `chipbg` r-13, tab ativa branca r-11); rumor-card: jogador + taxa especulada; rota em pílula `soft` (escudo → escudo); **barra TEMPERATURA** (5 px, cor por faixa: ≥70% `down`, ≥50% `warm`, senão `faint`) + % à direita; meta "N fontes · há X h". Confirmadas: lista com taxa + data.
3. **Valores de Mercado** — chips-filtro por nacionalidade (ativo: bg ink/texto branco; inativo: branco com borda) + chip "Filtros avançados [PRO]" (selo lime); ranking: posição, avatar, nome, dot do clube + clube · posição · idade, valor (800), delta colorido (▲ verde / ▼ vermelho / • estável); banner PRO ink "Compare até 4 jogadores lado a lado".
4. **Competições** — chips Todas/Europa/América do Sul; lista: monograma quadrado r-12 colorido (UCL, PL, LL…), nome, região · nº clubes, valor total, chevron. Clique → Detalhes da Competição.
5. **Detalhes da Competição** — header com voltar (círculo 36 px, borda); monograma 56 px + nome + temporada; 3 stat-tiles (VALOR TOTAL / CLUBES / JOGADORES); "Clubes mais valiosos" ranqueados (clique → Perfil do Clube quando o clube existe na base).
6. **Perfil do Clube** — voltar; escudo 62 px com anel branco; nome + liga (link → competição) · país; card verde-campo "VALOR DO ELENCO" (Bricolage 32 px + "definido pela comunidade · atualizado hoje"); 3 tiles (JOGADORES / IDADE MÉDIA / ESTRANGEIROS); "Destaques do elenco" (clique → Perfil do Jogador quando existe).
7. **Perfil de Jogador** — voltar; avatar 76 px; nome Bricolage 24 px; clube (link → clube), posição · idade · nacionalidade; botão Seguir (lime; ao seguir vira ink com texto lime "Seguindo"); card verde "VALOR DE MERCADO": valor 36 px, delta do trimestre, **sparkline SVG** (polyline lime stroke 2.5 + área rgba(200,240,75,.14) + ponto final r-4, eixo 2022→hoje); card "A COMUNIDADE AVALIA": pergunta "€ X mi é um valor justo hoje?" com 3 opções votáveis (Baixo/Justo/Alto — selecionada: bg `#F3FADF` + borda ink 1.5 px; percentuais recalculam com o voto); 4 stat-tiles (JOGOS/GOLS/ASSIST./MIN.) + nota de temporada/contrato; "Histórico de transferências" (ano, rota, taxa); card PRO "Comparar X com outro jogador".
8. **Fórum** — card verde "DEBATE DA SEMANA" ("Vinícius Júnior a € 150 mi: o valor deve mudar?") com 3 opções votáveis (barras lime, % à direita; selecionada: bg lime 16% + borda lime) + "N votos · encerra em 2 dias · toque para votar/seu voto foi registrado"; chips de categoria (Todos/Valores/Transferências/Táticas); threads (categoria eyebrow + "EM ALTA" vermelho quando hot, título, respostas · tempo); card "CENTRAL DA COMUNIDADE" com CTA "Contribuir".

**Navegação em pilha:** telas de detalhe (jogador, competição, clube) empilham; o botão voltar retorna à tela anterior real (ex.: competição → clube → jogador → voltar → clube). Navegar pelo menu limpa a pilha. Transição de tela: fade + translateY(10px), 0.3 s ease.

### Desktop (janela 1360×860, conteúdo max-width 1140 px)
Top-nav 62 px: logo, 5 itens-pílula (ativo: bg ink), busca 230 px, botão "Assinar PRO" lime. Footer com links.
- **Home**: grid `1fr 340px` — coluna principal (ao vivo em grid de 4, transferências de impacto em tabela-lista, manchetes) + sidebar (Top 5 valores, Debate da semana votável, anúncio, card PRO).
- **Valores**: tabela com header de colunas (# / JOGADOR / CLUBE / POSIÇÃO / IDADE / VALOR / VARIAÇÃO), grid-template `44px 1fr 200px 150px 60px 110px 110px`; clube clicável (stopPropagation) → perfil do clube.
- **Transferências**: rumores em grid 2 colunas; confirmadas em tabela.
- **Competições**: grid 2 colunas de cards.
- **Fórum / Perfil de jogador / Competição / Clube**: mesmas seções do mobile reorganizadas em grid `1fr 340–400px` com sidebar.

### Landing page (scroll, max-width 1140 px)
- Nav sticky translúcida (blur) com âncoras Produto/Comunidade/PRO, "Entrar" e "Criar conta grátis" (ink).
- **Hero**: badge "Janela de transferências aberta · dados ao vivo" (dot pulsante); H1 Bricolage 58 px com a palavra "entende" marcada em lima; parágrafo; CTAs "Começar agora — é grátis" (lime) + "Ver como funciona"; stats 120 mil jogadores / 400+ competições / 48 mil contribuidores / 190 países. À direita, 3 cards de produto flutuantes (animação float 7–8 s): valor de mercado com sparkline, rumor com temperatura, e votação demo FUNCIONAL (clicar registra voto e recalcula %).
- **Produto** (fundo branco): 3 feature-cards (Valores de mercado / Central de rumores / Placar e estatísticas) com ícones SVG em quadrado verde-campo r-14.
- **Comunidade**: passos 1-2-3 (Proponha → Debata e vote → Publicado e rastreável) + card do debate da semana.
- **PRO** (fundo ink): 4 bullets com check lime + card de preço verde-campo (€ 39/mês por assento, teste 7 dias, "Falar com vendas").
- **CTA final** ("O mercado não para. Entre no debate.") + footer.

## Interactions & Behavior
- Votações (fórum, perfil, landing): clique seleciona opção única, soma +1 ao total e recalcula percentuais; visual da selecionada muda (borda/bg); hint muda para "seu voto foi registrado".
- Tabs e chips: estado ativo bg ink (chips) ou bg branco (tab segmentada).
- Seguir jogador: toggle com inversão de cores lime↔ink.
- Animações: `ppPulse` (dot ao vivo, opacity 1↔0.25, 1.4 s infinite), `ppIn` (entrada de tela, fade+10px, 0.3 s), `ppFloat/ppFloat2` (cards do hero da landing). Sem transições de layout.
- Estados live: badge "AO VIVO · 78'" lime com dot vermelho; encerrados "FIM" (badge cinza); futuros mostram horário.
- Monetização opcional: anúncios e seções PRO devem poder ser desligados por flag/config.

## State Management
- `screen` (rota) + pilha de navegação para telas de detalhe. No Hydrogen: rotas reais `/`, `/transferencias`, `/valores`, `/competicoes`, `/competicoes/:id`, `/clubes/:id`, `/jogadores/:id`, `/forum` — o histórico do browser substitui a pilha manual.
- `transferTab`, filtros de chips (`valueFilter`, `compFilter`, `forumCat`), votos (`forumVote`, `playerVote`), `following`.
- Dados: jogadores (id, nome, clube, posição, idade, nacionalidade, valor, delta, histórico de valor em 5 pontos, stats da temporada, contrato, transferências), clubes (liga, país, valor do elenco, tamanho, idade média, estrangeiros, elenco), competições (região, nº clubes, valor total, top clubes), rumores (from/to, taxa, heat 0–100, nº fontes, tempo), jogos ao vivo, threads do fórum.

## Assets
- Logo: `logo/` — símbolo SVG (P de traço contínuo, stroke 26/256 round-cap, sobre quadrado r-72/256 lima) em 4 versões. No app o logo é reproduzido inline (quadrado lime r-9 + "P" + wordmark "playersplace" com "place" em verde). No wordmark SVG o texto usa a fonte Bricolage Grotesque — converter em curvas para produção gráfica.
- Escudos de clube: placeholders — círculos coloridos com sigla (cores oficiais aproximadas, ex. RMA #22418B, FCB #A50044). Em produção, substituir por escudos licenciados.
- Avatares de jogador: placeholders com iniciais sobre `#E9EBE0`. Substituir por fotos.
- Ícones: SVGs inline simples (stroke 2–2.5, round caps) — busca, chevrons, setas, check.
- Brandbook completo: `PlayersPlace Brandbook.dc.html` no projeto de design (exportável em PDF).

## Files
- `PlayersPlace App.dc.html` — protótipo mobile (8 telas)
- `PlayersPlace Desktop.dc.html` — protótipo desktop
- `PlayersPlace Landing.dc.html` — landing page
- `standalone/*.html` — versões auto-contidas navegáveis (abrir direto no navegador; manter na mesma pasta para os links funcionarem)
- `logo/*.svg` — logos
- `ios-frame.jsx`, `browser-window.jsx`, `support.js` — molduras/runtime do protótipo; **ignorar na implementação**
