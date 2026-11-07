# Integração: financeiro

- **Data**: 2026-11-06
- **Forma**: merge da `main` em `feature/financeiro` (conflitos em STATE, README e playwright.config resolvidos a favor da main) e fast-forward da `main`, com push (pedido do usuário; sem PR)
- **Validação**: `validation.md` PASS na rodada 2 (rodada 1: reprovada, A-01 a A-08, mais 5 achados de segurança e 4 sugestões, todos tratados). Segurança: `seguranca.md`, 0 crítico, 0 alto.
- **Último commit da feature (antes desta integração)**: f7e21869
- **Suíte, ambiente isolado (Postgres 5456, portas 8756, 4756, 8766 a 8770)**: lint, format, typecheck, build e `test:checagens` verdes; contrato 571 e raiz 50 verdes; dominio, web e api só com timeouts de carga (verdes isolados) e as pendências de ambiente já aceitas (push-backup ×2, push-cpu, SIM-58). e2e 72 de 74 (as 2 são o PAR-108 de `partidas-e-ranking`). `visual` completo: 25 reprovações, todas de outras features; as do financeiro (t09 sucesso, t19, t22, t23, t24) passam em até 1%.
- **Decisões**: AD-136 (criadora mantém o acesso; trigger de colunas), AD-137 (`vinculos_travar`), AD-138 (passada de rascunho), AD-139 (recorte do t22 erro-pagamento no mockup). A migração `1794010000000_financeiro-protege-criadora` ficou depois da do simulador.
- **Pendências para o `/finalizar`**: risco residual do INSERT direto em `vinculos_admin` (AD-136); observação do e-mail longo no t19 em 390 px (só por redesign); o `visual` deixa o `vite preview` da porta 4756 ao terminar no Windows.
