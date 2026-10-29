# ADR-034: Imagem do Postgres pela tag oficial `postgres:18`, sem digest

- **Status:** Accepted (padronização do Neon entre os projetos)
- **Data:** 2026-10-28
- **Decisores:** usuário
- **Requisitos:** FUN-03, FUN-46
- **Supersedes:** a decisão 2 do ADR-031 (imagem fixada por digest) e, só para a imagem `postgres:18`, a regra do SEC-004 de toda imagem Docker por digest. O resto do ADR-031 e do SEC-004 continua valendo.

## Contexto

O ADR-031 fixou o `postgres:18` por digest no CI e no dump cifrado, como o SEC-004 pede para toda imagem Docker. Os três projetos irmãos precisam da mesma referência, e o digest muda a cada atualização da imagem oficial. O usuário decidiu usar a tag em todos eles.

## Decisão

1. O `docker compose`, os serviços de banco do CI e o `pg_dump` do `dump-cifrado` usam a tag oficial **`postgres:18`**, sem digest.
2. O `checar-acoes-fixadas.mjs` aceita `postgres:18` pela tag exata. Qualquer outra imagem, inclusive `postgres:18-alpine`, `postgres:latest`, `postgres` sem tag ou um `postgres:18` de outro registro, continua exigindo digest.

## Consequências

**Positivas**

- A mesma referência nos três projetos; as correções da série 18 chegam sem trocar digest.

**Negativas**

- Uma tag trocada no registro do Docker Hub passaria a rodar no CI e no dump, que recebe a URL do banco (o risco que o SEC-004 cobria). O risco é aceito pelo usuário, por ser a imagem oficial.
- O CI pode mudar de versão secundária (18.x) sem commit.
