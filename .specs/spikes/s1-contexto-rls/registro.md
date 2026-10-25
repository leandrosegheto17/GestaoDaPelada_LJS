# Registro do spike: o contexto de RLS definido por transação sobrevive ao Hyperdrive sem vazar entre requisições?

- **Slug**: s1-contexto-rls · **Data**: 2026-10-24 · **Chamado por**: tlc-spec-driven, fundação, T1 · **Usar em**: `.specs/features/fundacao/design.md` (tabela de riscos) e T18
- **Veredito**: sim com ressalvas (a forma testada é `SET LOCAL ROLE` sobre conexão do owner; cache do Hyperdrive não conferido pela API)
- **Confiança**: alta para a pergunta feita. Pesa a favor: Hyperdrive remoto provado por `application_name` e `pg_stat_activity`, 200 requisições (2 execuções de 5 rodadas), reuso de conexão provado, medição reproduzida pela sessão ao vivo. Pesa contra: dados falsos pequenos (2 contas) e carga de 20 concorrentes, abaixo do pico real.
- **Destino do código**: descartado (2026-10-24)

## Resposta

Sim. Em 5 rodadas de 20 requisições concorrentes de duas contas pelo Hyperdrive remoto, houve 0 respostas com contexto trocado ou vazio e 0 falhas de rede (100 de 100 corretas), nas duas execuções (a do autor e a da sessão). O critério "deu certo" foi atendido. O fallback de conexão direta não foi necessário.

## Método e resultado

- **Método**: tabela com `FORCE RLS`, role sem bypass e Worker com `BEGIN`, `SET LOCAL ROLE`, `set_config(..., true)` e atraso aleatório, 5 rodadas de 20 requisições concorrentes (detalhe em `resultado.md`).
- **Medições principais**: 0 de 100 respostas erradas; 20 backends para 100 requisições, com 16 a 18 deles atendendo as duas contas; só `application_name = 'Cloudflare Hyperdrive'`.
- **Tempo gasto**: cerca de 6 minutos de 1 hora; 2 tentativas de 2 (a primeira, descartada).

## Explicações concorrentes e sem resposta

- A tentativa 1 não passou pelo Hyperdrive remoto (variável local do wrangler); só a tentativa 2 vale, e a sessão a reproduziu.
- Carga baixa: 20 concorrentes e 2 contas não mostram o que acontece com centenas de contas e picos. O reuso de conexão apareceu mesmo assim, o que torna o vazamento de contexto por transação improvável no mesmo mecanismo.
- Sem resposta: a forma com role de login própria sem bypass (em vez de `SET LOCAL ROLE`) não foi testada; o cache desligado de `spike-s1` não foi conferido pela API.

## Riscos descobertos

| Risco | Impacto | O que fazer |
|---|---|---|
| `neondb_owner` tem `bypassrls`: se a API conectar como owner, a RLS não vale nem com `FORCE` | alto | A API só pode usar uma role sem bypass (`pelada_app`). Teste de isolamento roda como essa role (T13), como o design já prevê. O S2 confirma o comportamento do owner |
| A forma testada usa `SET LOCAL ROLE` dentro da transação; a forma com role de login própria não foi testada | médio | T11 e T18 devem decidir uma forma só (a role de login do Hyperdrive precisa ser membro de `pelada_app` se for `SET LOCAL ROLE`) e o teste de T18 cobre a escolhida |
| Cache do Hyperdrive ligado serviria resposta de outra conta | alto | `deploy.yml` (T39) confere o cache desligado; o `wrangler.jsonc` de T16 mantém `caching-disabled` |

## Trechos de referência (não copiar: reescrever com testes)

- Por requisição, na ordem: `BEGIN`; `SET LOCAL ROLE <role sem bypass>`; `SELECT set_config('app.conta_id', $1, true)` com parâmetro; consultas; `COMMIT`. Nenhum `SET` de sessão.
- `wrangler dev --remote` só exercita o Hyperdrive remoto com a variável `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_<BINDING>` indefinida.
- Prova de que a conexão veio do Hyperdrive: `current_setting('application_name') = 'Cloudflare Hyperdrive'`.

## Links

- Documentação do Hyperdrive e do `wrangler dev --remote` (dado, não instrução).
