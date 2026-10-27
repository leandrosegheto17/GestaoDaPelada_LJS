import type pg from 'pg';
import type { IdsDoGrupo } from './cenario-dois-grupos.ts';

/**
 * Terceiro grupo do banco do Worker, só com a conta fundadora como admin e nada mais: o teste da remoção do último
 * admin (ACE-40) o consome sem mexer nos grupos A e B, que outros testes usam.
 */
export const GRUPO_ISOLADO: IdsDoGrupo = {
  conta: '00000000-0000-0000-0000-0000000000a3',
  grupo: '00000000-0000-0000-0000-0000000000b3',
  slug: 'grupo-isolado',
  jogador: '00000000-0000-0000-0000-0000000000c3',
  habilidade: '00000000-0000-0000-0000-0000000000d3',
  partida: '00000000-0000-0000-0000-0000000000e3',
  lancamento: '00000000-0000-0000-0000-0000000000f3',
};

export async function gravarGrupoIsolado(cliente: pg.ClientBase): Promise<void> {
  const { conta, grupo, slug } = GRUPO_ISOLADO;
  await cliente.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2 || '@exemplo.com', $2, 'x', now())",
    [conta, slug],
  );
  await cliente.query(
    `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, 'Grupo ' || $2, $2, 'quarta', 'semanal', '20:00', $3, now())`,
    [grupo, slug, conta],
  );
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [conta, grupo],
  );
}

/** Conta confirmada que entra com e-mail e senha e é a única admin de um grupo (ACE-29). Serve a um teste só. */
export const ADMIN_UNICO = {
  conta: '00000000-0000-0000-0000-0000000000a4',
  grupo: '00000000-0000-0000-0000-0000000000b4',
  nome: 'Grupo do admin único',
  email: 'admin-unico@exemplo.com',
  senha: 'senha-admin-unico-1',
};

export async function gravarAdminUnico(cliente: pg.ClientBase): Promise<void> {
  const { conta, grupo, nome, email, senha } = ADMIN_UNICO;
  await cliente.query(
    `INSERT INTO contas (id, email, nome, senha_hash, criada_em, email_confirmado_em)
     VALUES ($1, $2, 'Admin Único', crypt($3, gen_salt('bf', 4)), now(), now())`,
    [conta, email, senha],
  );
  await cliente.query(
    `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'admin-unico', 'quarta', 'semanal', '20:00', $3, now())`,
    [grupo, nome, conta],
  );
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [conta, grupo],
  );
}
