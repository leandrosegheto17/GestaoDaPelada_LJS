import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { codigoDoErro, comoRole } from '../apoio/como-role.ts';

// Teto global de e-mails por dia (ACE-72; SEC-CA-02, T63). O contador é por dia no fuso de São Paulo (ADR-012). O
// relógio é controlado chamando, como owner, a função interna com o momento explícito; a função que a pelada_app
// executa é a mesma regra com now().

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
  await cliente.query('DELETE FROM envios_email_dia');
});

const reservarEm = async (momento: string, teto: number, db: pg.ClientBase = cliente) =>
  (await db.query<{ ok: boolean }>('SELECT email_cota_reservar_em($1::timestamptz, $2) AS ok', [momento, teto])).rows[0]
    ?.ok;

const totais = async () =>
  (
    await cliente.query<{ dia: string; total: number }>(
      "SELECT to_char(dia, 'YYYY-MM-DD') AS dia, total FROM envios_email_dia ORDER BY dia",
    )
  ).rows;

describe('teto de e-mails do dia (ACE-72)', () => {
  it('reserva até o teto e recusa o envio seguinte, sem passar do teto', async () => {
    const m = '2026-10-27T15:00:00Z';
    expect([await reservarEm(m, 3), await reservarEm(m, 3), await reservarEm(m, 3)]).toEqual([true, true, true]);
    expect(await reservarEm(m, 3)).toBe(false);
    expect(await reservarEm(m, 3)).toBe(false);
    expect(await totais()).toEqual([{ dia: '2026-10-27', total: 3 }]);
  });

  it('a categoria com teto maior continua enviando depois que a de teto menor parou (80% e 100%)', async () => {
    const m = '2026-10-27T15:00:00Z';
    for (let i = 0; i < 8; i++) expect(await reservarEm(m, 8)).toBe(true);
    expect(await reservarEm(m, 8)).toBe(false);
    expect(await reservarEm(m, 10)).toBe(true);
    expect(await reservarEm(m, 10)).toBe(true);
    expect(await reservarEm(m, 10)).toBe(false);
    expect(await reservarEm(m, 8)).toBe(false);
    expect(await totais()).toEqual([{ dia: '2026-10-27', total: 10 }]);
  });

  it('teto zero não envia nem cria contador', async () => {
    expect(await reservarEm('2026-10-27T15:00:00Z', 0)).toBe(false);
    expect(await totais()).toEqual([]);
  });

  it('zera na virada do dia de São Paulo, mesmo com o dia UTC igual (23:59 e 00:01 de São Paulo)', async () => {
    // 2026-10-28T02:59Z é 27/10 23:59 em São Paulo; 2026-10-28T03:01Z é 28/10 00:01. O dia UTC é 28 nos dois.
    expect(await reservarEm('2026-10-28T02:59:00Z', 2)).toBe(true);
    expect(await reservarEm('2026-10-28T02:59:30Z', 2)).toBe(true);
    expect(await reservarEm('2026-10-28T02:59:59Z', 2)).toBe(false);
    expect(await reservarEm('2026-10-28T03:01:00Z', 2)).toBe(true);
    expect(await totais()).toEqual([
      { dia: '2026-10-27', total: 2 },
      { dia: '2026-10-28', total: 1 },
    ]);
  });

  it('não zera na virada do dia UTC, se o dia de São Paulo é o mesmo (20:00 e 22:00 de São Paulo)', async () => {
    // 2026-10-27T23:00Z é 27/10 20:00 em São Paulo; 2026-10-28T01:00Z é 27/10 22:00. Dias UTC diferentes.
    expect(await reservarEm('2026-10-27T23:00:00Z', 2)).toBe(true);
    expect(await reservarEm('2026-10-28T01:00:00Z', 2)).toBe(true);
    expect(await reservarEm('2026-10-28T02:00:00Z', 2)).toBe(false);
    expect(await totais()).toEqual([{ dia: '2026-10-27', total: 2 }]);
  });

  it('a reserva desfeita com a transação (envio que falhou) não conta', async () => {
    await cliente.query('BEGIN');
    expect(await reservarEm('2026-10-27T15:00:00Z', 1)).toBe(true);
    await cliente.query('ROLLBACK');
    expect(await totais()).toEqual([]);
    expect(await reservarEm('2026-10-27T15:00:00Z', 1)).toBe(true);
  });
});

describe('teto de e-mails: o que a pelada_app executa (ACE-72, AD-008)', () => {
  const diaDeSaoPauloHoje = async () =>
    (
      await cliente.query<{ dia: string }>(
        "SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia",
      )
    ).rows[0]?.dia;

  it('email_cota_reservar conta no dia de hoje em São Paulo e respeita o teto', async () => {
    await comoRole(cliente, 'pelada_app', async () => {
      const r = async () => (await cliente.query<{ ok: boolean }>('SELECT email_cota_reservar(2) AS ok')).rows[0]?.ok;
      expect([await r(), await r(), await r()]).toEqual([true, true, false]);
      await cliente.query('RESET ROLE');
      expect(await totais()).toEqual([{ dia: await diaDeSaoPauloHoje(), total: 2 }]);
    });
  });

  it('a pelada_app não lê nem altera o contador, nem chama a função com o momento explícito', async () => {
    await comoRole(cliente, 'pelada_app', async () => {
      expect(await codigoDoErro(cliente, 'SELECT 1 FROM envios_email_dia')).toBe('42501');
      expect(await codigoDoErro(cliente, "INSERT INTO envios_email_dia (dia, total) VALUES ('2026-10-27', 0)")).toBe(
        '42501',
      );
      expect(await codigoDoErro(cliente, 'DELETE FROM envios_email_dia')).toBe('42501');
      expect(await codigoDoErro(cliente, "SELECT email_cota_reservar_em('2000-01-01', 100)")).toBe('42501');
    });
  });
});

describe('teto de e-mails: concorrência (ACE-72)', () => {
  async function outraConexao(): Promise<pg.Client> {
    const c = new pg.Client({ connectionString: banco.url });
    await c.connect();
    return c;
  }

  it('com uma vaga, dois envios simultâneos: um reserva e o outro espera e é recusado', async () => {
    const m = '2026-10-27T15:00:00Z';
    expect(await reservarEm(m, 2)).toBe(true);
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      await c1.query('BEGIN');
      expect(await reservarEm(m, 2, c1)).toBe(true);
      await c2.query('BEGIN');
      const segunda = reservarEm(m, 2, c2);
      const resolvida = await Promise.race([
        segunda.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 300)),
      ]);
      expect(resolvida).toBe(false);
      await c1.query('COMMIT');
      expect(await segunda).toBe(false);
      await c2.query('COMMIT');
      expect(await totais()).toEqual([{ dia: '2026-10-27', total: 2 }]);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it('se o primeiro envio desfaz a reserva, o que esperava fica com a vaga', async () => {
    const m = '2026-10-27T15:00:00Z';
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      await c1.query('BEGIN');
      expect(await reservarEm(m, 1, c1)).toBe(true);
      await c2.query('BEGIN');
      const segunda = reservarEm(m, 1, c2);
      await c1.query('ROLLBACK');
      expect(await segunda).toBe(true);
      await c2.query('COMMIT');
      expect(await totais()).toEqual([{ dia: '2026-10-27', total: 1 }]);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it('dez envios simultâneos com teto 4: exatamente 4 reservam', async () => {
    const m = '2026-10-27T15:00:00Z';
    const conexoes = await Promise.all(Array.from({ length: 10 }, outraConexao));
    try {
      const rs = await Promise.all(conexoes.map((c) => reservarEm(m, 4, c)));
      expect(rs.filter(Boolean)).toHaveLength(4);
      expect(await totais()).toEqual([{ dia: '2026-10-27', total: 4 }]);
    } finally {
      await Promise.all(conexoes.map((c) => c.end()));
    }
  });
});
