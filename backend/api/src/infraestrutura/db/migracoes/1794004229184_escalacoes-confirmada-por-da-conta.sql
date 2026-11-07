-- Up Migration
-- `escalacoes.confirmada_por` é sempre a conta da sessão (simulador, validação A-14; SEC-003; SIM-69, SIM-81). Aditiva:
-- nenhum DROP. Defesa em profundidade: a rota já grava a conta certa (`rotas/escalacoes.ts`), mas o banco aceitava a
-- conta de outra pessoa do mesmo grupo como autora da confirmação.
-- Policies RESTRICTIVE se combinam com AND às permissivas do laço de 1792843320000_rls.sql:51-56, então só estreitam.
-- No UPDATE o WITH CHECK vale para a linha nova: o upsert da API (ON CONFLICT DO UPDATE) já grava a própria conta.
CREATE POLICY escalacoes_confirmada_por_inserir ON escalacoes AS RESTRICTIVE FOR INSERT TO pelada_app
  WITH CHECK (confirmada_por = app_conta_id());
CREATE POLICY escalacoes_confirmada_por_alterar ON escalacoes AS RESTRICTIVE FOR UPDATE TO pelada_app
  USING (true)
  WITH CHECK (confirmada_por = app_conta_id());
