# Planos e cobrança: Integração

- **Data**: 2026-11-06
- **Forma**: merge local (fast-forward) de `feature/planos-e-cobranca` na `main`, seguido de push (pedido do usuário)
- **Validação**: `validation.md`, PASS na rodada 4 (rodadas 1 a 3 geraram o retrabalho R1 e R2, T58 a T72)
- **Árvore integrada**: 9c32b3d8d39095d260bb91e55a6a3d9a82682577
- **Riscos aceitos**: AD-141 (A-15, SEC-003, SEC-005 de banco, SEC-007 parcial), em `.specs/STATE.md`
- **Suíte** (`Gate:` do `tasks.md`): lint, format, typecheck, checagens (134/134), build, contrato, scripts e vitest por pacote verdes, com as pendências conhecidas: `push-backup` (2) e `push-cpu` (aceitas pelo usuário), PAR-108 do `pdf-visual` (2, idêntico na `main` f9801ec0, fora desta feature) e testes que só estouram o tempo sob carga e passam isolados (GEL-70, SIM-14/15/66, `test/lint`). E2E: 72 de 74 (as 2 de PAR-108). O `trava-testes.py --rodar` não foi repetido: o e2e dele usa portas fixas (8788 a 8790) que outras sessões ocupam.
- **Ambiente da validação**: Postgres 18 próprio (container `pelada-val-planos-pg`, porta 5447) e worktree `GestaoDaPelada_v2-val-planos`, separados das demais sessões.
