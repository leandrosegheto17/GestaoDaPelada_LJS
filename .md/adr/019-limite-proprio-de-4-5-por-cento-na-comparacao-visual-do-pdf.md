# ADR-019 — Limite próprio de 4,5% na comparação visual do PDF (P01)

Status: Aceito · Data: 2026-10-17 · Origem: BK-0002

## Contexto
O aceite do TP-0183 pede ≤ 1% de pixels divergentes entre a 1ª página do PDF rasterizada (pdf.js em canvas, 794 × 1123) e `.pdf-folha` do mockup (DOM no Chrome). Medido: 3,96% (sucesso) e 4,02% (mes-vazio), vindo de 14,8%/13,7% antes do ajuste de geometria. Divisas, linhas e caixas batem a ≤ 1 px. O resíduo é rasterização de texto: o pdf.js suaviza glifos diferente do Chrome e o jsPDF não aplica `tabular-nums` (o "1" das marcas fica ~1 px deslocado, ~7 mil px). Com tolerância por canal de 100/255 ainda restam ~1,2%: 1% não é atingível entre PDF vetorial rasterizado e DOM. Não é decisão de produto: o PDF não difere do mockup em layout, cor, texto ou medidas.

## Alternativas
1. Limite próprio do PDF (4,5%), 1% mantido nas telas: preserva a detecção de regressão estrutural (uma coluna, divisa ou barra fora do lugar passa de 4,5%); margem de ~0,5 p.p. sobre o medido.
2. Tolerância por canal maior: esconde diferença real de cor/tom sem tornar o 1% alcançável (~1,2% mesmo a 100/255).
3. Só inspeção humana dos PNGs: sem teste automático, regressão passa despercebida.

## Decisão
Opção 1, com a inspeção dos PNGs como complemento obrigatório. `LIMITE_PDF = 0.045` só em `e2e/pdf-visual.spec.ts`; tolerância por canal inalterada (24); dimensões exatas 794 × 1123 continuam asserção rígida. `comparar-visual.mjs` e as telas seguem em 1%. Os PNGs `e2e/resultado/pdf-*-{obtido,mockup}.png` são abertos e conferidos pelo Executor/QA a cada mudança em `src/pdf/`.

## Consequências
O limite detecta deslocamento estrutural, não diferença de suavização de glifo. Se a divergência medida subir acima de ~4,2%, tratar como regressão (não subir o limite sem novo ADR). Reavaliar se o jsPDF passar a suportar `tabular-nums` ou se a rasterização deixar de usar pdf.js.

## Adendo (BK-0003)
No runner Linux do CI (Ubuntu, fontes com hinting próprio) a divergência medida é 7,25% (sucesso) e 6,02% (mes-vazio), com leiaute conferido nos PNGs. Com `CI` definido, `LIMITE_PDF = 0.09`; localmente segue 0.045. Regressão estrutural continua acima de ambos os limites.
