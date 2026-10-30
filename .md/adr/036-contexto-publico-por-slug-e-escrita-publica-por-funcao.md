# ADR-036: Contexto público por slug e escrita pública só por função do banco

- **Status:** Accepted
- **Data:** 2026-10-30
- **Decisores:** usuário
- **Requisitos:** PAR das histórias de ranking público, grupo indisponível e registro anônimo de uso (feature `partidas-e-ranking`); débito I-3 do THREAT-MODEL
- **Supersedes:** nenhum. Complementa o ADR-025 (contexto por transação) e o AD-004, e segue o padrão de funções `SECURITY DEFINER` do ADR-029 e do ADR-035.

## Contexto

A `partidas-e-ranking` cria as primeiras rotas sem login: o ranking `/api/publico/:slug/...`, o PDF e os eventos
anônimos de uso. O `com-banco.ts` já põe `app.slug_publico` na transação, mas também põe `app.conta_id` quando há
sessão. Com as duas no contexto, um admin logado cai no ramo com conta de `grupos_visiveis()` e recebe 404 no ranking
de um grupo de que não é admin. O ramo do slug também não filtra o grupo arquivado (I-3). Pelo AD-004, o contexto do
slug nunca escreve, mas o evento `ranking_aberto` precisa ser gravado sem conta.

## Decisão

1. Toda rota `/api/publico/:slug/*` passa pelo middleware `contextoPublico`, que tira a conta do contexto e põe só o
   slug. A transação é `READ ONLY`.
2. Uma migration nova, aditiva, faz o ramo do slug de `grupos_visiveis()` ignorar o grupo arquivado. Slug
   malformado, inexistente ou de grupo arquivado têm a mesma resposta 404, e a tela mostra "Grupo indisponível".
3. A única escrita pública é a função `evento_publico_registrar` (`SECURITY DEFINER`, `search_path` fixo, `EXECUTE`
   só para o `pelada_app`). Ela acha o grupo ativo pelo slug e insere só aquela linha em `eventos_uso`, com o momento
   vindo do `Relogio` da API.
4. A RLS continua sem policy de escrita para o contexto do slug, e `eventos_uso` passa a ser lida só com conta.

Alternativa recusada: uma policy de INSERT em `eventos_uso` para o contexto do slug. Abriria uma exceção à regra "slug
nunca escreve", e o teste de isolamento teria de provar que ela não vale para outras tabelas.

## Consequências

**Positivas**

- O admin logado vê o ranking público de qualquer grupo como um visitante.
- Grupo arquivado some também do link público, sem código na aplicação.
- Nenhuma tabela aceita escrita pelo slug. A função é o único caminho, e só faz um tipo de inserção.

**Negativas**

- Mais SQL nas migrations e mais um teste de RLS por tabela no ramo público.
- O contexto público ignora a sessão, mesmo para quem é admin daquele grupo. O que é de admin fica nas rotas com conta.
