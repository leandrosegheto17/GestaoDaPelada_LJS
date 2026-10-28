# ADR-031: PostgreSQL 18 em todo ambiente

- **Status:** Accepted (padronização do Neon entre os projetos)
- **Data:** 2026-10-28
- **Decisores:** usuário
- **Requisitos:** FUN-03, FUN-46
- **Supersedes:** o trecho de versão do ADR-024 (decisão 4, "a impressão digital do schema vem do PostgreSQL 16") e do ADR-025 (decisão 6, "um Postgres 16 de serviço"). O resto desses ADRs continua valendo.

## Contexto

O projeto fixava o PostgreSQL 16 no `docker compose`, nos serviços do CI e no cliente do `pg_dump` do backup. Os projetos irmãos usam versões diferentes, e o usuário decidiu um padrão único.

## Decisão

1. **PostgreSQL 18** no `docker compose` (`postgres:18`), nos serviços de banco do CI e no cliente do `pg_dump` do `dump-cifrado`.
2. No CI e no dump a imagem vai **fixada por digest** (índice multi-arch de `postgres:18`, `sha256:979bccfde35445db618c65107d27d08c6c21339d8dc3ad4c830c6633947be0e4`, consultado em 2026-10-28 com `docker buildx imagetools inspect`), como manda o SEC-004. O `checar-acoes-fixadas.mjs` continua conferindo.
3. A partir da 18, a imagem oficial guarda os dados em `/var/lib/postgresql/18/docker`. O volume do compose monta `/var/lib/postgresql` e ganha nome novo (`dados_db_18`), porque os dados da 16 não abrem na 18. Quem já tinha o banco local refaz com `pnpm migrar` e `pnpm seed`.
4. A restauração usa o `pg_restore` 18, a versão do `pg_dump` que gera os dumps. O `pg_restore` 18 também lê os dumps antigos, gerados pelo cliente 16.
5. O projeto do Neon também precisa estar no PostgreSQL 18. O Neon não muda a versão de um projeto existente: se o projeto atual for 16, a troca é uma ação manual do usuário (projeto novo no 18 e migração dos dados).

## Consequências

**Positivas**

- Uma versão só nos três projetos e em todos os ambientes.

**Negativas**

- Enquanto o Neon de produção estiver numa versão anterior, local e CI testam numa versão diferente da produção. O `pg_dump` 18 lê servidores mais antigos, mas um dump dele só restaura num servidor 18 sem avisos.
- O banco local precisa ser recriado.
