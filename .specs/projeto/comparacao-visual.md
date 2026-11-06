# Comparação visual com o mockup: situação

**Medido em**: 2026-11-06, `pnpm --filter @pelada/web visual` (256 comparações: 128 estados × PC e celular; limite de 1% de pixels). Rodada limpa, em worktree própria, sem outro e2e escrevendo em `frontend/web/test-results/`.

| Momento | Passam | Falham |
|---|---|---|
| Antes dos ajustes | 54 | 202 |
| Depois | 126 | 130 |

## Corrigido

- Casca sem as regras de tablet e PC do `base.css` (padding da barra e do conteúdo, título maior): `Casca.module.css`.
- Respostas `elenco-grupo-*.json` do mockup sem os 8 campos do contrato (o app caía em "Não foi possível carregar" nas T15, T17 e T20).
- `fieldset` do `TrechoSomenteLeitura` (`display: block`) cortava o `gap` do formulário em toda tela de escrita.
- T20: ajuda do nome na edição, botões do cartão do link e margem do subtítulo.
- Runner: passo `selecionar` (usado por T16 e T27), porta (`PELADA_VISUAL_PORTA`) e filtro (`PELADA_VISUAL_FILTRO`, regex sobre o nome, ex.: `^t20-`).

## Pendente (130)

| Causa | Qtde | Telas |
|---|---|---|
| Diferença de pixels (1% a 15%) | 69 | T01, T04, T07 a T13, T16 a T20, T22 a T24, T31 a T33 |
| Espera de seletor que não aparece | 44 | T01, T11 (6), T12, T13, T14, T16 (12), T17, T20, T22, T27 |
| Tamanhos diferentes nos dois lados | 17 | T05, T13 (7), T16 (6), T32 |

Causas já conhecidas, ainda sem ajuste:

- **T04** (`Entrar`): o mockup tem "Voltar ao ranking" e o app não, por SPEC_DEVIATION registrada em `Entrar.tsx` (a tela de entrada não sabe o grupo). Decisão de produto.
- **T01** `erro` e `carregando`: o app mostra "RANKING" e o ícone de erro; o mockup mostra "Gestão da Pelada" e o ícone de sem conexão, sem a engrenagem. A semântica de erro versus sem conexão foi desenhada na partidas-e-ranking (T73).
- **T27** `erro`: o mapa não tem a resposta 422 do `POST /api/grupos`; acrescentá-la não bastou (o runner não separa GET de POST, o e2e `erros-campo.spec.ts` separa).
- **T16** (28 falhas) e **T13** (14): cada estado precisa de leitura própria; a maior parte é timeout de passo (botão ou dialog que o mockup tem e o app nomeia diferente).
