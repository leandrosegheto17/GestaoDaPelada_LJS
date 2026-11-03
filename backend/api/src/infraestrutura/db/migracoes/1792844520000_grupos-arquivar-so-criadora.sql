-- Up Migration
-- Só quem criou o grupo muda arquivado_em, também no banco (grupos-e-elenco, T82; SEC-009). O grant de coluna
-- (1792844400000_grupos-grants-coluna.sql) deixa a pelada_app alterar arquivado_em, e a policy grupos_alterar
-- (1792843320000_rls.sql) só exige vínculo: um bug numa rota deixaria uma admin que não criou o grupo arquivá-lo. A
-- aplicação já confere criado_por (repositorios/grupos.ts); esta trigger é a segunda barreira. Vale só para a
-- pelada_app (o owner, as migrations e as funções SECURITY DEFINER, que rodam como owner, não passam por ela) e só
-- quando o valor muda de fato.
CREATE FUNCTION grupos_arquivado_so_criadora() RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public, pg_temp
  AS $$
  BEGIN
    IF current_user = 'pelada_app' AND NEW.criado_por IS DISTINCT FROM app_conta_id() THEN
      RAISE EXCEPTION 'Só quem criou o grupo pode arquivar ou reativar.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END
  $$;
REVOKE ALL ON FUNCTION grupos_arquivado_so_criadora() FROM PUBLIC;

CREATE TRIGGER grupos_arquivado_so_criadora
  BEFORE UPDATE OF arquivado_em ON grupos
  FOR EACH ROW WHEN (OLD.arquivado_em IS DISTINCT FROM NEW.arquivado_em)
  EXECUTE FUNCTION grupos_arquivado_so_criadora();
