import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';

// A reserva da cota de e-mails espera no máximo 2 s pela trava da linha do dia (ACE-75; SEC-CA-13, T68). Uma
// transação segura a linha (como uma requisição esperando o Resend) e outra tenta reservar: a segunda desiste em
// cerca de 2 s com o erro 55P03 (lock_not_available), em vez de esperar o fim da primeira.

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

async function comoAppAberta(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: banco.url });
  await c.connect();
  await c.query('BEGIN');
  await c.query('SET LOCAL ROLE pelada_app');
  return c;
}

const reservar = async (c: pg.ClientBase, teto = 1_000_000) =>
  (await c.query<{ ok: boolean }>('SELECT email_cota_reservar($1) AS ok', [teto])).rows[0]?.ok;

describe('email_cota_reservar: tempo máximo de espera pela trava (ACE-75)', () => {
  it.each([
    ['com a linha do dia já criada', true],
    ['com a linha do dia sendo criada pela outra transação', false],
  ])('%s: a segunda reserva desiste em cerca de 2 s com 55P03', async (_nome, linhaExiste) => {
    if (linhaExiste) {
      await cliente.query(
        "INSERT INTO envios_email_dia (dia, total) VALUES ((now() AT TIME ZONE 'America/Sao_Paulo')::date, 1)",
      );
    }
    const [c1, c2] = [await comoAppAberta(), await comoAppAberta()];
    try {
      expect(await reservar(c1)).toBe(true);
      const inicio = performance.now();
      const segunda = reservar(c2).then(
        () => 'reservou',
        (erro: { code?: string }) => erro.code ?? 'sem-codigo',
      );
      // Sem o tempo máximo, a segunda espera a primeira terminar: aqui ela nunca termina antes de 6 s.
      const resultado = await Promise.race([segunda, new Promise((r) => setTimeout(() => r('esperando'), 6_000))]);
      const decorrido = performance.now() - inicio;
      expect(resultado).toBe('55P03');
      expect(decorrido).toBeGreaterThanOrEqual(1_900);
      expect(decorrido).toBeLessThan(4_000);
    } finally {
      await Promise.all([c1.query('ROLLBACK'), c2.query('ROLLBACK')]);
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it('o tempo máximo vale só dentro da função: depois dela, a transação volta ao lock_timeout de antes', async () => {
    const c = await comoAppAberta();
    try {
      expect(await reservar(c)).toBe(true);
      const { rows } = await c.query<{ lock_timeout: string }>('SHOW lock_timeout');
      expect(rows[0]?.lock_timeout).toBe('0');
    } finally {
      await c.query('ROLLBACK');
      await c.end();
    }
  });
});
