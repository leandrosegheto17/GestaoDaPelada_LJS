# ADR-025: Isolamento entre grupos por RLS com FORCE e contexto por transação

- **Status:** Accepted (decisão AD-004 da fundação)
- **Data:** 2026-10-25
- **Decisores:** usuário e Coordenador
- **Requisitos:** FUN-11 a FUN-18
- **Complementa:** ADR-005 (isolamento na camada de repositório). A camada de repositório continua; a RLS é a segunda barreira, no banco.

## Contexto

O ADR-005 isola os grupos só no código da aplicação: um repositório que esqueça o filtro por `grupo_id` vaza dados de outro grupo. O padrão LJS pede uma barreira no banco. O Worker acessa o Postgres pelo Hyperdrive, que reaproveita conexões, então o contexto da requisição não pode ficar na sessão do banco.

## Decisão

1. Toda tabela com `grupo_id` tem RLS **habilitada e com `FORCE`**. A policy filtra por `grupo_id`.
2. O contexto da requisição vai por `set_config('app.conta_id' | 'app.slug_publico', valor, true)` numa **transação por requisição** (`true` = local à transação). Nada fica na sessão depois do `COMMIT`.
3. A visibilidade vem de `grupos_visiveis()`, função `SECURITY DEFINER`, o que evita a recursão de policy em `vinculos_admin`. A escrita exige conta.
4. O runtime conecta como `pelada_app` (`NOBYPASSRLS`, sem DDL, sem `TRUNCATE`). A role de backup `pelada_backup` tem `SELECT` e uma policy de leitura própria em cada tabela com RLS. O owner do Neon tem `bypassrls`, então a API nunca conecta como owner e a origem do Hyperdrive é sempre `pelada_app`, com o cache desligado.
5. Tabelas sem `grupo_id` (conta, sessão, login, reset) ficam sem grant até a feature `conta-e-acesso`, que define a RLS própria delas. `auditoria` e `eventos_uso` têm `grupo_id` e entram na RLS.
6. O CI prova o isolamento num Postgres 16 de serviço: o teste lista as rotas e falha se alguma não tiver caso, e os testes de RLS usam `pelada_app` de verdade.

## Consequências

**Positivas**

- Um filtro esquecido no código não vaza dado. O backup não sai vazio em silêncio (a policy de leitura é testada).

**Negativas**

- Depende de o contexto se manter pelo Hyperdrive (provado no spike S1, conferido no deploy). `comBanco` abre a transação na primeira consulta, e a busca da sessão acontece antes de existir conta: a `conta-e-acesso` precisa tratar isso.
- `pg_dump` com `FORCE` sem policy de leitura sai vazio com código de saída 0 (spike S2): o runbook confere a contagem restaurada contra a origem.

## Alternativas consideradas

1. **Só filtro no repositório (ADR-005).** Recusada: uma barreira só.
2. **Uma role ou um schema por grupo.** Recusada: não escala com o Hyperdrive nem com o plano gratuito do Neon.
3. **Contexto na sessão (`SET`, não `SET LOCAL`).** Recusada: conexões reaproveitadas vazariam o contexto entre requisições.
