import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Bloqueio por conta após 5 falhas da senha atual em conta_trocar_senha e conta_excluir (ACE-70; SEC-CA-03, T61).
// Como pelada_app, uma transação confirmada por chamada (cada uma é uma requisição). O relógio é controlado movendo
// os momentos das falhas como owner, como nos testes do login (ACE-13, ACE-14).
const SENHA = 'senha-certa-1';
// Passa no teste de formato bcrypt das funções ('$2_$%'), mas o crypt recusa (custo 99): se a função rodar o
// bcrypt com este hash, a chamada falha. Serve para provar que a tentativa bloqueada não roda o bcrypt.
const HASH_QUE_QUEBRA_O_CRYPT = '$2a$99$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

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

interface Conta {
  id: string;
  email: string;
  sessao: Buffer;
}

/** Conta confirmada com uma sessão aberta pelo login. */
async function novaConta(): Promise<Conta> {
  const email = `bloqueio${++sequencia}@exemplo.com`;
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Bloqueio', $2, '2026-10-27', $3)",
      [email, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  const sessao = novoHash();
  expect(await entrar(email, SENHA, sessao)).toBe('ok');
  return { id, email, sessao };
}

const entrar = (email: string, senha: string, token = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ resultado: string }>('SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
      email,
      senha,
      novoHash(),
      token,
    ]);
    return rows[0]?.resultado;
  });

/** true: trocou; false: senha atual errada; null: bloqueado. */
const trocarSenha = (c: Conta, atual: string, nova = 'senha-nova-123', db: pg.ClientBase = cliente) =>
  comoApp(db, { conta: c.id }, async () => {
    const { rows } = await db.query<{ r: boolean | null }>('SELECT conta_trocar_senha($1, $2, $3) AS r', [
      atual,
      nova,
      c.sessao,
    ]);
    return rows[0]?.r;
  });

const excluir = (c: Conta, senha: string) =>
  comoApp(cliente, { conta: c.id }, async () => {
    const { rows } = await cliente.query<{ resultado: string }>('SELECT resultado FROM conta_excluir($1)', [senha]);
    return rows[0]?.resultado;
  });

async function errarTroca(c: Conta, n: number): Promise<void> {
  for (let i = 0; i < n; i++) expect(await trocarSenha(c, 'senha-errada')).toBe(false);
}

async function errarExclusao(c: Conta, n: number): Promise<void> {
  for (let i = 0; i < n; i++) expect(await excluir(c, 'senha-errada')).toBe('senha_incorreta');
}

const falhasDa = async (c: Conta) =>
  Number(
    (await cliente.query<{ n: string }>('SELECT count(*) AS n FROM falhas_senha_atual WHERE conta_id = $1', [c.id]))
      .rows[0]?.n,
  );

/** Move as falhas da conta para o passado: a i-ésima (em ordem de gravação) recua `minutos[i]` minutos. */
async function recuarFalhas(c: Conta, minutos: number[]): Promise<void> {
  const { rows } = await cliente.query<{ id: string }>(
    'SELECT id FROM falhas_senha_atual WHERE conta_id = $1 ORDER BY id',
    [c.id],
  );
  for (const [i, { id }] of rows.entries()) {
    await cliente.query(
      'UPDATE falhas_senha_atual SET momento = now() - make_interval(secs => $2::float8 * 60) WHERE id = $1',
      [id, minutos[i] ?? 0],
    );
  }
}

/** A conta, as sessões e os vínculos, para provar que nada mudou. */
async function retrato(c: Conta) {
  const um = async (sql: string) => (await cliente.query(sql, [c.id])).rows;
  return {
    conta: await um('SELECT md5(t::text) AS h FROM contas t WHERE id = $1'),
    sessoes: await um('SELECT md5(t::text) AS h FROM sessoes t WHERE conta_id = $1 ORDER BY 1'),
    vinculos: await um('SELECT md5(t::text) AS h FROM vinculos_admin t WHERE conta_id = $1 ORDER BY 1'),
  };
}

describe('bloqueio da senha atual por conta (ACE-70)', () => {
  it('5 falhas na troca: a 6ª, mesmo com a senha certa, é bloqueada e não troca nada', async () => {
    const c = await novaConta();
    await errarTroca(c, 5);
    const antes = await retrato(c);

    expect(await trocarSenha(c, SENHA)).toBeNull();

    expect(await retrato(c)).toEqual(antes);
    expect(await entrar(c.email, SENHA)).toBe('ok');
    expect(await entrar(c.email, 'senha-nova-123')).toBe('invalida');
  });

  it('5 falhas na exclusão: a 6ª, mesmo com a senha certa, é bloqueada e a conta não é excluída', async () => {
    const c = await novaConta();
    await errarExclusao(c, 5);
    const antes = await retrato(c);

    expect(await excluir(c, SENHA)).toBe('bloqueado');

    expect(await retrato(c)).toEqual(antes);
    expect(await entrar(c.email, SENHA)).toBe('ok');
  });

  it('a tentativa bloqueada não roda o bcrypt (com um hash que faria o crypt falhar, a resposta é o bloqueio)', async () => {
    // Controle: sem bloqueio, o hash quebra o crypt nas duas funções.
    const controle = await novaConta();
    await cliente.query('UPDATE contas SET senha_hash = $2 WHERE id = $1', [controle.id, HASH_QUE_QUEBRA_O_CRYPT]);
    await expect(trocarSenha(controle, SENHA)).rejects.toThrow(/invalid salt/);
    await expect(excluir(controle, SENHA)).rejects.toThrow(/invalid salt/);

    const c = await novaConta();
    await errarTroca(c, 5);
    await cliente.query('UPDATE contas SET senha_hash = $2 WHERE id = $1', [c.id, HASH_QUE_QUEBRA_O_CRYPT]);
    expect(await trocarSenha(c, SENHA)).toBeNull();
    expect(await excluir(c, SENHA)).toBe('bloqueado');
  });

  it('a tentativa bloqueada não é contada: são 5 falhas e o prazo segue sendo o da quinta', async () => {
    const c = await novaConta();
    await errarTroca(c, 5);
    expect(await trocarSenha(c, 'senha-errada')).toBeNull();
    expect(await excluir(c, 'senha-errada')).toBe('bloqueado');
    expect(await falhasDa(c)).toBe(5);
  });

  it('4 falhas não bloqueiam', async () => {
    const c = await novaConta();
    await errarTroca(c, 4);
    expect(await trocarSenha(c, SENHA)).toBe(true);
  });

  it('a senha certa na troca antes do limite zera a contagem: depois, mais 4 falhas não bloqueiam', async () => {
    const c = await novaConta();
    await errarTroca(c, 4);
    expect(await trocarSenha(c, SENHA, 'senha-nova-123')).toBe(true);
    expect(await falhasDa(c)).toBe(0);
    await errarTroca(c, 4);
    expect(await trocarSenha(c, 'senha-nova-123', 'senha-nova-456')).toBe(true);
  });

  it('a senha certa na exclusão recusada por única admin também zera a contagem', async () => {
    const c = await novaConta();
    const { rows } = await cliente.query<{ id: string }>(
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ('Grupo Solo', $1, 'quarta', 'semanal', '20:00', $2, now()) RETURNING id`,
      [`g-bloqueio-${sequencia}`, c.id],
    );
    await cliente.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
      [c.id, rows[0]?.id],
    );
    await errarExclusao(c, 4);
    expect(await excluir(c, SENHA)).toBe('unico_admin');
    await errarExclusao(c, 4);
    expect(await trocarSenha(c, SENHA)).toBe(true);
  });

  it('ainda bloqueado 14 min depois da quinta falha; liberado 15 min depois', async () => {
    const c = await novaConta();
    await errarTroca(c, 5);
    await recuarFalhas(c, [14, 14, 14, 14, 14]);
    expect(await trocarSenha(c, SENHA)).toBeNull();
    expect(await excluir(c, SENHA)).toBe('bloqueado');
    await recuarFalhas(c, [15, 15, 15, 15, 15]);
    expect(await trocarSenha(c, SENHA)).toBe(true);
  });

  it('o prazo conta da quinta falha, mesmo quando a primeira já passou dos 15 min', async () => {
    const c = await novaConta();
    await errarTroca(c, 5);
    await recuarFalhas(c, [16, 12, 12, 12, 12]);
    expect(await trocarSenha(c, SENHA)).toBeNull();
  });

  it('5 falhas espalhadas por mais de 15 min não bloqueiam', async () => {
    const c = await novaConta();
    await errarTroca(c, 5);
    await recuarFalhas(c, [40, 30, 20, 10, 1]);
    expect(await trocarSenha(c, SENHA)).toBe(true);
  });

  it('as duas rotas somam as falhas da mesma conta (3 na troca e 2 na exclusão bloqueiam as duas)', async () => {
    const c = await novaConta();
    await errarTroca(c, 3);
    await errarExclusao(c, 2);
    expect(await trocarSenha(c, SENHA)).toBeNull();
    expect(await excluir(c, SENHA)).toBe('bloqueado');
  });

  it('o bloqueio é por conta: outra conta não é afetada', async () => {
    const c = await novaConta();
    const outra = await novaConta();
    await errarTroca(c, 5);
    expect(await trocarSenha(c, SENHA)).toBeNull();

    expect(await trocarSenha(outra, SENHA)).toBe(true);
    expect(await falhasDa(outra)).toBe(0);
  });

  it('a exclusão concluída apaga as falhas da conta', async () => {
    const c = await novaConta();
    await errarExclusao(c, 2);
    expect(await excluir(c, SENHA)).toBe('ok');
    expect(await falhasDa(c)).toBe(0);
  });
});

describe('bloqueio da senha atual: concorrência (ACE-70, como o ACE-66)', () => {
  async function outraConexao(): Promise<pg.Client> {
    const c = new pg.Client({ connectionString: banco.url });
    await c.connect();
    return c;
  }

  it('duas falhas simultâneas da mesma conta contam 2', async () => {
    const c = await novaConta();
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      const rs = await Promise.all([
        trocarSenha(c, 'errada-1', undefined, c1),
        trocarSenha(c, 'errada-2', undefined, c2),
      ]);
      expect(rs).toEqual([false, false]);
      expect(await falhasDa(c)).toBe(2);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it('com 4 falhas, duas tentativas erradas simultâneas: uma grava a quinta e a outra já encontra o bloqueio', async () => {
    const c = await novaConta();
    await errarTroca(c, 4);
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      // A primeira fica com a transação aberta depois de errar; a segunda precisa esperar a trava da conta.
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE pelada_app');
      await c1.query("SELECT set_config('app.conta_id', $1, true)", [c.id]);
      const primeira = (
        await c1.query<{ r: boolean | null }>('SELECT conta_trocar_senha($1, $2, $3) AS r', [
          'errada',
          'senha-nova-123',
          c.sessao,
        ])
      ).rows[0]?.r;
      const segunda = trocarSenha(c, 'errada', undefined, c2);
      const resolvida = await Promise.race([
        segunda.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 300)),
      ]);
      expect(resolvida).toBe(false);
      await c1.query('COMMIT');

      expect(primeira).toBe(false);
      expect(await segunda).toBeNull();
      expect(await falhasDa(c)).toBe(5);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });
});
