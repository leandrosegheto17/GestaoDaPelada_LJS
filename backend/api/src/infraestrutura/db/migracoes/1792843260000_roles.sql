-- Up Migration
-- Roles do runtime e do backup (FUN-11, design C3). Roda como o owner das tabelas, que é quem faz DDL.
-- As roles são do servidor, não do banco: só são criadas se faltarem. Nascem sem login; a senha de login é
-- definida fora do repositório (runbook em produção, seed no local).
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pelada_app') THEN
    CREATE ROLE pelada_app NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'pelada_backup') THEN
    CREATE ROLE pelada_backup NOLOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;
  END IF;
END
$$;

-- Ninguém além do owner cria objetos em public (sem DDL para as roles da aplicação).
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO pelada_app, pelada_backup;

-- Runtime: lê, insere e altera as tabelas de negócio. Nunca TRUNCATE nem DDL.
-- Sem grant nas tabelas de conta, sessão, login, reset, auditoria e eventos de uso: a feature conta-e-acesso define.
GRANT SELECT, INSERT, UPDATE ON
  grupos, vinculos_admin, jogadores, periodos_ativos, habilidades, notas, config_pesos, partidas, presencas,
  escalacoes, config_financeira, lancamentos, pagamentos_mes
TO pelada_app;

-- DELETE só onde o legado apaga por regra.
-- SPEC_DEVIATION: o design lista também `sessoes`, mas manda deixar as tabelas sem grupo_id sem grant até a
-- conta-e-acesso. Prevalece o mais restritivo: `sessoes` ganha DELETE quando essa feature der os grants dela.
GRANT DELETE ON
  presencas, notas, escalacoes, vinculos_admin, pagamentos_mes, lancamentos, habilidades, partidas, jogadores
TO pelada_app;

-- Backup: só leitura, em tudo (pg_dump também lê o estado das sequências).
GRANT SELECT ON ALL TABLES IN SCHEMA public TO pelada_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pelada_backup;
