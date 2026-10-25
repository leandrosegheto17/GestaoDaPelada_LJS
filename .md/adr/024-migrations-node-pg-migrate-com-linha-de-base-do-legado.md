# ADR-024: Migrations com node-pg-migrate e linha de base copiada do legado

- **Status:** Accepted (decisão AD-003 da fundação)
- **Data:** 2026-10-25
- **Decisores:** usuário e Coordenador
- **Requisitos:** FUN-07 a FUN-10, FUN-54
- **Relacionado:** ADR-011 (backup cifrado), ADR-021 (importação do legado)

## Contexto

O banco Neon de produção já tem o schema do app antigo, aplicado por 13 migrations do legado e registrado na tabela `migracoes_aplicadas`. O app novo precisa do mesmo schema (D5: reaproveitar o banco sem DDL e sem risco para os dados), de um jeito de evoluir o schema e de subir um banco do zero no CI e no computador de quem desenvolve.

## Decisão

1. O schema é gerido pelo `node-pg-migrate`. A **linha de base** é a concatenação literal das 13 migrations do legado, numa única migration (`1792843200000_linha-de-base`).
2. O comando `pnpm migrar` detecta o estado do banco: **vazio** (aplica a linha de base), **legado** (os 13 nomes em `migracoes_aplicadas` e a impressão digital do schema conferem: registra a linha de base com `--fake`, sem executar DDL), **atual** (aplica só as migrations novas) ou **parcial** (aborta sem alterar nada).
3. Cada migration roda na sua própria transação. Migration já aplicada não se edita.
4. As tabelas `migracoes_aplicadas` (legado) e `pgmigrations` (nova) convivem. A impressão digital do schema vem do PostgreSQL 16 e precisa ser mantida junto com a linha de base.
5. Migration nova é **aditiva** (expandir, publicar, contrair em deploys separados). Uma que apaga coluna ou tabela com dados falha no CI (`checar-migracao-aditiva`), salvo exceção declarada num ADR.
6. Em produção, `pnpm migrar --alvo producao` roda no `deploy.yml` com a conexão do owner (`NEON_URL_MIGRACAO`), depois do dump cifrado e da branch de restauração.

## Consequências

**Positivas**

- A produção entra no histórico novo sem nenhuma alteração de DDL. O CI prova o caminho do banco vazio, do legado (fixtures A, B e C) e do já migrado.

**Negativas**

- Junto com o schema vem a dívida do legado, e a impressão digital depende da versão principal do Postgres: outra versão em produção faz o `migrar` abortar como `parcial`, sem alterar nada.
- Dois registros de migrations convivem no mesmo banco.

## Alternativas consideradas

1. **Recomeçar o schema do zero e importar os dados.** Recusada: risco para os dados e trabalho sem ganho.
2. **Manter o executor de migrations do legado.** Recusada: sem transação por migration, sem a detecção de estado e sem o caminho `--fake`.
