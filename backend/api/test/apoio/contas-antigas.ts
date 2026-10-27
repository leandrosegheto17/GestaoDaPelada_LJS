import type pg from 'pg';

/**
 * Contas gravadas no setup do Worker com um link e um registro de envio de 1 hora atrás. O Worker de teste não tem o
 * owner para envelhecer o registro, e o intervalo de 60 s entre e-mails (ACE-51) impediria o teste de pedir um link
 * novo de uma conta recém-criada. Cada conta serve a um teste só: o pedido atualiza o registro de envio.
 */
export interface ContaAntiga {
  email: string;
  senha: string;
  /** Token do link pendente gravado (43 caracteres em base64url). */
  tokenAntigo: string;
  tipo: 'confirmacao' | 'recuperacao';
  confirmada: boolean;
}

export const SENHA_ANTIGA = 'senha-antiga-1';

function conta(nome: string, tipo: ContaAntiga['tipo'], letra: string): ContaAntiga {
  return {
    email: `${nome}@exemplo.com`,
    senha: SENHA_ANTIGA,
    tokenAntigo: letra.repeat(43),
    tipo,
    confirmada: tipo === 'recuperacao',
  };
}

export const PENDENTE_REENVIO = conta('pendente-reenvio', 'confirmacao', 'a');
export const PENDENTE_FALHA = conta('pendente-falha', 'confirmacao', 'b');
export const RECUPERA_ENVIO = conta('recupera-envio', 'recuperacao', 'c');
export const RECUPERA_FALHA = conta('recupera-falha', 'recuperacao', 'd');
export const RECUPERA_NOVA_SENHA = conta('recupera-nova-senha', 'recuperacao', 'e');

const TODAS = [PENDENTE_REENVIO, PENDENTE_FALHA, RECUPERA_ENVIO, RECUPERA_FALHA, RECUPERA_NOVA_SENHA];

export async function gravarContasAntigas(cliente: pg.ClientBase): Promise<void> {
  for (const c of TODAS) {
    const { rows } = await cliente.query<{ id: string }>(
      `INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em)
       VALUES ($1, 'Conta Antiga', crypt($2, gen_salt('bf', 4)), now() - interval '1 hour',
               CASE WHEN $3::boolean THEN now() - interval '1 hour' END)
       RETURNING id`,
      [c.email, c.senha, c.confirmada],
    );
    const id = rows[0]?.id;
    await cliente.query(
      `INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em)
       VALUES ($1, $2, digest($3::text, 'sha256'), now() - interval '1 minute', now() + interval '23 hours')`,
      [id, c.tipo, c.tokenAntigo],
    );
    await cliente.query(
      `INSERT INTO envios_email (destino_hash, tipo, enviado_em)
       VALUES (digest($1::text, 'sha256'), $2, now() - interval '1 hour')`,
      [c.email, c.tipo],
    );
  }
}
