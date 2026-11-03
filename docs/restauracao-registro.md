# Registro de restauração do backup

Chave pública `age` em uso no environment `backup`: `age13ggkr74x7k05da33zff37knwsqfnrn5lw9y4cdn3ln7cy9jc74uqyn62dc`. A chave privada fica fora do GitHub e do repositório.

## 2026-11-03: primeira restauração (T15, FUN-48, FUN-50)

- Origem: run 41732780380 do `backup.yml` (disparo manual, verde em 40 s), artefato `pelada-main-2026-11-03.dump.age` (159 KB), da `main` de produção.
- Destino: banco local vazio (Postgres 18 do compose), restaurado com `backend/scripts/ops/restaurar-backup.ts`. Banco e artefato apagados ao fim.
- Incidente: a primeira tentativa falhou com `role "pelada_app" does not exist`. O script de restauração passou a criar as roles `pelada_*` que faltam (commit `fix(ops)`).

Contagem de linhas por tabela (schema `public`):

| Tabela                                                                                                                                                                                                                                                                                                                                                 | Linhas              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------- |
| auditoria, config_financeira, config_pesos, contas, convites_admin, envios_email, envios_email_dia, escalacoes, eventos_uso, falhas_senha_atual, grupos, habilidades, jogadores, lancamentos, links_conta, notas, pagamentos_mes, partidas, pedidos_email_origem, pedidos_reset, periodos_ativos, presencas, sessoes, tentativas_login, vinculos_admin | 0 cada (25 tabelas) |
| pgmigrations                                                                                                                                                                                                                                                                                                                                           | 23                  |

## Pendências e alerta

- **A contagem não foi conferida contra a produção** (exigência de FUN-50): a sessão não tem acesso de leitura ao Neon. Todas as tabelas de negócio vieram com 0 linhas.
- **Alerta:** o schema restaurado tem 25 tabelas com `FORCE ROW LEVEL SECURITY` e 67 policies, todas `TO pelada_app`; nenhuma é `TO pelada_backup_ro` (as migrações do LJS criam `*_backup ... USING (true)`). Sem essa policy, o `pg_dump` de `pelada_backup_ro` sai vazio com código 0 (spike S2). Ou a produção está vazia, ou o backup diário não leva dados. O usuário precisa confirmar a contagem real em produção.
- Próxima execução agendada (07:00 UTC) no histórico do GitHub: conferir em 2026-11-04.
