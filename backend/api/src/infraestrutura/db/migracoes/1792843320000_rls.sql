-- Up Migration
-- Isolamento por grupo no próprio Postgres (FUN-12 a FUN-15, design C3, AD-004).
-- O contexto vem de set_config('app.conta_id' | 'app.slug_publico', ..., true) na transação da requisição.

CREATE FUNCTION app_conta_id() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.conta_id', true), '')::uuid $$;

CREATE FUNCTION app_slug_publico() RETURNS text
  LANGUAGE sql STABLE
  AS $$ SELECT nullif(current_setting('app.slug_publico', true), '') $$;

-- Grupos visíveis no contexto: com conta, os grupos com vínculo da conta (o slug é ignorado, FUN-13);
-- só com slug, o grupo do slug (FUN-14); sem contexto, nenhum (FUN-15).
-- SECURITY DEFINER para ler vinculos_admin e grupos sem cair nas próprias policies (o owner tem BYPASSRLS,
-- spike S2); search_path fixo para não poder ser desviado.
CREATE FUNCTION grupos_visiveis() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT v.grupo_id FROM vinculos_admin v WHERE v.conta_id = app_conta_id()
    UNION
    SELECT g.id FROM grupos g WHERE app_conta_id() IS NULL AND g.slug = app_slug_publico()
  $$;
REVOKE ALL ON FUNCTION grupos_visiveis() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION grupos_visiveis() TO pelada_app;

-- RLS com FORCE em grupos (pela coluna id) e em toda tabela com grupo_id.
-- pelada_app: lê o que é visível; escreve só com conta (o slug público nunca escreve).
-- pelada_backup: lê tudo; sem esta policy o pg_dump com FORCE sai vazio e com exit 0 (spike S2).
-- SPEC_DEVIATION: o design trata `auditoria` e `eventos_uso` como tabelas sem grupo_id, mas as duas têm a
-- coluna. Vale a spec (FUN-12: toda tabela com grupo_id): entram aqui. Continuam sem grant para pelada_app.
DO $$
DECLARE
  alvo record;
  visivel text;
  escrita text;
BEGIN
  FOR alvo IN
    SELECT 'grupos'::text AS tabela, 'id'::text AS coluna
    UNION ALL
    SELECT c.relname::text, 'grupo_id'
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped
     WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    visivel := format('%I IN (SELECT grupos_visiveis())', alvo.coluna);
    escrita := format('app_conta_id() IS NOT NULL AND %s', visivel);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', alvo.tabela);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', alvo.tabela);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO pelada_app USING (%s)', alvo.tabela || '_ler', alvo.tabela, visivel);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO pelada_app WITH CHECK (%s)', alvo.tabela || '_inserir', alvo.tabela, escrita);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO pelada_app USING (%s) WITH CHECK (%s)', alvo.tabela || '_alterar', alvo.tabela, escrita, escrita);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO pelada_app USING (%s)', alvo.tabela || '_apagar', alvo.tabela, escrita);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO pelada_backup USING (true)', alvo.tabela || '_backup', alvo.tabela);
  END LOOP;
END
$$;
