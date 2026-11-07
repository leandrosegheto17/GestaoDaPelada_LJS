# Fundação: validação do verificador, rodada 2 (retrabalho)

**Data**: 2026-11-06 · **Árvore**: `6816b49f` (HEAD `c0878c3b`, diff `f9801ec0..HEAD`, 7 commits) · **Verificador**: independente
**Veredito**: FAIL ❌ (1 achado crítico novo: `pnpm test` da raiz vermelho; 4 comuns; A-01 reaberto em parte)

## Achados anteriores (A-01 a A-14)

| ID | Correção no diff | Teste que falharia sem ela | Estado |
|---|---|---|---|
| A-01 | `.specs/projeto/testes.json:2` sem `visual`, com `docker compose up -d --wait` | n/a (config) | **reaberto em parte**: T81 itens 2 e 3 seguem `[ ]` (`tasks.md:2427-2428`); `trava-testes --rodar` não ficou verde (A-15; e2e 71/74 informado) |
| A-02 | `docs/restauracao-registro.md:15-19` + R2-T1 `tasks.md:2776` | n/a | **lacuna aceita**: a URL da role só existe no secret `NEON_URL_BACKUP`; registro e tarefa existem (AD-014 segue aberta) |
| A-03, A-04, A-07 | `spec.md:138,153`; AD-133; `CLAUDE.md:52` | n/a (texto) | fechado |
| A-05 | `STATE.md:131` AD-136 (visual), `:132` AD-126 (pesos), `:134` AD-127 | n/a | fechado |
| A-06 | `test/lint/pontuacao-so-no-modulo.test.ts:25`, `sem-escrita-periodo.test.ts:25` `{timeout:60_000}`; `vitest.config.ts:90` `hookTimeout`; `web/vite.config.ts` `testTimeout 15_000` | PAR-61/PAR-140 passam na cópia limpa (antes estouravam 5 s) | fechado |
| A-08 | `STATE.md` `## Autorizações` 2026-11-06 (retroativa, motivo) | n/a | fechado |
| A-09 | migração `1794000000000_backup-sequences.sql:7-8` | `backup-sequences.test.ts:11` `rows.filter(!le) toEqual([])`, `:27` `le toEqual([true,true])`; mutantes G1, G2 mortos. `pg_dump` 18.6 (`docker exec`, role `pelada_backup_ro`, `--enable-row-security`): HEAD exit 0; clone do banco sem o SELECT nas 2 sequences: exit 1 "failed to get data for sequence" | fechado (conferência na produção = R2-T1 `tasks.md:2777`, aceita como lacuna) |
| A-10 | `runbook.md:182`; `gh api` (GET) por mim: `producao` e `backup` com `custom_branch_policies`, só `main`, sem revisor | n/a | fechado (sem revisor obrigatório, documentado; aceito) |
| A-11 | `backend/scripts/src/host.ts:28-35` | `host.test.ts:32-47` (5 variantes, caixa, vazio) + `:49` `sslmode` ainda aceito; H1-H4 mortos | fechado |
| A-12 | `origem-host.ts`, `cabecalhos.ts:23-33`, `app.ts:97-99`; AD-135 | `host-origem.test.ts` (ver abaixo) | fechado com ressalva (A-16) |
| A-13 | `ci.yml` passo `pnpm audit --prod --audit-level high` (exit 0 aqui, 2 moderadas) + AD-134 | nenhum (A-17) | fechado na prática, sem teste |
| A-14 | `.gitleaks.toml:11-16` por arquivo; `.gitignore:7-10` | `gitleaks dir .` na árvore: no leaks; `git ls-files` só `.env.example` | fechado na prática, sem teste (A-17) |

**A-12 e AD-135**: a AD justifica o desvio do 421: o `wrangler dev` troca o `Host` pelo da rota (o Worker não distingue o host real), no ar a Cloudflare só entrega os endereços configurados e o Vite já fecha `allowedHosts`; o objetivo do 421 (rebinding) fica coberto pela recusa de `Origin` fora de `Host`/`URL_PUBLICA`/loopback com `EMAIL_DEV=1`. Aceito. Ressalva: a AD vale como requisito (a regra aceita "FUN-NN ou AD"), mas os testes citam FUN-22, que só fala de `no-store` e `nosniff` (A-19).

## Sensor (cópia `git worktree` com `node_modules` por junção; só o arquivo de teste do mutante; descartada)

| # | Mutação | Resultado |
|---|---|---|
| O1 | `origem-host.ts:47` remove o ramo `Sec-Fetch-Site` | morto (4 falhas) |
| O2/O3 | tira `none` da lista / tira `toLowerCase` do site | mortos (4/4) |
| O4 | `:50` remove o ramo `Origin` | morto (8) |
| O5/O5b | `ehLeitura` só GET / só HEAD | mortos (1/1) |
| O6/O6b | tira a comparação com `Host` / usa só a URL da requisição | mortos (1/1) |
| O7 | `:34` tira o ramo `URL_PUBLICA` | **sobreviveu** (não equivalente: `:103` é mascarado pelo loopback de `EMAIL_DEV=1`) |
| O8/O8b | loopback sem `EMAIL_DEV` / `EMAIL_DEV` sem checar loopback | mortos (3/1) |
| O9 | tira `toLowerCase` do host | sobreviveu: **equivalente** (`new URL` já normaliza) |
| O10 | `:31` tira o `if (o === null)` (Origin não analisável) | **sobreviveu** (viraria 500 em vez de 403; sem teste) |
| O11 | tira `exigirOrigemPropria` do `app.ts` | morto (12) |
| C1-C4 | tira `csp`, tira `politicaReferrer`, `Referrer-Policy` vira `no-referrer`, CSP vira `default-src *` | mortos (3/2/2/3) |
| H1-H4 | `host.ts`: sem `host`, sem `hostaddr`, sem `toLowerCase` da chave, laço vazio | mortos (4/1/1/5) |
| G1/G2 | migração sem o GRANT / com `USAGE` | mortos (2/1) |
| G3 | tira o `ALTER DEFAULT PRIVILEGES` | **sobreviveu** (não equivalente: efeito só em sequences futuras; sem teste) |
| X | `ci.yml` sem `audit`, `.gitleaks.toml` e `.gitignore` antigos juntos | **sobreviveu**: scripts 332/332 e raiz sem falha nova |

26 mutações: 21 mortas, 2 sobreviventes não equivalentes (O7, O10) e G3, X (config), 1 equivalente (O9). Árvore real sem alteração minha (`git status` igual; o `seguranca-validacao-r2.md` é do auditor).

## Gate (árvore `6816b49f`, gate informado pela sessão; `tasks.md` não tem linha `Gate:` da rodada)

Reaproveitado: lint, format, typecheck, checagens 134/134, contrato 567, dominio 668, scripts 332 (reconfirmado), web 1058, api worker 762, api banco 2880/2883 (push-backup x2: `pg_dump` 16 contra servidor 18, e o A-09 foi provado com `pg_dump` 18 acima; push-cpu: tempo), e2e 71/74. **Não constava no gate: `vitest run --dir test` da raiz** (parte de `pnpm test`). Rodei: 48/50 em cópia limpa; `dev.test.ts` FUN-04 falha só na cópia (`pnpm` recusa a junção) e passa na worktree real; **`readme.test.ts` FUN-51 falha de verdade** (A-15).

## Checagens de processo

(a) `testes.json` roda os 5 pacotes por `pnpm test`; sem `visual`. (b) typecheck: `ea28d59c`, `57d33dac`, `494243de` verdes em scripts, api, contrato (e web em `494243de`); HEAD verde (gate). (c) só `test/lint/*` ganhou timeout (motivo no commit `149f486b`, autorizado pelo próprio A-06); `host.test.ts` só acrescenta. (d) IDs de teste: ver A-19. (e) sem banco ou role `teste_*` órfão no 5451 (conferido depois dos mutantes). (f) a guarda de origem tem um teste por método (POST/PUT/PATCH/DELETE) e por variante (caixa, `none`, sem cabeçalho, `Origin: null`, GET/HEAD); sem policy nova. (g) spec × design: AD-133, AD-135 cobrem; sem `SPEC_DEVIATION` novo.

## Achados novos

| ID | `arquivo:linha` | Achado e evidência | Correção sugerida | Crit. |
|---|---|---|---|---|
| A-15 | `README.md:92` (faltam linhas), `.env.example:22-27`, `test/readme.test.ts` | O commit `494243de` pôs `PELADA_E2E_PORTA`, `_ASAAS` e `_PUSH` no `.env.example` sem citá-las no README: `readme.test.ts` FUN-51 falha ("expected README to contain `PELADA_E2E_PORTA`"), na worktree real e na cópia. `pnpm test` fica vermelho e a trava de deploy não libera (A-01, T81 item 3). O gate informado não listou o vitest da raiz | Acrescentar as 3 variáveis à tabela do README e rodar `pnpm test` inteiro | crítica |
| A-16 | `backend/api/test/rotas/host-origem.test.ts:103-117`, `origem-host.ts:31,34` | Mutantes O7 e O10 vivos: o teste do ramo `URL_PUBLICA` usa `URL_PUBLICA` loopback com `EMAIL_DEV=1` (o loopback já libera); nenhum teste manda `Origin` não analisável (`http://[`) esperando 403 | Teste com `URL_PUBLICA` não loopback, `Host` trocado e sem `EMAIL_DEV`, esperando 200; teste de `Origin: 'http://['` esperando 403 | comum (os dois ramos só endurecem: recusa a mais, nenhuma escrita indevida passa) |
| A-17 | `.github/workflows/ci.yml` (passo audit), `.gitleaks.toml:11-16`, `.gitignore:7-10` | Correções de A-13 e A-14 sem teste (mutação X sobrevive; `workflow-ci.test.ts` não cita `audit`) | Afirmar o passo `pnpm audit --prod` em `workflow-ci.test.ts` e que a allowlist do gitleaks não traz pasta nem `.specs`/`.claude` | comum |
| A-18 | `1794000000000_backup-sequences.sql:8`, `backup-sequences.test.ts` | Mutante G3 vivo: o `ALTER DEFAULT PRIVILEGES` (sequences futuras) não é provado | Teste que cria uma sequence com a role migradora em banco de teste e confere `SELECT` da role de backup | comum |
| A-19 | `host-origem.test.ts:42,51,62,...` | Os testes citam `FUN-22` (spec `:109`: só `no-store` e `nosniff`) para 403 por origem, CSP e Referrer; esses requisitos só existem na AD-135 | Citar `AD-135` nos nomes ou acrescentar o critério à spec | comum |

`validate_state.py` não rodado: lê o `validation.md`, que a sessão consolida.
