-- Up Migration
-- Trava de vinculos_admin.acessa_financeiro e nomes das autoras de lançamentos (financeiro T10; FIN-41, FIN-42,
-- FIN-32; AD-075, AD-076). Aditiva: nenhum DROP; as policies permissivas herdadas de vinculos_admin ficam.
-- SPEC_DEVIATION: o timestamp (1792845360000) segue o da T9, com a mesma folga para as features 4 e 5.

-- 1. Quem muda acessa_financeiro (AD-075). O pelada_app tem UPDATE e INSERT em vinculos_admin
--    (1792843260000_roles.sql:20-31); sem esta trava, um erro da API concederia o acesso pelo banco. Restritivas, então
--    combinadas com AND às permissivas herdadas:
--    - UPDATE: só a conta com acesso ao financeiro do grupo, e nunca na própria linha (a própria conta não se concede
--      nem se retira). Na própria linha ou sem acesso, o UPDATE afeta zero linhas; o WITH CHECK impede mover a linha
--      para um grupo em que a conta não tem acesso.
--    - INSERT: vínculo com acessa_financeiro = true só por quem tem acesso no grupo. As funções SECURITY DEFINER que
--      criam vínculo (grupo_criar, 1792844340000_grupo-criar.sql:60; aceitar convite,
--      1792844460000_convites-grupo-arquivado.sql:49 e :90) rodam como owner, que tem BYPASSRLS: não passam por aqui.
--    - DELETE (remoção de admin, conta-e-acesso) não muda.
CREATE POLICY vinculos_admin_trava_financeiro_alterar ON vinculos_admin
  AS RESTRICTIVE FOR UPDATE TO pelada_app
  USING (conta_id <> app_conta_id() AND app_acessa_financeiro(grupo_id))
  WITH CHECK (conta_id <> app_conta_id() AND app_acessa_financeiro(grupo_id));

CREATE POLICY vinculos_admin_trava_financeiro_inserir ON vinculos_admin
  AS RESTRICTIVE FOR INSERT TO pelada_app
  WITH CHECK (NOT acessa_financeiro OR app_acessa_financeiro(grupo_id));

-- 2. Nomes das autoras (AD-036, AD-076). Mesma assinatura e mesmas regras da versão da partidas-e-ranking (T24 dela):
--    só com conta e com o grupo em grupos_visiveis(), só contas autoras de config_pesos e de partidas daquele grupo,
--    nunca e-mail. Acrescenta as autoras de lancamentos (criado_por e alterado_por), só quando a conta do contexto
--    tem acesso ao financeiro do grupo: o "Última alteração: <nome>" do t23 (FIN-32) não vaza para quem não vê o caixa.
--    O /executar confere que o resto do corpo repete o da migração da feature 4 (contas-nomes-do-grupo).
CREATE OR REPLACE FUNCTION contas_nomes_do_grupo(p_grupo_id uuid)
  RETURNS TABLE (id uuid, nome text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT c.id, c.nome
      FROM contas c
     WHERE app_conta_id() IS NOT NULL
       AND p_grupo_id IN (SELECT grupos_visiveis())
       AND c.id IN (
             SELECT cp.registrado_por FROM config_pesos cp WHERE cp.grupo_id = p_grupo_id
             UNION
             SELECT p.criada_por FROM partidas p WHERE p.grupo_id = p_grupo_id
             UNION
             SELECT p.alterada_por FROM partidas p WHERE p.grupo_id = p_grupo_id
             UNION
             SELECT l.criado_por FROM lancamentos l
              WHERE l.grupo_id = p_grupo_id AND app_acessa_financeiro(p_grupo_id)
             UNION
             SELECT l.alterado_por FROM lancamentos l
              WHERE l.grupo_id = p_grupo_id AND app_acessa_financeiro(p_grupo_id)
           )
     ORDER BY c.nome, c.id
  $$;
REVOKE ALL ON FUNCTION contas_nomes_do_grupo(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION contas_nomes_do_grupo(uuid) TO pelada_app;
