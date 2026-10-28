import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { codigoDoErro, comoRole } from '../apoio/como-role.ts';

// Teto de pedidos de e-mail por origem (IPv4 inteiro ou /48 do IPv6) em 1 h (ACE-73; SEC-CA-02, T66). A origem chega
// só como o SHA-256 da chave. O relógio é controlado chamando, como owner, a função interna com o momento explícito;
// a função que a pelada_app executa é a mesma regra com now().

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

beforeEach(async () => {
  await cliente.query('DELETE FROM pedidos_email_origem');
});

const novaChave = () => randomBytes(32);
const BASE = Date.parse('2026-10-28T15:00:00Z');
/** Momento `minutos` depois da base. */
const em = (minutos: number) => new Date(BASE + minutos * 60_000).toISOString();

const registrarEm = async (momento: string, chave: Buffer, teto: number, db: pg.ClientBase = cliente) =>
  (
    await db.query<{ ok: boolean }>('SELECT email_origem_registrar_em($1::timestamptz, $2, $3) AS ok', [
      momento,
      chave,
      teto,
    ])
  ).rows[0]?.ok;

const linhasDa = async (chave: Buffer) =>
  Number(
    (
      await cliente.query<{ n: string }>('SELECT count(*) AS n FROM pedidos_email_origem WHERE chave_hash = $1', [
        chave,
      ])
    ).rows[0]?.n,
  );

describe('teto de e-mails por origem (ACE-73)', () => {
  it('20 pedidos passam e o 21º é recusado, sem ser gravado', async () => {
    const chave = novaChave();
    for (let i = 0; i < 20; i++) expect(await registrarEm(em(i), chave, 20)).toBe(true);
    expect(await registrarEm(em(20), chave, 20)).toBe(false);
    expect(await registrarEm(em(21), chave, 20)).toBe(false);
    expect(await linhasDa(chave)).toBe(20);
  });

  it('a janela é de 1 h: o pedido mais antigo sai da conta 1 h depois', async () => {
    const chave = novaChave();
    expect(await registrarEm(em(0), chave, 2)).toBe(true);
    expect(await registrarEm(em(30), chave, 2)).toBe(true);
    expect(await registrarEm(em(59), chave, 2)).toBe(false);
    // Exatamente 1 h depois do primeiro, ele já não conta.
    expect(await registrarEm(em(60), chave, 2)).toBe(true);
    expect(await registrarEm(em(89), chave, 2)).toBe(false);
    expect(await registrarEm(em(90), chave, 2)).toBe(true);
  });

  it('origens diferentes não dividem a contagem', async () => {
    const [a, b] = [novaChave(), novaChave()];
    expect(await registrarEm(em(0), a, 1)).toBe(true);
    expect(await registrarEm(em(0), a, 1)).toBe(false);
    expect(await registrarEm(em(0), b, 1)).toBe(true);
  });

  it('apaga os pedidos com mais de 1 h, de qualquer origem (não guarda além do necessário)', async () => {
    const [a, b] = [novaChave(), novaChave()];
    expect(await registrarEm(em(0), a, 20)).toBe(true);
    expect(await registrarEm(em(61), b, 20)).toBe(true);
    expect(await linhasDa(a)).toBe(0);
    expect(await linhasDa(b)).toBe(1);
  });

  it('teto zero ou negativo não deixa passar nada', async () => {
    const chave = novaChave();
    expect(await registrarEm(em(0), chave, 0)).toBe(false);
    expect(await registrarEm(em(0), chave, -1)).toBe(false);
    expect(await linhasDa(chave)).toBe(0);
  });
});

describe('teto de e-mails por origem: o que a pelada_app executa (ACE-73, AD-008)', () => {
  it('email_origem_registrar conta no momento atual e respeita o teto', async () => {
    const chave = novaChave();
    await comoRole(cliente, 'pelada_app', async () => {
      const r = async () =>
        (await cliente.query<{ ok: boolean }>('SELECT email_origem_registrar($1, 2) AS ok', [chave])).rows[0]?.ok;
      expect([await r(), await r(), await r()]).toEqual([true, true, false]);
      await cliente.query('RESET ROLE');
      expect(await linhasDa(chave)).toBe(2);
    });
  });

  it('a pelada_app não lê nem altera os pedidos, nem chama a função com o momento explícito', async () => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, 'SELECT 1 FROM pedidos_email_origem')).toBe('42501');
      expect(
        await codigoDoErro(cliente, "INSERT INTO pedidos_email_origem (chave_hash, momento) VALUES ('\\x00', now())"),
      ).toBe('42501');
      expect(await codigoDoErro(cliente, 'DELETE FROM pedidos_email_origem')).toBe('42501');
      expect(await codigoDoErro(cliente, "SELECT email_origem_registrar_em(now(), '\\x00', 100)")).toBe('42501');
    });
  });
});

describe('teto de e-mails por origem: concorrência (ACE-73)', () => {
  it('dez pedidos simultâneos da mesma origem com teto 4: exatamente 4 passam', async () => {
    const chave = novaChave();
    const conexoes = await Promise.all(
      Array.from({ length: 10 }, async () => {
        const c = new pg.Client({ connectionString: banco.url });
        await c.connect();
        return c;
      }),
    );
    try {
      const rs = await Promise.all(conexoes.map((c) => registrarEm(em(0), chave, 4, c)));
      expect(rs.filter(Boolean)).toHaveLength(4);
      expect(await linhasDa(chave)).toBe(4);
    } finally {
      await Promise.all(conexoes.map((c) => c.end()));
    }
  });
});
