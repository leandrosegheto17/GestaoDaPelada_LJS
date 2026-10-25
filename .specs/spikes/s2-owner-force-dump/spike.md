# Spike: um `pg_dump --enable-row-security` com policy `USING (true)` para a role de backup copia todas as linhas sob `FORCE ROW LEVEL SECURITY`?

- **Slug**: s2-owner-force-dump · **Data**: 2026-10-24
- **Chamado por**: tlc-spec-driven, fundação, tarefa T2 (riscos S2 do design)
- **Usar em**: `.specs/features/fundacao/design.md` (tabela de riscos, linhas do `neondb_owner` e do `pg_dump`), T11 (roles), T12 (policies) e T40 (backup)
- **Preparação aprovada**: sim (2026-10-24)

## Pergunta

Numa tabela com `ENABLE` e `FORCE ROW LEVEL SECURITY`, o dump feito por uma role de backup só de leitura, com policy `USING (true)` e `pg_dump --enable-row-security`, restaura todas as linhas de todos os grupos?

- **Por que importa**: o backup diário (FUN-46 e FUN-47) é a rede de segurança da migração. Um dump que sai calado e incompleto seria pior que nenhum.
- **Por que é spike**: motivo 2. O efeito de `FORCE` sobre o owner do Neon e sobre o `pg_dump` só se conhece rodando.
- **Registrar também, como observação e sem mudar o critério**: `rolbypassrls` de `neondb_owner` e de uma role comum, `relforcerowsecurity` da tabela, e quantas linhas `neondb_owner` enxerga com `FORCE` ligado e sem contexto.

## Critério de sucesso (congelado na aprovação)

- **Deu certo**: dump em formato custom pela role de backup, restaurado num Postgres local, tem a mesma contagem de linhas que a origem em todas as tabelas de teste (2 grupos, 3 tabelas, pelo menos 5 linhas por grupo), sem erro de `pg_dump` nem de `pg_restore`.
- **Deu errado**: a contagem restaurada é menor que a da origem em qualquer tabela, ou o `pg_dump` falha por permissão com a role de backup mesmo com a policy.
- **Inconclusivo**: não há cliente `pg_dump` e `pg_restore` de versão compatível com o Postgres do Neon, ou o Postgres local de restauração não sobe.
- **Resultado que provaria que não**: restauração com menos linhas do que a origem, comparando as contagens por tabela.
- **Condições da medição**: branch Neon descartável `spike-descartavel`; role de backup criada na branch com `SELECT` e policy `USING (true)`; dados falsos; cliente `pg_dump` da mesma versão principal do servidor; restauração em Postgres 16 local por Docker; uma repetição por variante (com policy, e sem policy como controle).

## Prazo e método

- **Prazo**: 1 hora e 2 tentativas, o que vier primeiro (escolha do usuário, 2026-10-24)
- **Início**: 2026-10-24 21:56 · **Limite**: 2026-10-24 22:56
- **Extensão**: nenhuma
- **Método**: (1) na branch descartável, ler `rolbypassrls` e `relforcerowsecurity`; (2) criar 3 tabelas com `grupo_id`, `ENABLE` e `FORCE`, e dados de 2 grupos; (3) contar linhas como `neondb_owner` sem contexto; (4) criar a role de backup e, primeiro sem policy, fazer o dump como controle; (5) criar a policy `USING (true)` só para essa role e refazer o dump com `--enable-row-security`; (6) restaurar no Postgres local e comparar contagens por tabela.
- **Onde roda**: `.specs/spikes/s2-owner-force-dump/codigo/` (fora do git)
- **Ações externas**: conexão com a branch Neon descartável (confirmada em 2026-10-24); apagar a branch ao final (confirmar antes, junto com o S1).

## A esclarecer

- Nenhum ponto em aberto.
