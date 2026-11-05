-- Up Migration
-- Financeiro só para quem tem acesso (financeiro T9; FIN-38, FIN-39, FIN-42; AD-052, AD-075). Aditiva: nenhum DROP.
-- Hoje (SEC-003, 1792843320000_rls.sql:32-61) as 3 tabelas do financeiro seguem a regra geral: o slug público lê e
-- todo admin do grupo lê e escreve, com ou sem `vinculos_admin.acessa_financeiro`. Esta migração acrescenta uma policy
-- RESTRICTIVE por tabela, que o Postgres combina com AND às permissivas herdadas: a linha só passa quando a conta do
-- contexto tem vínculo com o grupo da linha E `acessa_financeiro`. Sem conta (só o slug, ou sem contexto), nada passa.
-- As permissivas herdadas (inclusive o ramo do arquivado de grupos_visiveis) e a de leitura do pelada_backup_ro ficam
-- intactas: a restritiva vale só `TO pelada_app`.
-- SPEC_DEVIATION: o timestamp (1792845300000) deixa folga para as migrações das features 4 e 5, ainda não escritas
-- quando este rascunho nasceu; o /executar confere que ele é maior que a última delas (FIN-42) e renomeia se preciso.

-- Mesmas proteções de grupos_visiveis (1792844280000_grupos-visiveis-arquivado.sql:9-22): SECURITY DEFINER para ler
-- vinculos_admin sem cair nas policies dela (o owner tem BYPASSRLS) e sem recursão quando a usarem as policies da
-- própria vinculos_admin (T10), search_path fixo, STABLE e EXECUTE só para pelada_app.
CREATE FUNCTION app_acessa_financeiro(p_grupo_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT app_conta_id() IS NOT NULL
       AND EXISTS (
             SELECT 1
               FROM vinculos_admin v
              WHERE v.conta_id = app_conta_id()
                AND v.grupo_id = p_grupo_id
                AND v.acessa_financeiro
           )
  $$;
REVOKE ALL ON FUNCTION app_acessa_financeiro(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_acessa_financeiro(uuid) TO pelada_app;

CREATE POLICY config_financeira_acesso_financeiro ON config_financeira
  AS RESTRICTIVE FOR ALL TO pelada_app
  USING (app_acessa_financeiro(grupo_id))
  WITH CHECK (app_acessa_financeiro(grupo_id));

CREATE POLICY lancamentos_acesso_financeiro ON lancamentos
  AS RESTRICTIVE FOR ALL TO pelada_app
  USING (app_acessa_financeiro(grupo_id))
  WITH CHECK (app_acessa_financeiro(grupo_id));

CREATE POLICY pagamentos_mes_acesso_financeiro ON pagamentos_mes
  AS RESTRICTIVE FOR ALL TO pelada_app
  USING (app_acessa_financeiro(grupo_id))
  WITH CHECK (app_acessa_financeiro(grupo_id));
