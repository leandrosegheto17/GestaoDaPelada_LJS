import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Conta que já existe com hash bcrypt gerado fora do pgcrypto (spec: "Contas que já existem"; ACE-06).
// O hash abaixo é bcrypt de custo 12 ($2a$; o mesmo cálculo do $2b$, trocando só o prefixo que o pgcrypto do PG 16 reconhece), gerado com a biblioteca bcryptjs do Node fora do Postgres, a partir de
// uma senha só deste teste. Se a verificação passar a exigir outro formato ou custo, a conta deixa de entrar.
const HASH_EXTERNO = '$2a$12$jId3rCW/LsTg3R3TRo8UT.kGM2Cuyze2ufaONJqR1sE1bwG2vJNsK';
const SENHA_DO_HASH = 'senha-externa-do-teste-1';
const EMAIL = 'legado-bcrypt@exemplo.com';

let banco: BancoTemporario;
let cliente: pg.Client;
let contaId: string;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em)
     VALUES ($1, 'Conta Legado', $2, now(), now()) RETURNING id`,
    [EMAIL, HASH_EXTERNO],
  );
  contaId = (rows[0] as { id: string }).id;
});

beforeEach(async () => {
  await cliente.query('DELETE FROM sessoes WHERE conta_id = $1', [contaId]);
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

/** Chama conta_entrar numa transação desfeita no fim; devolve também o que ficou gravado dentro dela. */
const entrar = (senha: string, ip = randomBytes(32)) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ resultado: string; conta_id: string | null; nome: string | null }>(
      'SELECT * FROM conta_entrar($1, $2, $3, $4)',
      [EMAIL, senha, ip, randomBytes(32)],
    );
    await cliente.query('RESET ROLE'); // lê o que ficou gravado como owner
    const sessoes = await cliente.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [contaId]);
    const falhas = await cliente.query(
      'SELECT 1 FROM tentativas_login WHERE email = $1 AND ip_hash = $2 AND NOT sucesso',
      [EMAIL, ip],
    );
    return { ...rows[0], sessoes: sessoes.rowCount, falhas: falhas.rowCount };
  });

describe('conta com hash bcrypt de custo 12 gerado fora do pgcrypto', () => {
  it('entra com a senha atual e abre a sessão (ACE-06)', async () => {
    const r = await entrar(SENHA_DO_HASH);
    expect(r).toMatchObject({ resultado: 'ok', conta_id: contaId, nome: 'Conta Legado', sessoes: 1, falhas: 0 });
  });

  it('senha errada: resultado invalida, sem sessão, e conta uma falha de login', async () => {
    const r = await entrar('senha-errada-qualquer-9');
    expect(r).toMatchObject({ resultado: 'invalida', conta_id: null, sessoes: 0, falhas: 1 });
  });

  it('o hash gravado segue sendo o externo (a entrada não o reescreve)', async () => {
    await entrar(SENHA_DO_HASH);
    const { rows } = await cliente.query<{ senha_hash: string }>('SELECT senha_hash FROM contas WHERE id = $1', [
      contaId,
    ]);
    expect(rows[0]?.senha_hash).toBe(HASH_EXTERNO);
  });
});
