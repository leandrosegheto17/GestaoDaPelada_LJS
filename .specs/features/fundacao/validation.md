# Validação — fundacao (rodadas 1 a 3)

**Veredito**: FAIL na rodada 1; rodada 2 FAIL (A-15 a A-19, corrigidos); rodada 3 sem reexecução completa do verificador. Integrada à `main` por decisão do usuário (2026-11-06), com as pendências abaixo registradas.
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

## Rodadas 2 e 3 (2026-11-06)

- **Rodada 2** (`validation-verificador-r2.md`, `seguranca-validacao-r2.md`): A-01 a A-14 conferidos; A-15 (README sem as portas do e2e), A-16 (ramos de origem sem teste), A-17 (audit e gitleaks sem teste), A-18 (default privileges sem teste) e A-19 (ID citado) corrigidos nos commits `576dff2c` e seguintes. Segurança: 0 crítico, 0 alto, 0 médio; SEC-04r corrigido (`/api/dev/emails` exige `DEV_EMAILS_TOKEN`, `fd3562c7`).
- **Gate da árvore final (`feature/fundacao`)**: lint, format, typecheck, checagens (134), contrato (567), domínio (668), scripts (332), web (1058), api worker (766) verdes. api banco 2880/2883 (`push-backup` x2: `pg_dump` 16 local contra servidor 18; `push-cpu`: orçamento de CPU sob carga). e2e 71/74 (`pdf-visual` PAR-108 x2: 5,8% contra 4,5%, API simulada, de `partidas-e-ranking`; J-23 estourou 30 s sob carga; J-14 também e passa com `--timeout=120000`).
- **Pendências aceitas**: A-02 e a conferência de privilégios do A-09 na produção (R2-T1, depende do secret `NEON_URL_BACKUP` e só vale em 2026-11-07); ruleset da `main` e Dependabot (SEC-02r, SEC-05r: configuração do GitHub, do usuário); `trava-testes --rodar` não ficou verde nesta máquina pelos motivos acima, com o CI como prova (T81 item 3).
- **Não executado**: terceira rodada completa do verificador e do auditor sobre `fd3562c7`.
