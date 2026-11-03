import net from 'node:net';
import pg from 'pg';
import { expect, test } from 'vitest';
import { comSaida, conectar } from '../src/conectar.js';

const urlLocal =
  process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/postgres';

function portaFechada(): Promise<number> {
  return new Promise((ok) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => ok(port));
    });
  });
}

test('FUN-55: porta fechada falha com a mensagem docker compose up -d e código 1', async () => {
  const porta = await portaFechada();
  const url = `postgres://postgres:postgres@127.0.0.1:${porta}/postgres`;
  await expect(conectar(url)).rejects.toThrow(/docker compose up -d/);
  const erros: string[] = [];
  const codigo = await comSaida(
    async () => {
      await conectar(url);
    },
    (m) => erros.push(m),
  );
  expect(codigo).toBe(1);
  expect(erros.join('\n')).toContain('docker compose up -d');
});

test('FUN-55: com o Postgres de pé conecta e fecha sem conexão aberta', async () => {
  const app = 'teste-fun55-conectar';
  const cliente = await conectar(urlLocal, { applicationName: app });
  const { rows } = await cliente.query('select 1 as um');
  expect(rows[0].um).toBe(1);
  await cliente.end();

  const verificador = new pg.Client({ connectionString: urlLocal });
  await verificador.connect();
  try {
    const r = await verificador.query(
      'select count(*)::int as n from pg_stat_activity where application_name = $1',
      [app],
    );
    expect(r.rows[0].n).toBe(0);
  } finally {
    await verificador.end();
  }
});
