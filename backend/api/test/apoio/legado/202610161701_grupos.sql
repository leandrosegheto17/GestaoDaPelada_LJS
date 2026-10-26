CREATE TABLE grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL CHECK (char_length(nome) BETWEEN 3 AND 60),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]{1,64}$'),
  dia_semana text NOT NULL CHECK (dia_semana IN ('domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado')),
  frequencia text NOT NULL CHECK (frequencia IN ('semanal', 'quinzenal', 'mensal')),
  horario time NOT NULL,
  situacao_comercial text NOT NULL DEFAULT 'uso_proprio'
    CHECK (situacao_comercial IN ('uso_proprio', 'trial', 'ativo', 'inadimplente', 'cancelado')),
  trial_inicio date,
  arquivado_em timestamptz,
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  CONSTRAINT grupos_trial CHECK ((situacao_comercial = 'trial') = (trial_inicio IS NOT NULL))
);

-- O slug é o endereço público do grupo: nunca muda depois de gerado.
CREATE FUNCTION grupos_slug_imutavel() RETURNS trigger AS $$
BEGIN
  IF NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION 'O slug do grupo não pode ser alterado' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER grupos_slug_imutavel
  BEFORE UPDATE OF slug ON grupos
  FOR EACH ROW EXECUTE FUNCTION grupos_slug_imutavel();

CREATE TABLE vinculos_admin (
  conta_id uuid NOT NULL REFERENCES contas (id),
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  acessa_financeiro boolean NOT NULL DEFAULT false,
  criado_por uuid NOT NULL REFERENCES contas (id),
  criado_em timestamptz NOT NULL,
  PRIMARY KEY (conta_id, grupo_id)
);
CREATE INDEX vinculos_admin_grupo ON vinculos_admin (grupo_id);
