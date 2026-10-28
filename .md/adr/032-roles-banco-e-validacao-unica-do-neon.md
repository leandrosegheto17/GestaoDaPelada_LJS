# ADR-032: Roles e banco padronizados no Neon, variáveis por destino e validação única da URL

- **Status:** Accepted (padronização do Neon entre os projetos)
- **Data:** 2026-10-28
- **Decisores:** usuário
- **Requisitos:** FUN-05, FUN-11, FUN-18, FUN-46
- **Supersedes:** o nome da role de backup (`pelada_backup`) do ADR-025 (decisão 4), que passa a ser `pelada_backup_ro`. O resto do ADR-025 continua valendo.

## Contexto

Os projetos irmãos davam nomes diferentes às roles, ao database e às variáveis de conexão do Neon, e cada caminho que tocava o Neon conferia a URL de um jeito (ou não conferia). O usuário decidiu um padrão único.

## Decisão

1. **Roles** no padrão `<projeto>_owner`, `<projeto>_app` e `<projeto>_backup_ro`; aqui, `pelada_owner` (dono do schema, faz DDL e migração; no Neon tem `bypassrls`), `pelada_app` (runtime, origem do Hyperdrive) e `pelada_backup_ro` (somente leitura, backup). `pelada_app` e `pelada_backup_ro` são `NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION` ao nascer; a senha de login é definida fora do repositório.
2. A role de backup se chamava `pelada_backup`. As migrations antigas não são editadas: a migration `1792844220000_roles-padronizadas` faz `ALTER ROLE pelada_backup RENAME TO pelada_backup_ro` (a senha SCRAM, os grants e as policies seguem a role). Num servidor compartilhado por vários bancos (testes), ela passa os grants e as policies do banco para `pelada_backup_ro`.
3. **Database** do Neon: `pelada`, o mesmo nas branches `main` e `dev` (ADR-030). O banco local do `docker compose` também se chama `pelada`; os testes usam bancos temporários `teste_<aleatório>` no servidor de `DATABASE_URL_TESTE`.
4. **Variáveis:** `NEON_URL_*` para toda conexão com o Neon e `DATABASE_URL`/`DATABASE_URL_TESTE` só para o banco local e o de teste:
   - `NEON_URL_MIGRACAO`: `pelada_owner` na `main` (deploy e `pnpm migrar`/`pnpm dono` com `--alvo producao`);
   - `NEON_URL_BACKUP`: `pelada_backup_ro` na `main` (backup diário);
   - `NEON_URL_DEV`: `pelada_owner` na `dev` (`--alvo teste`: migração de ensaio e restauração);
   - `NEON_URL_ORIGEM`: a `main`, para a restauração conferir que o destino não é a produção.
   A origem do Hyperdrive (`pelada_app` na `main`) fica na configuração do Hyperdrive, não em variável.
5. **Validação única** (`backend/api/src/infraestrutura/seguranca/url-neon.ts`), usada em todo caminho que toca o Neon: `pnpm migrar` e `pnpm dono` com `--alvo`, `pnpm restaurar` com destino remoto, o dump cifrado (backup e deploy, pela action `dump-cifrado`) e a origem do Hyperdrive (no deploy). Recusa host local, host fora de `.neon.tech`, host do pooler (`-pooler`), URL sem TLS (`sslmode` precisa ser `require`, `verify-ca` ou `verify-full`), parâmetro de consulta fora da lista (`sslmode`, `channel_binding`, `connect_timeout`, `application_name`), database diferente de `pelada` e usuário diferente da role do papel. Nenhuma mensagem traz a URL ou a senha. A trava de host (`trava-host.ts`) continua: ela decide se um host remoto pode ser usado (`--alvo` e confirmação); a validação decide se o destino remoto é o Neon certo.

## Consequências

**Positivas**

- O mesmo padrão nos três projetos; um erro de secret (pooler, sem TLS, role ou banco trocados) para o deploy ou o backup antes de conectar.

**Negativas**

- Ações manuais no Neon e no GitHub antes do próximo deploy: a role owner precisa se chamar `pelada_owner`, o database `pelada`, e os secrets precisam usar esses nomes e a conexão direta com `sslmode=require` (runbook, seção 2.2).
- Um backup antigo (antes da renomeação) traz policies `TO pelada_backup`: para restaurá-lo, a role `pelada_backup` precisa existir no destino (runbook, seção 4).
