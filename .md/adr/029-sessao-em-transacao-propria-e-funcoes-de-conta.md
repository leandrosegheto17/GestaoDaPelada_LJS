# ADR-029: Sessão numa transação própria e operações de conta por funções SECURITY DEFINER

- **Status:** Accepted (design da `conta-e-acesso`, AD-007 e AD-008)
- **Data:** 2026-10-27
- **Decisores:** usuário (AD-008, fase 7 da feature); coordenador (AD-007)
- **Requisitos:** ACE-11 a ACE-14, ACE-21, ACE-43 a ACE-47, ACE-63, ACE-69
- **Supersedes:** nenhum. Completa o ADR-025 (isolamento por RLS com contexto por transação), que deixou em aberto como achar a conta antes de existir contexto, e altera a regra G-02 (o `crypt` sai do repositório e passa a morar nas funções das migrations).

## Contexto

O ADR-025 isola os dados por RLS com `FORCE`: cada requisição abre uma transação com `app.conta_id` e `app.grupo_id` e o banco recusa o que não é do contexto. Duas situações ficaram de fora:

1. **A sessão.** O cookie `__Host-sessao` traz um token, e só depois de achar a sessão se sabe qual é a conta. A busca acontece antes de existir contexto. Além disso, a renovação da inatividade escreve no banco, e o FUN-16 mantém GET e HEAD em `READ ONLY`.
2. **Operações sem sessão** (entrar, cadastro, confirmação, recuperação de senha, convites). Elas procuram uma conta que o chamador ainda não é. Dar ao `pelada_app` leitura da tabela de contas quebraria o isolamento, e o hash de senha nunca pode chegar ao Worker.

## Decisão

1. **A sessão é resolvida numa transação curta própria** (`sessao_tocar`, via `emTransacaoPropria`), **antes** do `comBanco` da rota. A transação da rota já abre com `app.conta_id` preenchido e as leituras continuam `READ ONLY` (AD-007).
2. **A mesma transação própria** serve ao que precisa ficar gravado numa resposta 4xx: a contagem de falhas de login que alimenta o bloqueio (ACE-13). Ela confirma mesmo quando a resposta da rota é de erro, abre a conexão na primeira consulta e a fecha antes de devolver.
3. **Toda operação que acha uma conta sem sessão passa por função `SECURITY DEFINER` com `search_path` fixo** (cadastro, links, entrar, senha, exclusão, convites e a listagem de admins). O `pelada_app` tem só `EXECUTE` nelas e nunca lê a linha de outra conta nem um hash de senha (AD-008). Funções de leitura e escrita são migrations novas e aditivas (G-14), nunca edições de migration já aplicada.
4. **O hash bcrypt (`crypt`) mora só nessas funções.** O repositório de contas chama a função e passa a senha como parâmetro; nenhuma biblioteca de hash entra no Worker (G-08). A G-02 é alterada no GUARDRAILS e um teste procura `crypt(` fora das migrations.
5. **O papel de dono nunca é escrito por rota** (G-11, ACE-63): só `backend/scripts/dono.ts` chama a função de definir senha como owner, e uma regra ESLint (`pelada/sem-escrita-dono`) proíbe a escrita em `backend/api/src/**`.

## Consequências

**Positivas**

- O isolamento continua no banco: nem um bug de rota deixa o `pelada_app` ler a conta de outra pessoa ou um hash de senha.
- A falha de login é gravada mesmo na resposta 401 ou 429, então o bloqueio por tentativas não depende da transação da rota.
- As funções têm testes de cada ramo de resultado (`backend/api/test/migracoes/funcoes-definer.test.ts` e os testes por migration).

**Negativas**

- Duas idas ao banco por requisição autenticada (sessão e rota). O custo de CPU é medido no deploy (G-12).
- Mais SQL nas migrations, e a lógica de conta fica dividida entre SQL e TypeScript.
- Cada função nova precisa de `EXECUTE` concedido, `search_path` fixo e teste; esquecer um deles é o risco principal, coberto pelos testes de migração.

## Alternativas consideradas

1. **Dar ao `pelada_app` leitura da tabela de contas com uma policy própria.** Recusada: expõe a linha de outra conta e o hash a qualquer bug de SQL no Worker.
2. **Resolver a sessão dentro da transação da rota.** Recusada: a renovação da inatividade escreve, e GET e HEAD ficam `READ ONLY` (FUN-16); também não existiria conta no contexto para a RLS.
3. **Calcular o hash no Worker (biblioteca de bcrypt).** Recusada: custa CPU do Worker (G-12) e contraria o ADR-015, que fixa o hash no Postgres.
