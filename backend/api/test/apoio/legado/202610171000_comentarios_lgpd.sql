COMMENT ON COLUMN auditoria.resumo IS 'Resumo do evento auditado. Nunca recebe senha, token, hash de senha nem dado pessoal além do estritamente necessário para identificar o evento.';
COMMENT ON TABLE tentativas_login IS 'Contador de tentativas de login por e-mail e momento, para limitar força bruta. Não guarda IP nem user-agent; senha e token nunca entram.';
