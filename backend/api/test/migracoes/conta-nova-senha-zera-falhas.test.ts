import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// A recuperação de senha zera as falhas de login do e-mail (ACE-76, ACE-74; SEC-CA-15, T72): com 50 falhas de origens
// diferentes, o login do e-mail fica bloqueado (ACE-74); a nova senha pela recuperação (link_nova_senha) apaga as
// falhas do e-mail e o dono entra com a senha nova. As falhas de outro e-mail não são tocadas. Chamadas como
// pelada_app, cada uma numa transação; as falhas são gravadas como owner, como no teste do teto por conta (T67).
const SENHA = 'senha-certa-1';
const SENHA_NOVA = 'senha-nova-9';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

let sequencia = 0;
const novoHash = () => randomBytes(32);

async function novaConta(): Promise<string> {
  const email = `zera-falhas${++sequencia}@exemplo.com`;
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Zera', $2, '2026-10-28', $3)",
      [email, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  return email;
}

const entrar = (email: string, senha: string) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ resultado: string }>('SELECT * FROM conta_entrar($1, $2, $3, $4)', [
      email,
      senha,
      novoHash(),
      novoHash(),
    ]);
    return rows[0]?.resultado;
  });

const pedirRecuperacao = (email: string, token: Buffer) =>
  comoApp(cliente, {}, async () => {
    await cliente.query("SELECT * FROM link_pedir($1, 'recuperacao', $2)", [email, token]);
  });

const novaSenha = (token: Buffer, senha: string) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ r: boolean }>('SELECT link_nova_senha($1, $2) AS r', [token, senha]);
    return rows[0]?.r;
  });

/** Grava `n` falhas do e-mail, cada uma de uma origem diferente, a i-ésima `50 - i` minutos atrás. */
async function falhasDeOrigensDiferentes(email: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await cliente.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
       VALUES ($1, digest($2::text, 'sha256'), now() - make_interval(secs => $3::float8 * 60), false)`,
      [email, `3fff:${sequencia}:${i}:1`, 50 - i],
    );
  }
}

async function falhasDe(email: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM tentativas_login WHERE email = $1 AND NOT sucesso',
    [email],
  );
  return rows[0]?.n ?? 0;
}

describe('link_nova_senha zera as falhas de login do e-mail (ACE-76)', () => {
  it('conta bloqueada por 50 falhas: a nova senha pela recuperação libera o login com a senha nova', async () => {
    const email = await novaConta();
    await falhasDeOrigensDiferentes(email, 50);
    expect(await entrar(email, SENHA)).toBe('bloqueado');

    const token = novoHash();
    await pedirRecuperacao(email, token);
    expect(await novaSenha(token, SENHA_NOVA)).toBe(true);

    expect(await entrar(email, SENHA_NOVA)).toBe('ok');
    expect(await falhasDe(email)).toBe(0);
  });

  it('as falhas de outro e-mail seguem intactas e ele continua bloqueado', async () => {
    const email = await novaConta();
    const outro = await novaConta();
    await falhasDeOrigensDiferentes(email, 50);
    await falhasDeOrigensDiferentes(outro, 50);

    const token = novoHash();
    await pedirRecuperacao(email, token);
    expect(await novaSenha(token, SENHA_NOVA)).toBe(true);

    expect(await falhasDe(outro)).toBe(50);
    expect(await entrar(outro, SENHA)).toBe('bloqueado');
  });

  it('mantém a assinatura e o retorno (o Worker anterior segue chamando-a no rollback)', async () => {
    const { rows } = await cliente.query<{ args: string; ret: string; n: number }>(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args, pg_get_function_result(p.oid) AS ret,
              count(*) OVER ()::int AS n
         FROM pg_proc p WHERE p.proname = 'link_nova_senha' AND p.pronamespace = 'public'::regnamespace`,
    );
    expect(rows).toEqual([{ args: 'p_token_hash bytea, p_senha text', ret: 'boolean', n: 1 }]);
  });

  it('link inválido: false, as falhas do e-mail ficam e o login segue bloqueado', async () => {
    const email = await novaConta();
    await falhasDeOrigensDiferentes(email, 50);

    expect(await novaSenha(novoHash(), SENHA_NOVA)).toBe(false);

    expect(await falhasDe(email)).toBe(50);
    expect(await entrar(email, SENHA)).toBe('bloqueado');
  });
});
