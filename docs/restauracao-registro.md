# Registro de restaurações do backup

Cada restauração feita pelo procedimento do [runbook](runbook.md#restaurar-um-backup) (FUN-50) entra aqui: data, artefato, contagem de linhas por tabela e se bateu com a produção.

O backup da produção não é confiável até a revalidação do fim do projeto (AD-014).

## 2026-11-06 — execução manual `42220835679` (T15)

- Artefato: `backup-producao-42220835679` (`backup-producao.age`, 304.031 bytes), gerado pelo `backup.yml` disparado à mão na `main` (`dec5c9ab`), verde.
- Restaurado com `pnpm restaurar` num banco local vazio (`restauracao`, Postgres 18 do compose). O `pg_restore` ganhou `--no-privileges`: o dump traz `ALTER DEFAULT PRIVILEGES` para roles do Neon (`neon_superuser`, `cloud_admin`) que não existem no banco local.
- Contagem por tabela (31 tabelas): assinaturas 0, auditoria 304, avisos_cobranca 0, config_financeira 0, config_pesos 1, contas 1, convites_admin 0, envios_email 0, envios_email_dia 0, escalacoes 0, eventos_asaas 0, eventos_uso 233, falhas_senha_atual 0, grupos 1, habilidades 8, jogadores 57, lancamentos 0, links_conta 0, notas 240, pagamentos_mes 0, partidas 221, pedidos_email_origem 0, pedidos_reset 0, periodos_ativos 57, pgmigrations 45, presencas 6423, push_conta 0, push_ranking 0, sessoes 1, tentativas_login 7, vinculos_admin 1.
- Bateu com a produção: **não conferido** nesta data (a conferência pela role `pelada_backup_ro` fica com o item da T80).
- Banco `restauracao` e arquivo baixado apagados depois.
