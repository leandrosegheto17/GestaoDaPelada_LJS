# Resultado: s2-owner-force-dump

- **Situação**: concluído
- **Tempo gasto**: cerca de 6 minutos de relógio (21:56 a 22:02), dentro do limite de 22:56 · **Tentativas**: 1 de 2

## O que foi feito

1. Servidor da branch: PostgreSQL 16.15. Duas versões de cliente: `pg_dump` 18.6 local e `pg_dump`/`pg_restore` 16 por Docker (`postgres:16`), este último é o da medição principal.
2. `preparar.sh` criou `s2_a`, `s2_b` e `s2_c` (`grupo_id`, `ENABLE` e `FORCE`), cada uma com 2 grupos (12, 14 e 10 linhas no total), e a role `s2_backup` (`LOGIN`, `NOBYPASSRLS`, `SELECT` nas tabelas, `USAGE` no schema `public`).
3. Controle sem policy: dump pela role de backup, restauração num Postgres 16 local descartável.
4. Policy `s2_backup_all ... FOR SELECT TO s2_backup USING (true)` nas 3 tabelas; novo dump com `--enable-row-security -Fc`; restauração no mesmo container.
5. Contagem de linhas na origem (como `neondb_owner`) e no restaurado.
6. A sessão refez o dump com policy do zero (`conf16.dump`), restaurou num container novo e recontou.

## Medições

| Medição | Valor | Condições | Comando | Conferida pela sessão |
|---|---|---|---|---|
| Linhas na origem, s2_a / s2_b / s2_c | 12 / 14 / 10 | como `neondb_owner`, sem contexto | `./conferir.sh origem` | sim |
| Controle sem policy: restaurado | 0 / 0 / 0, `pg_dump` exit 0 e `pg_restore` exit 0 | dump pela role de backup, `FORCE` ligado, sem policy | `./dump16.sh controle16.dump`; `./restaurar.sh controle16.dump`; `./conferir.sh restaurado` | não (policy já criada na branch; sem como refazer o controle sem recriar as tabelas) |
| Com policy, cliente 16: restaurado | 12 / 14 / 10 | `--enable-row-security`, policy `USING (true)` só para a role de backup | `./dump16.sh tratado16.dump`; `./restaurar.sh tratado16.dump`; `./conferir.sh restaurado` | sim: `./dump16.sh conf16.dump`, `./restaurar.sh conf16.dump` e `./conferir.sh restaurado` deram 12 / 14 / 10, `pg_dump` exit 0, `pg_restore` exit 0 |
| `pg_restore` com a role de backup ausente no destino | exit 1, `role "s2_backup" does not exist` nos 3 `CREATE POLICY`; dados voltam | destino sem a role | `./restaurar.sh tratado16.dump` antes de `create role s2_backup` | não reexecutado (observado pelo autor; a reexecução da sessão já criou a role) |
| `pg_dump` 18 com restauração por `pg_restore` 16 | falha: `unsupported version (1.16) in file header` | dump gerado pelo cliente 18 | `./dump.sh tratado18.dump` | não reexecutado |

Todos os comandos rodam na pasta `codigo/` do spike, com o container `s2-spike-pg` na porta 56432.

## Observações pedidas

- `rolbypassrls`: `neondb_owner` = true; role comum de teste e `s2_backup` = false (`select rolname, rolbypassrls from pg_roles ...`).
- `relrowsecurity` e `relforcerowsecurity`: true nas 3 tabelas (`select relname, relrowsecurity, relforcerowsecurity from pg_class where relname like 's2_%' and relkind = 'r'`).
- Com `FORCE` ligado e sem contexto, `neondb_owner` enxerga todas as linhas (12 / 14 / 10), porque tem `bypassrls`. Confirmado por query neste spike.

## Surpresas e obstáculos

- Sem policy para a role de backup, o dump com `FORCE` sai **vazio sem nenhum erro** (exit 0 e restaurado com 0 linhas). Um backup assim passaria no CI se ninguém conferir a contagem.
- O `.env` não pode ser lido com `source`: a URL tem `&` sem aspas. Os scripts leem com `grep` e `cut`.
- A porta 55432 estava ocupada por um container de outro projeto do usuário; foi usada a 56432. O outro container não foi tocado.
- O `pg_dump` 18 grava `SET transaction_timeout = 0`, que o Postgres 16 não conhece. O arquivo do cliente 18 só é lido pelo `pg_restore` 18, e o `pg_restore` 16 recusa o cabeçalho (versão 1.16). O dump do cliente 16 serve para os dois lados.
- Na branch já existem as roles `pelada_app` e `pelada_backup` (herdadas da branch de produção) com grants automáticos em tabelas novas. Sem `--no-owner --no-privileges`, a restauração local falha com `role does not exist`.
- O dump carrega `CREATE POLICY` e `GRANT` para a role de backup, que precisa existir no destino da restauração.

## Perguntas novas

- Na restauração real, as roles (backup e app) serão criadas antes, ou se usa `--no-policies` (só no `pg_restore` 18, e o dump perderia as policies)?
- Role de backup com `BYPASSRLS` ou dona da tabela: variante fora do escopo; não testada.
