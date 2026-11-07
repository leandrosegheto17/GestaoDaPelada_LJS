-- Up Migration
-- A criadora do grupo não perde o acesso ao financeiro por ação de outro admin, e o pelada_app só altera a coluna
-- acessa_financeiro de vinculos_admin (validação do financeiro, S-1 e S-5; FIN-35, FIN-41; AD-132). Aditiva: nenhum DROP.
-- Motivo: um admin convidado com acesso podia retirar o acesso da criadora, que não conseguia recuperá-lo sozinha
-- (a policy de FIN-41 só impede a própria conta de mudar a própria linha). O UPDATE de qualquer outra coluna não
-- tem rota, mas o pelada_app tinha UPDATE na linha inteira (conta_id, grupo_id, criado_por).

-- 1. Quem é a criadora, lido sem cair nas policies de grupos (SECURITY DEFINER, owner com BYPASSRLS, como
--    app_acessa_financeiro em 1792845300000_financeiro-rls.sql:15), com search_path fixo e EXECUTE só para pelada_app.
CREATE FUNCTION app_eh_criadora(p_grupo_id uuid, p_conta_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
    SELECT EXISTS (SELECT 1 FROM grupos g WHERE g.id = p_grupo_id AND g.criado_por = p_conta_id)
  $$;
REVOKE ALL ON FUNCTION app_eh_criadora(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_eh_criadora(uuid, uuid) TO pelada_app;

-- 2. Restritiva (combinada com AND às demais): o valor novo da linha da criadora mantém acessa_financeiro verdadeiro.
--    Só o WITH CHECK discrimina o valor novo; o UPDATE recusado levanta 42501.
CREATE POLICY vinculos_admin_protege_criadora ON vinculos_admin
  AS RESTRICTIVE FOR UPDATE TO pelada_app
  USING (true)
  WITH CHECK (acessa_financeiro OR NOT app_eh_criadora(grupo_id, conta_id));

-- 3. O pelada_app só muda acessa_financeiro (S-5). Um trigger, e não um REVOKE de UPDATE por tabela com GRANT por
--    coluna (como em 1792844400000_grupos-grants-coluna.sql), porque essa troca de grant tira da referência do esquema
--    uma linha que o ensaio das migrações das features anteriores (NOT-49) ainda espera. O trigger só vale para o
--    pelada_app: o owner (migrações, manutenção) segue livre. Levanta 42501, como as policies.
CREATE FUNCTION vinculos_admin_so_acessa_financeiro() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF current_user = 'pelada_app' AND (
         NEW.conta_id IS DISTINCT FROM OLD.conta_id
         OR NEW.grupo_id IS DISTINCT FROM OLD.grupo_id
         OR NEW.criado_por IS DISTINCT FROM OLD.criado_por
         OR NEW.criado_em IS DISTINCT FROM OLD.criado_em) THEN
      RAISE EXCEPTION 'vinculos_admin: só acessa_financeiro pode ser alterada' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END
  $$;

CREATE TRIGGER vinculos_admin_so_acessa_financeiro
  BEFORE UPDATE ON vinculos_admin
  FOR EACH ROW EXECUTE FUNCTION vinculos_admin_so_acessa_financeiro();
