# Validação — fundacao (rodada 1)

**Veredito**: FAIL (achados abertos)
**Árvore**: `6bfdb8be` (HEAD `f9801ec0`, worktree `feature/fundacao`, banco isolado `pelada-fundacao-pg`:5451)
**Relatórios de origem**: `validation-verificador.md`, `seguranca-validacao.md`

## Resumo

- 58 critérios FUN: 49 conformes; lacunas de precisão FUN-08, FUN-10, FUN-52, FUN-53; não atendidos FUN-38, FUN-50, FUN-54. FUN-48 passa (R2-T1 formal só em 2026-11-07).
- Gate (árvore `6bfdb8be`): lint, format, typecheck, checagens 134/134, contrato 567/567, scripts 326/326 verdes. Falhas só de tempo/ambiente sob carga (api, dominio, web, raiz); e2e 62/74 (12 falhas = jornadas das features 3 a 8; fundação toda verde); visual 223/256 (T01 erro/carregando aceitos, AD-127). CI em `f9801ec0`: verde.
- Sensor: 10 mutações, 10 mortas (1 equivalente).
- Revisão de código: sem diff contra a Branch pai (feature já na `main`); coberta pelo verificador e pelo auditor. Revisão dedicada: pendente de decisão.

## Achados

| ID | Onde | Achado | Correção | Crit. |
|---|---|---|---|---|
| A-01 | `.specs/projeto/testes.json:2`, `tasks.md` T81 | `visual` no comando nunca fica verde; trava de deploy nunca libera; falta `docker compose up -d --wait` | Tirar `visual` (AD-126) ou AD que o mantém; rodar `trava-testes.py --rodar`; fechar T81 | crítica |
| A-02 | `docs/restauracao-registro.md:12` | FUN-50: contagem por tabela "não conferida" contra a produção | Contar via `pelada_backup_ro` na produção (leitura) e registrar | crítica |
| A-03 | `spec.md:138,153` | FUN-38/40 mandam visual no CI; AD-126/127 mudaram | AD/nota na spec | comum |
| A-04 | `db/estado.ts:19-22` | Spec × design: aborta só por `pgmigrations`, sem AD | AD ou ajustar spec | comum |
| A-05 | `STATE.md:131-132` | Dois `AD-126` | Renumerar | comum |
| A-06 | `test/lint/*.test.ts:26`, `webhook-asaas-aplicar.test.ts:149` | Timeout 5 s estoura sob carga | `timeout: 60_000`, `hookTimeout` | comum |
| A-07 | `CLAUDE.md:52`, `wrangler.jsonc:12` | Contexto diz "sem domínio próprio"; há `custom_domain` (AD-121) | Atualizar linha | comum |
| A-08 | `hash.test.ts:36-52`, `esquema.test.ts:47`, `meta.test.ts:53-77` | Testes alterados sem autorização registrada | Autorização retroativa em `## Autorizações` | comum |
| A-09 (SEC-01) | migrações `1792843800000` e `1792843980000` | `pelada_backup_ro` sem SELECT nas 2 sequences: `pg_dump` completo falha (exit 1) | Migração aditiva com GRANT + teste de dump completo | crítica |
| A-10 (SEC-02) | `deploy.yml:20-22`, `backup.yml:18-20` | Secrets de produção só protegidos por `if:` | Restringir environments à `main` + revisor; registrar no runbook | crítica |
| A-11 (SEC-03) | `backend/scripts/src/host.ts:21` | Trava de host aceita `?host=` remoto | Recusar `host`/`hostaddr` na query | comum |
| A-12 (SEC-04) | `app.ts:96-98`, `cabecalhos.ts` | Falta 421 por Host, 403 por Origin e CSP/Referrer em `/api` | 403 por origem + CSP + Referrer com teste por método/variante; 421 fica fora do Worker (AD-131) | crítica |
| A-13 (SEC-05) | lockfile | 15 altas só em dev/teste, 2 moderadas em prod (`node-pg-migrate`) | Atualizar pool-workers; audit no CI | comum |
| A-14 (SEC-06) | `.gitleaks.toml:11-16`, `.gitignore` | Allowlist por pasta; `.env.*`/`.dev.vars` fora do gitignore | Regexes específicas; ampliar gitignore | comum |

## Lacunas conhecidas

- R2-T1 (backup agendado) só conferível em 2026-11-07; já há runs verdes de 2026-11-06 a favor.
- T81: itens 2 e 3 abertos (A-01).
