# Integração: grupos-e-elenco

- **Data**: 2026-11-06
- **Forma**: merge local na `main`, depois push (pedido do usuário)
- **Branch**: `feature/grupos-e-elenco` (criada da `main` `f9801ec0`; a feature já estava na `main` como rascunho, e esta branch traz o retrabalho R1 do `/validar`)
- **Validação**: PASS na rodada 3 (`validation.md`). Rodadas: 1 (achados SV-01 a SV-04, RC-A01 a RC-A05, V-A01 a V-A04), 2 (A-04 a A-06) e 3 (sem achado aberto).
- **Suíte**: lint, format, typecheck e checagens verdes; contrato 580/580, scripts 326/326, api 3633/3636, e2e da feature 12/12 (J-11 a J-14 e GEL-118), mutações do retrabalho 13 de 13 mortas.
- **Pendências aceitas, fora desta feature**: `push-backup` e `push-cpu` (ambiente, aceitas em 2026-11-06); `SIM-57` e `SIM-58` (CPU, aceitas); `SIM-15` e `pior-entrada` (simulador, preexistentes); comparação visual de telas de outras features (AD-126 e AD-127; as telas do módulo T08, T16, T20 e T27 sem falha, T09 fora por AD-029). A suíte completa de `testes.json` não fica 100% verde por causa delas.
- **Decisões**: AD-132 (PATCH do jogador substitui os campos; risco aceito de escalação sem FK e do 40P01 do arquivar) e a autorização dos 3 testes de ESLint, ambas em `.specs/STATE.md`.
- **Ambiente da validação**: Postgres próprio `pelada-gel-pg` (porta 5443), worktree `GestaoDaPelada_v2-wt-grupos-e-elenco`.
