-- Up Migration
-- A escalação só é lida com conta no contexto (simulador T0; SIM-81). Aditiva: nenhum DROP.
-- SPEC_DEVIATION: o Delta 1 do simulador e a AD-084 diziam "sem migração nova" (a policy do laço de
-- 1792843320000_rls.sql:51-56 serve). A matriz política × comando de SIM-81 manda o slug público ler zero linhas de
-- `escalacoes`, e a policy do laço deixa o ramo do slug (grupos_visiveis, FUN-14) ler a escalação do grupo. Decisão do
-- usuário em 2026-11-05: vale a matriz (a escalação não é pública).
-- Uma policy RESTRICTIVE é combinada com AND às permissivas herdadas: a linha só passa quando há conta no contexto E o
-- grupo é visível por ela. A de leitura do pelada_backup_ro fica intacta (a restritiva vale só TO pelada_app).
CREATE POLICY escalacoes_ler_so_conta ON escalacoes AS RESTRICTIVE FOR SELECT TO pelada_app
  USING (app_conta_id() IS NOT NULL);
