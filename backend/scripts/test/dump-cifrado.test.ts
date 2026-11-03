import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { bancoDeTeste } from '../../api/test/apoio/banco.js';

/*
 * Teste de integração do dump-cifrado.sh. Roda dentro de um container postgres:18 com age
 * (imagem local `pelada-dump-teste`, construída de .github/actions/dump-cifrado/teste.Dockerfile).
 * Comando equivalente, à mão:
 *   docker build -t pelada-dump-teste -f .github/actions/dump-cifrado/teste.Dockerfile .github/actions/dump-cifrado
 *   docker run --rm --add-host host.docker.internal:host-gateway -v <repo>:/repo:ro -v <saida>:/out \
 *     pelada-dump-teste bash -c '<script do teste>'
 * Requer o Postgres do compose no ar (docker compose up -d --wait).
 */
const raiz = resolve(import.meta.dirname, '../../..');
const IMAGEM = 'pelada-dump-teste';
const saida = mkdtempSync(resolve(tmpdir(), 'dump-cifrado-'));

function docker(args: string[], timeout = 120_000) {
  return spawnSync('docker', args, { encoding: 'utf8', timeout });
}

/** Roda um script bash no container; o banco do host aparece como host.docker.internal. */
function noContainer(script: string) {
  return docker([
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
  ]);
}

const paraContainer = (url: string) => url.replace('127.0.0.1', 'host.docker.internal');
const SCRIPT = '/repo/.github/actions/dump-cifrado/dump-cifrado.sh';

beforeAll(() => {
  const r = docker(
    [
      'build',
      '-q',
      '-t',
      IMAGEM,
      '-f',
      resolve(raiz, '.github/actions/dump-cifrado/teste.Dockerfile'),
      resolve(raiz, '.github/actions/dump-cifrado'),
    ],
    280_000,
  );
  expect(r.status, r.stderr).toBe(0);
}, 300_000);

afterAll(() => rmSync(saida, { recursive: true, force: true }));

test('FUN-47: dump de banco com 2 grupos decifra e passa em pg_restore --list', async () => {
  await bancoDeTeste(async (url) => {
    const { default: pg } = await import('pg');
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    await c.query('create table grupos (id int primary key, nome text)');
    await c.query("insert into grupos values (1, 'grupo-a'), (2, 'grupo-b')");
    await c.end();

    const r = noContainer(`
      set -euo pipefail
      age-keygen -o /out/chave.txt 2>/out/pub.txt
      PUB=$(age-keygen -y /out/chave.txt)
      DUMP_URL='${paraContainer(url)}' BACKUP_CHAVE="$PUB" SAIDA=/out/backup.dump.age bash ${SCRIPT}
      age -d -i /out/chave.txt /out/backup.dump.age > /out/backup.dump
      pg_restore --list /out/backup.dump > /out/lista.txt
      pg_restore -f - /out/backup.dump | grep -E 'grupo-a|grupo-b'
    `);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('grupo-a');
    expect(r.stdout).toContain('grupo-b');
  });
}, 120_000);

test('FUN-49: URL inválida sai com código diferente de 0 e não deixa .age', () => {
  const r = noContainer(`
    rm -f /out/*.age*
    age-keygen -o /out/chave2.txt 2>/dev/null
    PUB=$(age-keygen -y /out/chave2.txt)
    set +e
    DUMP_URL='postgres://postgres:x@host.docker.internal:1/nao_existe' BACKUP_CHAVE="$PUB" SAIDA=/out/invalido.dump.age bash ${SCRIPT}
    echo "CODIGO=$?"
    ls /out | grep -c '\\.age' || true
  `);
  expect(r.stdout).not.toMatch(/CODIGO=0/);
  expect(r.stdout).toMatch(/CODIGO=(?!0|127)\d+/);
  expect(readdirSync(saida).filter((n) => n.includes('.age'))).toEqual([]);
}, 120_000);

test('FUN-49: chave pública inválida sai com código diferente de 0 e não deixa arquivo parcial', async () => {
  await bancoDeTeste(async (url) => {
    const r = noContainer(`
      set +e
      DUMP_URL='${paraContainer(url)}' BACKUP_CHAVE='chave-invalida' SAIDA=/out/chaveruim.dump.age bash ${SCRIPT}
      echo "CODIGO=$?"
    `);
    expect(r.stdout).toMatch(/CODIGO=(?!0|127)\d+/);
    expect(readdirSync(saida).filter((n) => n.startsWith('chaveruim'))).toEqual([]);
  });
}, 120_000);
