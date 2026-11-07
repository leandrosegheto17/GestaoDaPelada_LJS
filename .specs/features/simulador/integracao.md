# Integração: simulador

- **Data**: 2026-11-06
- **Forma**: merge local de `feature/simulador` na `main` (pedido do usuário; sem push e sem PR)
- **Validação**: `validation.md` PASS na rodada 2 (rodada 1: FAIL com 16 achados, A-01 a A-16; A-17 fechado depois). Auditoria de segurança: 0 crítico, 0 alto, 0 médio; resíduos baixos aceitos na AD-131.
- **Último commit da feature**: 218e673b (antes do merge)
- **Suíte (`trava-testes.py --rodar`, ambiente isolado: Postgres 5452, portas 8798 a 8800 e 4194)**: lint, format:check, typecheck e `test:checagens` verdes; contrato 571, scripts 326, dominio 673 e raiz 50 verdes; api 3.628 e web 1.062 verdes salvo timeouts de carga que passam isolados. Falham só as 3 de ambiente do Windows já aceitas pelo usuário: `push-cpu` (relógio de 15,6 ms) e `push-backup` ×2 (`pg_dump` 16 contra servidor 18). A cadeia `&&` parou nelas; e2e do simulador (J-22 a J-24 e SIM-08, 7/7) e visual do simulador (36 de 36 em até 1%) foram rodados à parte pelo verificador.
- **Pendências para o `/finalizar`**: T42 (ensaio da migração `1792844940000_grupo-criar-contrair.sql` sobre dump da produção) e T43 (SIM-61: p99 de CPU na prévia publicada), ambas dependem de ação do usuário; dívidas A-15 e A-16 e histórico A-07 (AD-131).
- **Decisões**: AD-128 (40 aptos e limiar de 10 ms), AD-129 (Confirmar desabilitado durante o recálculo), AD-130 (mockup do simulador completado), AD-131.
