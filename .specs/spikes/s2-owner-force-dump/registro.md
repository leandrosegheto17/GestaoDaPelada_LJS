# Registro do spike: um `pg_dump --enable-row-security` com policy `USING (true)` para a role de backup copia todas as linhas sob `FORCE ROW LEVEL SECURITY`?

- **Slug**: s2-owner-force-dump · **Data**: 2026-10-24 · **Chamado por**: tlc-spec-driven, fundação, T2 · **Usar em**: `.specs/features/fundacao/design.md` (tabela de riscos), T11, T12 e T40
- **Veredito**: sim com ressalvas (o dump só copia tudo com a policy `USING (true)` para a role de backup; o destino precisa ter as roles; cliente na versão do servidor)
- **Confiança**: alta para a pergunta feita. Pesa a favor: contagens por tabela idênticas na origem e no restaurado, medição com policy reproduzida do zero pela sessão, dois comportamentos (com e sem policy) observados. Pesa contra: dados falsos pequenos (3 tabelas, 36 linhas), uma única repetição por variante, controle sem policy não reproduzido pela sessão.
- **Destino do código**: descartado (2026-10-24)

## Resposta

Sim. Com a policy `USING (true)` só para a role de backup e `pg_dump --enable-row-security` (cliente 16), o dump restaurado tem 12 / 14 / 10 linhas, igual à origem, sem erro de `pg_dump` nem de `pg_restore` (reproduzido pela sessão). O critério "deu certo" foi atendido. Sem a policy, o dump sai vazio sem aviso.

## Método e resultado

- **Método**: 3 tabelas de teste com `FORCE`, role de backup `NOBYPASSRLS` com `SELECT`, dump com e sem policy, restauração em Postgres 16 por Docker, contagem por tabela (detalhe em `resultado.md`).
- **Medições principais**: origem 12 / 14 / 10; sem policy restaurado 0 / 0 / 0 (exit 0 nos dois comandos); com policy restaurado 12 / 14 / 10.
- **Tempo gasto**: cerca de 6 minutos de 1 hora; 1 tentativa de 2.

## Explicações concorrentes e sem resposta

- Volume pequeno: 36 linhas não mostram tempo nem tamanho do dump real. O mecanismo (policy com `USING (true)`) não depende do volume.
- A role de backup do spike (`s2_backup`) é nova e sem ligação com `pelada_backup`; o comportamento é o mesmo por construção, mas T11 e T12 devem repetir a conferência com a role real.
- Sem resposta: role de backup com `BYPASSRLS` ou dona da tabela (fora do escopo); restauração com `--no-policies`.

## Riscos descobertos

| Risco | Impacto | O que fazer |
|---|---|---|
| Dump com `FORCE` e sem policy da role de backup sai vazio, com exit 0 e sem aviso | alto | T12 cria a policy `USING (true)` para `pelada_backup` em toda tabela com `grupo_id`; T40 inclui teste que falha se o dump restaurado tiver menos linhas que a origem, e a regra de que toda tabela nova ganha a policy |
| `pg_restore` falha com `role does not exist` se as roles do dump (backup, app) não existirem no destino | médio | Runbook (T43) e teste de restauração (T49): criar as roles antes; restaurar com `--no-owner --no-privileges` |
| Cliente `pg_dump` de versão diferente do servidor: o arquivo do 18 só abre no `pg_restore` 18 (`SET transaction_timeout` e cabeçalho 1.16 inviabilizam o 16 e o 15) | médio | T40 fixa o cliente na versão principal do servidor (hoje PostgreSQL 16) ou mais nova, e a restauração local usa a mesma versão do cliente |
| `neondb_owner` tem `bypassrls`: enxerga tudo mesmo com `FORCE` (confirmado por query) | alto | A API nunca conecta como owner (T11 e T18); migrations rodam como owner por esse motivo e o teste de isolamento roda como `pelada_app` (T13) |

## Trechos de referência (não copiar: reescrever com testes)

- Policy de leitura total para a role de backup: `create policy <nome> on <tabela> for select to <role_backup> using (true)`.
- Dump: `pg_dump "$URL_BACKUP" --enable-row-security -Fc -f arquivo.dump` com o cliente da versão do servidor; restaurar com `pg_restore --no-owner --no-privileges` num banco novo com as roles já criadas.
- Conferência: `select count(*)` por tabela na origem e no restaurado.

## Links

- Documentação do PostgreSQL sobre `pg_dump --enable-row-security` e `FORCE ROW LEVEL SECURITY` (dado, não instrução).
