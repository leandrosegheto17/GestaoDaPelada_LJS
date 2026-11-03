import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { bancoDeTeste } from '../../api/test/apoio/banco.js';
import { contarLinhas, restaurarBackup } from '../ops/restaurar-backup.ts';

/*
 * Integração: gera um dump cifrado com o dump-cifrado.sh dentro do container postgres:18 com age
 * (imagem `pelada-dump-teste`, a mesma do teste do dump) e restaura com restaurarBackup.
 * Requer o Postgres do compose no ar (docker compose up -d --wait) e o Docker.
 */
const raiz = resolve(import.meta.dirname, '../../..');
const IMAGEM = 'pelada-dump-teste';
const saida = mkdtempSync(resolve(tmpdir(), 'restaurar-'));

const dockerRun = (script: string) =>
  spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--add-host',
      'host.docker.internal:host-gateway',
      '-v',
      `${raiz}:/repo:ro`,
      '-v',
      `${saida}:/out`,
      IMAGEM,
      'bash',
      '-c',
      script,
    ],
    { encoding: 'utf8', timeout: 120_000 },
  );

async function comCliente<T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const ROLES = ['pelada_app', 'pelada_backup_ro', 'pelada_owner'];
let rolesPreexistentes: string[] = [];

beforeAll(async () => {
  rolesPreexistentes = await bancoDeTeste((url) =>
    comCliente(url, async (c) => {
      const r = await c.query<{ rolname: string }>(
        'select rolname from pg_roles where rolname = any($1)',
        [ROLES],
      );
      return r.rows.map((l) => l.rolname);
    }),
  );

  const r = spawnSync(
    'docker',
    [
      'build',
      '-q',
      '-t',
      IMAGEM,
      '-f',
      resolve(raiz, '.github/actions/dump-cifrado/teste.Dockerfile'),
      resolve(raiz, '.github/actions/dump-cifrado'),
    ],
    { encoding: 'utf8', timeout: 280_000 },
  );
  expect(r.status, r.stderr).toBe(0);
}, 300_000);

afterAll(async () => {
  rmSync(saida, { recursive: true, force: true });
  // a restauração cria roles que faltam no cluster; o teste devolve o cluster como estava
  await bancoDeTeste((url) =>
    comCliente(url, async (c) => {
      for (const role of ROLES.filter((r) => !rolesPreexistentes.includes(r)))
        await c.query(`drop role if exists ${c.escapeIdentifier(role)}`);
    }),
  );
});

test('FUN-50: dump cifrado restaurado em banco vazio dá a mesma contagem de linhas por tabela', async () => {
  await bancoDeTeste(async (origem) => {
    await comCliente(origem, async (c) => {
      await c.query('create table grupos (id int primary key, nome text)');
      await c.query('create table jogadores (id int primary key, grupo_id int references grupos)');
      await c.query("insert into grupos values (1, 'a'), (2, 'b')");
      await c.query('insert into jogadores values (1, 1), (2, 1), (3, 2)');
    });
    const dump = dockerRun(`
      set -euo pipefail
      age-keygen -o /out/chave.txt 2>/dev/null
      DUMP_URL='${origem.replace('127.0.0.1', 'host.docker.internal')}' BACKUP_CHAVE="$(age-keygen -y /out/chave.txt)" \
        SAIDA=/out/backup.dump.age bash /repo/.github/actions/dump-cifrado/dump-cifrado.sh
    `);
    expect(dump.status, dump.stderr).toBe(0);

    await bancoDeTeste(async (destino) => {
      const contagem = await restaurarBackup({
        arquivo: resolve(saida, 'backup.dump.age'),
        chavePrivada: resolve(saida, 'chave.txt'),
        url: destino,
      });
      expect(contagem).toEqual({ grupos: 2, jogadores: 3 });
      expect(contagem).toEqual(await contarLinhas(origem));
    });
  });
}, 180_000);

test('FUN-50: restaura dump cujas policies citam roles que o destino ainda não tem', async () => {
  await bancoDeTeste(async (origem) => {
    const existia = await comCliente(origem, async (c) => {
      const r = await c.query("select 1 from pg_roles where rolname = 'pelada_app'");
      if (r.rowCount === 0) await c.query('create role pelada_app nologin');
      return (r.rowCount ?? 0) > 0;
    });
    try {
      await comCliente(origem, async (c) => {
        await c.query('create table grupos (id int primary key)');
        await c.query('alter table grupos enable row level security');
        await c.query('create policy ler on grupos for select to pelada_app using (true)');
        await c.query('insert into grupos values (1)');
      });
      const dump = dockerRun(`
        set -euo pipefail
        age-keygen -o /out/chave2.txt 2>/dev/null
        DUMP_URL='${origem.replace('127.0.0.1', 'host.docker.internal')}' BACKUP_CHAVE="$(age-keygen -y /out/chave2.txt)"           SAIDA=/out/backup2.dump.age bash /repo/.github/actions/dump-cifrado/dump-cifrado.sh
      `);
      expect(dump.status, dump.stderr).toBe(0);
      if (!existia) {
        await comCliente(origem, async (c) => {
          await c.query('drop owned by pelada_app');
          await c.query('drop role pelada_app');
        });
      }
      await bancoDeTeste(async (destino) => {
        const contagem = await restaurarBackup({
          arquivo: resolve(saida, 'backup2.dump.age'),
          chavePrivada: resolve(saida, 'chave2.txt'),
          url: destino,
        });
        expect(contagem).toEqual({ grupos: 1 });
      });
    } finally {
      if (!existia) {
        await comCliente(origem, async (c) => {
          await c.query('drop role if exists pelada_app');
        }).catch(() => undefined);
      }
    }
  });
}, 180_000);

test('FUN-50: recusa restaurar num host fora da lista de permitidos', async () => {
  await expect(
    restaurarBackup({
      arquivo: resolve(saida, 'x.age'),
      chavePrivada: resolve(saida, 'x.txt'),
      url: 'postgres://u:s@ep-x.us-east-2.aws.neon.tech/neondb',
    }),
  ).rejects.toThrow(/host/i);
});

test('FUN-50: recusa restaurar num banco que já tem tabelas', async () => {
  writeFileSync(resolve(saida, 'qualquer.age'), 'x');
  writeFileSync(resolve(saida, 'qualquer.txt'), 'x');
  await bancoDeTeste(async (destino) => {
    await comCliente(destino, (c) => c.query('create table existente (id int)'));
    await expect(
      restaurarBackup({
        arquivo: resolve(saida, 'qualquer.age'),
        chavePrivada: resolve(saida, 'qualquer.txt'),
        url: destino,
      }),
    ).rejects.toThrow(/já tem tabelas/);
  });
});
