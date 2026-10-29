# ADR-033: Tempo limite de 8 s na conexão da transação da requisição, sem nova tentativa

- **Status:** Accepted (padronização do Neon entre os projetos)
- **Data:** 2026-10-28
- **Decisores:** usuário
- **Requisitos:** FUN-16
- **Supersedes:** nenhum. Completa o ADR-025 (contexto por transação) e o ADR-029 (sessão em transação própria), que usam a mesma transação.

## Contexto

A transação da requisição (`transacao-da-requisicao.ts`) abre um `pg.Client` pelo Hyperdrive na primeira consulta. O `pg` não tem tempo limite de conexão por padrão: com o Neon acordando devagar ou o Hyperdrive sem resposta, a requisição fica presa até o Worker ser encerrado, e o usuário espera sem retorno. O usuário decidiu um padrão único para os projetos.

## Decisão

1. O `pg.Client` da transação da requisição usa `connectionTimeoutMillis: 8000` (`TEMPO_LIMITE_CONEXAO_MS`). Passando disso, a consulta falha, a transação não abre e a rota responde com erro, como em qualquer falha de banco.
2. **Sem nova tentativa** (retry): uma segunda conexão dobraria a espera e a carga no Neon justo quando ele está lento. Quem repete é a pessoa, pela tela.
3. O valor cobre o despertar do Neon no plano gratuito (cerca de 0,5 a 1 s, SDD) com folga, e fica abaixo do tempo em que a pessoa desiste da tela.

## Consequências

**Positivas**

- Falha rápida e previsível com o banco fora do ar; o Worker não acumula conexões presas.

**Negativas**

- Num despertar do Neon acima de 8 s, a primeira requisição falha e a pessoa precisa tentar de novo.
