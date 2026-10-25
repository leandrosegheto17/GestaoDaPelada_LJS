CREATE TABLE eventos_uso (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES grupos (id),
  tipo text NOT NULL CHECK (tipo IN ('ranking_aberto', 'pdf_exportado', 'partida_lancada', 'escalacao_confirmada')),
  momento timestamptz NOT NULL,
  -- sem nome, telefone, IP, localização nem jogador: o dispositivo é um identificador anônimo
  dispositivo_id uuid,
  mes_exportado text CHECK (mes_exportado ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  data_partida date,
  CONSTRAINT eventos_uso_dispositivo CHECK ((tipo = 'ranking_aberto') = (dispositivo_id IS NOT NULL)),
  CONSTRAINT eventos_uso_mes CHECK ((tipo = 'pdf_exportado') = (mes_exportado IS NOT NULL)),
  CONSTRAINT eventos_uso_data CHECK ((tipo IN ('partida_lancada', 'escalacao_confirmada')) = (data_partida IS NOT NULL))
);
CREATE INDEX eventos_uso_grupo_momento ON eventos_uso (grupo_id, momento);
