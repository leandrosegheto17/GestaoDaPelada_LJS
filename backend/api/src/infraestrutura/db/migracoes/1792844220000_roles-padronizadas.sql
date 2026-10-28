-- Up Migration
-- contrair: renomeia a role pelada_backup para pelada_backup_ro (padrão <projeto>_owner, _app e _backup_ro, ADR-032).
-- O Worker não usa a role de backup, então a versão anterior continua funcionando (rollback). Quem usa é o backup
-- diário: o usuário do secret NEON_URL_BACKUP passa a ser pelada_backup_ro (runbook, seção 5). As migrations antigas
-- continuam criando pelada_backup e não são editadas; esta acerta o nome depois delas.
--
-- As roles são do servidor, e cada banco tem os próprios grants e policies. Três casos:
-- 1. Só pelada_backup existe (produção, ou o primeiro banco migrado num servidor): RENAME. A senha SCRAM, os grants e
--    as policies seguem a role (o RENAME guarda o OID); o atributo NOBYPASSRLS também.
-- 2. As duas existem (outro banco no mesmo servidor, como os temporários dos testes: a migration de roles recriou
--    pelada_backup porque o nome tinha sumido): os grants e as policies deste banco passam para pelada_backup_ro e a
--    pelada_backup sai deste banco (DROP OWNED, que também a tira das policies). A role só é apagada se nada mais,
--    em nenhum banco do servidor, depender dela.
-- 3. Só pelada_backup_ro existe: nada a fazer.
DO $$
DECLARE
  v_antiga oid := (SELECT oid FROM pg_roles WHERE rolname = 'pelada_backup');
  v_nova oid := (SELECT oid FROM pg_roles WHERE rolname = 'pelada_backup_ro');
  v_item record;
  v_papeis text;
BEGIN
  IF v_antiga IS NULL THEN
    RETURN;
  END IF;
  IF v_nova IS NULL THEN
    ALTER ROLE pelada_backup RENAME TO pelada_backup_ro;
    RETURN;
  END IF;

  -- Policies que citam a role antiga: a nova entra no lugar dela.
  FOR v_item IN
    SELECT p.polname, c.relname, p.polroles
      FROM pg_policy p
      JOIN pg_class c ON c.oid = p.polrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND v_antiga = ANY (p.polroles)
  LOOP
    SELECT string_agg(DISTINCT quote_ident(r.rolname), ', ') INTO v_papeis
      FROM unnest(array_replace(v_item.polroles, v_antiga, v_nova)) AS papel(oid)
      JOIN pg_roles r ON r.oid = papel.oid;
    EXECUTE format('ALTER POLICY %I ON public.%I TO %s', v_item.polname, v_item.relname, v_papeis);
  END LOOP;

  -- Grants de tabela, sequência e view do schema public.
  FOR v_item IN
    SELECT c.relname, c.relkind, a.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(c.relacl) AS a
     WHERE n.nspname = 'public' AND a.grantee = v_antiga
  LOOP
    EXECUTE format(
      'GRANT %s ON %s public.%I TO pelada_backup_ro',
      v_item.privilege_type,
      CASE WHEN v_item.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
      v_item.relname
    );
  END LOOP;

  -- Grants de coluna.
  FOR v_item IN
    SELECT c.relname, at.attname, a.privilege_type
      FROM pg_attribute at
      JOIN pg_class c ON c.oid = at.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN LATERAL aclexplode(at.attacl) AS a
     WHERE n.nspname = 'public' AND a.grantee = v_antiga
  LOOP
    EXECUTE format('GRANT %s (%I) ON public.%I TO pelada_backup_ro', v_item.privilege_type, v_item.attname, v_item.relname);
  END LOOP;

  -- Grants de função.
  FOR v_item IN
    SELECT p.oid::regprocedure AS assinatura, a.privilege_type
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      CROSS JOIN LATERAL aclexplode(p.proacl) AS a
     WHERE n.nspname = 'public' AND a.grantee = v_antiga
  LOOP
    EXECUTE format('GRANT %s ON FUNCTION %s TO pelada_backup_ro', v_item.privilege_type, v_item.assinatura);
  END LOOP;

  -- Grant do schema.
  IF EXISTS (
    SELECT FROM pg_namespace n CROSS JOIN LATERAL aclexplode(n.nspacl) AS a
     WHERE n.nspname = 'public' AND a.grantee = v_antiga AND a.privilege_type = 'USAGE'
  ) THEN
    GRANT USAGE ON SCHEMA public TO pelada_backup_ro;
  END IF;

  -- A antiga sai deste banco (privilégios e policies). Ela não é dona de nada: nasceu NOLOGIN pela migration.
  DROP OWNED BY pelada_backup;
  BEGIN
    DROP ROLE pelada_backup;
  EXCEPTION
    WHEN dependent_objects_still_exist THEN
      NULL; -- outro banco do servidor ainda a usa; aquele banco a troca quando migrar.
  END;
END
$$;
