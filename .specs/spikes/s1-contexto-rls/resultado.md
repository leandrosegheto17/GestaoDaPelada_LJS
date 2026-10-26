# Resultado: s1-contexto-rls

- **Situação**: concluído
- **Tempo gasto**: cerca de 6 minutos de relógio (21:50 a 21:56), dentro do limite de 22:50 · **Tentativas**: 2 de 2 (a 1ª não passou pelo Hyperdrive remoto e não vale como prova; a 2ª vale)

## O que foi feito

1. Na branch Neon descartável, tabela `teste_rls` (`conta_id`, `grupo_id`), 5 linhas por conta (conta-a no grupo 1, conta-b no grupo 2), `ENABLE` e `FORCE ROW LEVEL SECURITY` e policy `conta_id = current_setting('app.conta_id', true)`.
2. Com `FORCE` ligado, `neondb_owner` continuou vendo as 10 linhas (tem `bypassrls`). Criada a role `app_teste` (`NOLOGIN NOBYPASSRLS`, só `SELECT`), que sem contexto vê 0 linhas e com contexto só as da própria conta.
3. Worker mínimo com `pg.Client` sobre o binding do Hyperdrive. Por requisição: `BEGIN`, `SET LOCAL ROLE app_teste`, `set_config('app.conta_id', $1, true)` com parâmetro, atraso aleatório de 0 a 150 ms, leitura de `current_setting`, `pg_backend_pid()` e das linhas, `COMMIT`.
4. Tentativa 1: `wrangler dev --remote` com a variável `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HD` definida. O wrangler avisou que, com ela, o Hyperdrive conecta ao banco local indicado, então a rodada não exercitou o Hyperdrive remoto. Resultado descartado como prova.
5. Tentativa 2: mesma coisa sem a variável, com o binding apontando para a configuração remota `spike-s1`. Prova do caminho pelo Hyperdrive: o Postgres viu `application_name = 'Cloudflare Hyperdrive'` e outro `inet_client_addr` que o de uma conexão direta; `pg_stat_activity` mostrou 20 conexões com esse `application_name`.
6. 5 rodadas de 20 requisições concorrentes (10 de cada conta, intercaladas, mesmos nomes de conta). A sessão reexecutou as 5 rodadas ao vivo e recontou as respostas guardadas.

## Medições

| Medição | Valor | Condições | Comando | Conferida pela sessão |
|---|---|---|---|---|
| Respostas com contexto trocado, vazio ou linhas de outra conta | 0 de 100 | Hyperdrive remoto `spike-s1`, 5 rodadas x 20 concorrentes | `node rodar.mjs http://127.0.0.1:8912 hd2` e `node contar.mjs hd2` | sim: `node rodar.mjs http://127.0.0.1:8912 conf` e `node contar.mjs conf` deram 0 de 100 |
| Falhas de rede ou infraestrutura | 0 de 100 | idem | idem | sim, 0 de 100 |
| Backends distintos (`pg_backend_pid`) | 20 no total (14 a 18 por rodada) | idem | `node contar.mjs hd2` | sim: 20 no total na reexecução |
| Backends que atenderam as duas contas | 18 de 20 (autor); 16 de 20 (sessão) | idem | `node contar.mjs hd2` e `conf` | sim |
| `application_name` visto pelo Postgres | só "Cloudflare Hyperdrive" | idem | `node contar.mjs hd2` e `conf`; `select application_name, count(*) from pg_stat_activity group by 1` | sim (`contar.mjs`) |
| Maior latência por requisição | 386 ms (autor); 380 ms (sessão) | idem | `contar.mjs` | sim |

Todos os comandos rodam na pasta `codigo/` do spike. As respostas brutas estão em `codigo/saidas/` (`hd2-*.json` e `conf-*.json`).

## Observações

- **Surpresas**: `neondb_owner` ignora a policy mesmo com `FORCE` (tem `bypassrls`). O teste só faz sentido com uma role sem bypass; a aplicação não pode conectar como owner. A primeira execução da tentativa 1 deu 100% de erro porque a porta 8799 estava ocupada por outro processo local; trocar de porta resolveu e não contou como falha de infraestrutura.
- **Obstáculos**: a variável de conexão local do wrangler esconde o Hyperdrive remoto (aviso do próprio wrangler). Custou a tentativa 1.
- **Comportamentos inesperados**: o reuso de conexão é forte: 100 requisições passaram por 20 backends e a mesma conexão serviu as duas contas, o que é a condição que faria um `SET` de sessão vazar. O `set_config(..., true)` dentro de transação não vazou.
- **Esforço real**: bem menor que a hora prevista.
- **Perguntas novas**: (1) o design usa `SET LOCAL ROLE pelada_app` a partir de uma conexão de login (forma testada) ou uma role de login própria sem bypass (forma não testada)? (2) o cache desligado da configuração `spike-s1` não foi conferido pela API; o `deploy.yml` (T39) já o confere.
