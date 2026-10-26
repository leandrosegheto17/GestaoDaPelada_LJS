# Liberações

## 2026-10-26 — fundação: esqueleto publicado, banco com isolamento por grupo, CI, deploy e backup (`d50f81b`)

- **Suíte**: verde no commit `724fed2` (`trava-testes.py --rodar`: lint, format, typecheck, `pnpm test`, `pnpm test:checagens`, build do web, e2e e visual). Verificador, rodada 3: PASS, 10 de 10 mutações mortas · **Segurança**: sem achado crítico ou alto em aberto; baixos abertos SEC-003, 005, 006, 007 e 008 (aceitos, em `seguranca.md`).
- **Estratégia**: janela única, tudo de uma vez (`deploy.yml`, run 40370936469, 1m46s, confirmado pelo usuário) · **Staging**: não (runbook §2: sem homologação; em seu lugar, branch de restauração no Neon e dump cifrado pré-deploy).
- **Alcance**: 100% em 2026-10-26, sem usuários reais. Produção serve só a página provisória "Em breve" em `/`; as rotas `/vitrine/*` não existem no build de produção (por desenho, FUN-37). Instalação do PWA conferida pelo usuário no Chrome do desktop e no celular.
- **Monitoramento**: `GET /api/health` = 200 com `versao` = `d50f81b…`; `backup.yml` diário (execuções manuais 40365506581 e 40379156441 com sucesso). **Sem Sentry nem UptimeRobot** (o usuário não tem as contas): nada avisa se o site cair. Abertos: monitor de uptime (runbook §7) e conferir o primeiro backup agendado verde (run de 2026-10-27, cerca de 07:00Z).
- **Reversão**: `wrangler rollback`, que o `deploy.yml` roda sozinho se o deploy ou a saúde falhar (provado por teste estrutural e sensor, **não disparado em produção**). Banco: branch `restauracao-producao-<run_id>` ou dump `dump-predeploy-<run_id>` (runbook §3 e §4); a restauração do backup foi executada de verdade em 2026-10-26 (T49, contagem das 21 tabelas igual à origem).
- **Dados**: migração aditiva aplicada no banco de produção, com dump cifrado e branch de restauração antes. Worker antigo `pelada` removido em 2026-10-26, com confirmação.
- **Resultado**: liberada
