-- Up Migration
-- Bloqueio por conta após 5 falhas da senha atual na troca de senha e na exclusão da conta (ACE-70; SEC-CA-03,
-- AD-012, T61). Aditiva (G-14): tabela nova e as duas funções redefinidas sem mudar a assinatura, para o Worker da
-- versão anterior continuar chamando-as (rollback).

-- Falhas da senha atual por conta (troca de senha e exclusão somam juntas). Uma linha por falha; o acerto apaga as
-- da conta. Não guarda IP, senha nem hash.
CREATE TABLE falhas_senha_atual (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conta_id uuid NOT NULL REFERENCES contas (id),
  momento timestamptz NOT NULL
);
CREATE INDEX falhas_senha_atual_conta_momento ON falhas_senha_atual (conta_id, momento);
COMMENT ON TABLE falhas_senha_atual IS 'Falhas da senha atual por conta (troca de senha e exclusão), para o bloqueio de 15 min após 5 falhas. Não guarda IP, senha nem hash.';

-- RLS com FORCE, como as outras tabelas de conta (ACE-45). pelada_backup lê tudo; pelada_app não tem grant: só as
-- funções abaixo tocam.
ALTER TABLE falhas_senha_atual ENABLE ROW LEVEL SECURITY;
ALTER TABLE falhas_senha_atual FORCE ROW LEVEL SECURITY;
CREATE POLICY falhas_senha_atual_backup ON falhas_senha_atual FOR SELECT TO pelada_backup USING (true);
GRANT SELECT ON falhas_senha_atual TO pelada_backup;

-- Fim do bloqueio da conta, ou nulo se não está bloqueada. A mesma regra do login (ACE-13, ACE-14), por conta: a
-- quinta falha de uma sequência de 5 em até 15 min bloqueia até 15 min depois dela. Quem chama já travou a linha da
-- conta (FOR UPDATE): tentativas simultâneas da mesma conta são avaliadas uma depois da outra e nenhuma falha se
-- perde. Sem SECURITY DEFINER e sem EXECUTE para ninguém além do owner: só as funções abaixo chamam.
CREATE FUNCTION conta_senha_bloqueada_ate(p_conta uuid) RETURNS timestamptz
  LANGUAGE sql STABLE
  SET search_path = public, pg_temp
  AS $$
    SELECT max(f.momento) + interval '15 minutes'
      FROM falhas_senha_atual f
     WHERE f.conta_id = p_conta AND f.momento > now() - interval '15 minutes'
       AND (SELECT count(*) FROM falhas_senha_atual g
             WHERE g.conta_id = p_conta
               AND g.momento > f.momento - interval '15 minutes' AND g.momento <= f.momento) >= 5;
  $$;
REVOKE ALL ON FUNCTION conta_senha_bloqueada_ate(uuid) FROM PUBLIC;

-- Grava uma falha da conta e apaga as que já não contam para nenhum bloqueio (mais de 30 min).
CREATE FUNCTION conta_senha_registrar_falha(p_conta uuid) RETURNS void
  LANGUAGE sql VOLATILE
  SET search_path = public, pg_temp
  AS $$
    DELETE FROM falhas_senha_atual f WHERE f.conta_id = p_conta AND f.momento < now() - interval '30 minutes';
    INSERT INTO falhas_senha_atual (conta_id, momento) VALUES (p_conta, now());
  $$;
REVOKE ALL ON FUNCTION conta_senha_registrar_falha(uuid) FROM PUBLIC;

-- Troca a senha (ACE-26, ACE-27, ACE-70). Trava a linha da conta, confere o bloqueio antes do bcrypt e devolve:
-- true (trocou; zera as falhas), false (senha atual errada, falha gravada; ou sem conta na sessão) e nulo
-- (bloqueado: não confere a senha, não grava a tentativa e nada muda). O Worker anterior lê nulo como false.
CREATE OR REPLACE FUNCTION conta_trocar_senha(p_senha_atual text, p_senha_nova text, p_token_sessao_hash bytea)
  RETURNS boolean
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  DECLARE
    v_conta uuid;
    v_hash text;
  BEGIN
    SELECT c.id, c.senha_hash INTO v_conta, v_hash
      FROM contas c WHERE c.id = app_conta_id() AND c.excluida_em IS NULL FOR UPDATE;
    IF v_conta IS NULL THEN
      RETURN false;
    END IF;
    IF conta_senha_bloqueada_ate(v_conta) IS NOT NULL THEN
      RETURN NULL;
    END IF;
    IF v_hash IS NULL OR v_hash NOT LIKE '$2_$%' OR crypt(p_senha_atual, v_hash) <> v_hash THEN
      PERFORM conta_senha_registrar_falha(v_conta);
      RETURN false;
    END IF;

    DELETE FROM falhas_senha_atual f WHERE f.conta_id = v_conta;
    UPDATE contas c SET senha_hash = crypt(p_senha_nova, gen_salt('bf', 12)) WHERE c.id = v_conta;
    DELETE FROM sessoes s WHERE s.conta_id = v_conta AND s.token_hash <> p_token_sessao_hash;
    RETURN true;
  END
  $$;
REVOKE ALL ON FUNCTION conta_trocar_senha(text, text, bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_trocar_senha(text, text, bytea) TO pelada_app;

-- Exclui a conta da sessão (ACE-28 a ACE-30, ACE-69, ACE-70). Resultados:
-- - 'bloqueado': 5 falhas da senha atual em 15 min (troca ou exclusão); não confere a senha e nada muda.
-- - 'senha_incorreta': a senha não confere; grava a falha e nada mais muda.
-- - 'unico_admin': a senha confere (zera as falhas), mas a conta é a única admin de algum grupo não arquivado; nada
--   mais muda; grupos = [{id, nome}].
-- - 'ok': apaga as sessões, os vínculos (com uma linha de auditoria por grupo, ACE-42), os links, os convites
--   enviados ao e-mail, as tentativas de login, as falhas da senha atual e os envios do e-mail; anonimiza a linha
--   da conta (e-mail excluida-<id>@invalido, nome "Conta excluída", hash '!' que nunca confere, excluida_em).
CREATE OR REPLACE FUNCTION conta_excluir(p_senha text)
  RETURNS TABLE (resultado text, grupos jsonb)
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER
  SET search_path = public, pg_temp
  AS $$
  #variable_conflict use_column
  DECLARE
    v_conta contas%ROWTYPE;
    v_unicos jsonb;
  BEGIN
    SELECT * INTO v_conta FROM contas c WHERE c.id = app_conta_id() AND c.excluida_em IS NULL FOR UPDATE;
    IF v_conta.id IS NULL THEN
      RETURN QUERY SELECT 'senha_incorreta'::text, '[]'::jsonb;
      RETURN;
    END IF;
    IF conta_senha_bloqueada_ate(v_conta.id) IS NOT NULL THEN
      RETURN QUERY SELECT 'bloqueado'::text, '[]'::jsonb;
      RETURN;
    END IF;
    IF v_conta.senha_hash NOT LIKE '$2_$%' OR crypt(p_senha, v_conta.senha_hash) <> v_conta.senha_hash THEN
      PERFORM conta_senha_registrar_falha(v_conta.id);
      RETURN QUERY SELECT 'senha_incorreta'::text, '[]'::jsonb;
      RETURN;
    END IF;
    DELETE FROM falhas_senha_atual f WHERE f.conta_id = v_conta.id;

    -- Trava os vínculos dos grupos da conta: uma remoção de admin simultânea não deixa o grupo sem ninguém.
    PERFORM 1 FROM vinculos_admin v
      WHERE v.grupo_id IN (SELECT m.grupo_id FROM vinculos_admin m WHERE m.conta_id = v_conta.id)
      FOR UPDATE;

    SELECT coalesce(jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome) ORDER BY g.nome, g.id), '[]'::jsonb)
      INTO v_unicos
      FROM vinculos_admin v JOIN grupos g ON g.id = v.grupo_id
     WHERE v.conta_id = v_conta.id AND g.arquivado_em IS NULL
       AND NOT EXISTS (SELECT 1 FROM vinculos_admin o WHERE o.grupo_id = v.grupo_id AND o.conta_id <> v_conta.id);
    IF jsonb_array_length(v_unicos) > 0 THEN
      RETURN QUERY SELECT 'unico_admin'::text, v_unicos;
      RETURN;
    END IF;

    INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, entidade_id, grupo_id, momento)
    SELECT 'conta', v_conta.id, 'excluir_conta', 'vinculo_admin', v_conta.id::text, v.grupo_id, now()
      FROM vinculos_admin v WHERE v.conta_id = v_conta.id;

    DELETE FROM sessoes s WHERE s.conta_id = v_conta.id;
    DELETE FROM vinculos_admin v WHERE v.conta_id = v_conta.id;
    DELETE FROM links_conta l WHERE l.conta_id = v_conta.id;
    DELETE FROM convites_admin ca WHERE ca.email = v_conta.email;
    DELETE FROM tentativas_login t WHERE t.email = v_conta.email;
    DELETE FROM envios_email e WHERE e.destino_hash = digest(v_conta.email, 'sha256');

    UPDATE contas c
       SET email = 'excluida-' || c.id::text || '@invalido',
           nome = 'Conta excluída',
           senha_hash = '!',
           e_dono = false,
           excluida_em = now()
     WHERE c.id = v_conta.id;
    RETURN QUERY SELECT 'ok'::text, '[]'::jsonb;
  END
  $$;
REVOKE ALL ON FUNCTION conta_excluir(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION conta_excluir(text) TO pelada_app;
