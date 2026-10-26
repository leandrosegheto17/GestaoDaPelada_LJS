# Spike: o contexto de RLS definido por transação sobrevive ao Hyperdrive sem vazar entre requisições?

- **Slug**: s1-contexto-rls · **Data**: 2026-10-24
- **Chamado por**: tlc-spec-driven, fundação, tarefa T1 (risco S1 do design)
- **Usar em**: `.specs/features/fundacao/design.md` (tabela de riscos, linha do `set_config`) e T18 (`comBanco`)
- **Preparação aprovada**: sim (2026-10-24)

## Pergunta

Com `BEGIN` e `set_config('app.conta_id', <id>, true)` dentro de uma transação por requisição, pelo Hyperdrive remoto sem cache, 20 requisições concorrentes de duas contas diferentes enxergam cada uma só o contexto da própria conta, sem nunca ver o da outra?

- **Por que importa**: o isolamento entre grupos (FUN-12 a FUN-18) depende de o contexto de RLS ser por transação. Se ele vazar entre requisições, a RLS entrega dado de um grupo para outro.
- **Por que é spike**: motivo 2. O comportamento do Hyperdrive em modo transação com `set_config` local só se conhece rodando; a documentação não confirma.

## Critério de sucesso (congelado na aprovação)

- **Deu certo**: em 5 rodadas de 20 requisições concorrentes (10 da conta A e 10 da conta B, intercaladas), 100 por cento das respostas devolvem o `app.conta_id` enviado por elas e só as linhas da própria conta numa tabela de teste com RLS `FORCE`. Zero respostas com contexto trocado ou vazio.
- **Deu errado**: pelo menos 1 resposta, em qualquer rodada, com o contexto da outra conta, ou com contexto vazio dentro de uma transação que o definiu, reproduzida numa segunda rodada.
- **Inconclusivo**: mais de 5 por cento das requisições falham por rede ou erro de infraestrutura, ou não se consegue provar que as requisições dividiram conexões no Hyperdrive (ex.: um segundo ponto de vista, como `pg_stat_activity` na branch, mostra uma conexão por requisição sem reuso).
- **Resultado que provaria que não**: uma única resposta da conta A com `app.conta_id` da conta B, ou com as linhas do grupo B.
- **Condições da medição**: branch Neon descartável `spike-descartavel`; Hyperdrive `spike-s1` com cache desligado; Worker de teste remoto; dados falsos (2 contas, 2 grupos, 5 linhas por grupo); 5 repetições; os mesmos IDs de conta reaproveitados entre rodadas para provocar reuso de conexão.

## Prazo e método

- **Prazo**: 1 hora e 2 tentativas, o que vier primeiro (escolha do usuário, 2026-10-24)
- **Início**: 2026-10-24 21:50 · **Limite**: 2026-10-24 22:50
- **Extensão**: nenhuma
- **Método**: (1) na branch descartável, criar tabela de teste com `grupo_id`, policy lendo `current_setting('app.conta_id', true)` e `FORCE ROW LEVEL SECURITY`; (2) Worker mínimo com `pg` que abre transação, chama `set_config(..., true)` com parâmetro, espera um atraso curto aleatório (para forçar sobreposição), lê a tabela e devolve `current_setting` e as linhas; (3) tentar `wrangler dev --remote` com o binding do Hyperdrive; só se não funcionar, publicar um Worker de teste (com confirmação); (4) disparar as rodadas concorrentes e registrar cada resposta; (5) se reprovar, repetir com conexão direta sem pooling (`pg.Client` com `ssl`), que é o fallback do design.
- **Onde roda**: `.specs/spikes/s1-contexto-rls/codigo/` (fora do git)
- **Ações externas**: conexão com a branch Neon descartável (confirmada pelo usuário em 2026-10-24); publicar Worker de teste, se o `wrangler dev --remote` não servir (confirmar antes); apagar a branch e o Hyperdrive ao final (confirmar antes).

## A esclarecer

- Nenhum ponto em aberto.
