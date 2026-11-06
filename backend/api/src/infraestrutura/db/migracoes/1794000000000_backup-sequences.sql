-- Up Migration
-- A role de backup lê todas as sequences (fundacao FUN-11, FUN-48; AD-010, AD-016; achado A-09 do /validar).
-- Aditiva: só GRANT. As migrações conta-senha-bloqueio e conta-teto-emails-origem criaram tabelas com identity e deram
-- SELECT nas tabelas, mas não nas sequences; o `pg_dump` completo (dump-cifrado.sh) lê o valor de toda sequence e sai
-- com exit 1 ("failed to get data for sequence") sem esse SELECT. Só SELECT: sem USAGE nem UPDATE, a role segue
-- somente leitura. O DEFAULT PRIVILEGES cobre as sequences que as próximas migrações criarem (a owner é quem roda).
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO pelada_backup_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO pelada_backup_ro;
