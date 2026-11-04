// Roda o script dentro de um container `postgres:18` com `age` instalado:
//   docker run --rm -v <pasta-da-acao>:/acao:ro --entrypoint bash postgres:18 -c '<apt-get install age; ...>'
// O container fala com o Postgres local (compose) por host.docker.internal.
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { comBancoDeTeste } from '../../api/test/apoio/banco.ts';

const acao = join(import.meta.dirname, '..', '..', '..', '.github', 'actions', 'dump-cifrado');

function urlDoContainer(url: string) {
  return url.replace('127.0.0.1', 'host.docker.internal');
}

/** Executa `corpo` (bash) num container postgres:18 com age; devolve status e saídas. */
function noContainer(corpo: string) {
  const preparo = 'apt-get update -qq >/dev/null && apt-get install -y -qq age >/dev/null 2>&1';
  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${acao}:/acao:ro`,
      '--entrypoint',
      'bash',
      'postgres:18',
      '-c',
      `set -u; ${preparo}; cp /acao/dump-cifrado.sh /tmp/d.sh; chmod +x /tmp/d.sh; ${corpo}`,
    ],
    { encoding: 'utf8', timeout: 240_000 },
  );
  return { status: r.status, saida: `${r.stdout}\n${r.stderr}` };
}

describe('dump cifrado', () => {
  test('FUN-47: dump de banco com 2 grupos, decifrado, passa em pg_restore --list', async () => {
    await comBancoDeTeste(async (url) => {
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      await c.query('create table grupo (id int primary key, nome text)');
      await c.query("insert into grupo values (1, 'a'), (2, 'b')");
      await c.end();
      const r = noContainer(
        `age-keygen -o /tmp/k.txt 2>/tmp/pub.txt; PUB=$(age-keygen -y /tmp/k.txt); ` +
          `DATABASE_URL='${urlDoContainer(url)}' BACKUP_CHAVE="$PUB" SAIDA=/tmp/b.dump.age /tmp/d.sh && ` +
          `age -d -i /tmp/k.txt /tmp/b.dump.age > /tmp/b.dump && pg_restore --list /tmp/b.dump | grep -c 'TABLE DATA'`,
      );
      expect(r.status, r.saida).toBe(0);
      expect(r.saida).toMatch(/\n1\s*$/);
    });
  }, 300_000);

  test('FUN-49: URL inválida sai com código != 0 e não deixa .age', () => {
    const r = noContainer(
      `age-keygen -o /tmp/k.txt 2>/dev/null; PUB=$(age-keygen -y /tmp/k.txt); ` +
        `DATABASE_URL='postgres://x:y@127.0.0.1:1/nada' BACKUP_CHAVE="$PUB" SAIDA=/tmp/b.dump.age /tmp/d.sh; ` +
        `ST=$?; echo "STATUS=$ST"; echo "ORFAOS=$(ls /tmp/*.age /tmp/*.tmp* 2>/dev/null | wc -l)"`,
    );
    expect(r.saida).toMatch(/STATUS=[1-9]/);
    expect(r.saida).toContain('dump-cifrado: falhou');
    expect(r.saida).toContain('ORFAOS=0');
  }, 300_000);

  test('FUN-49: chave pública inválida sai com código != 0 e não deixa arquivo parcial', async () => {
    await comBancoDeTeste(async (url) => {
      const r = noContainer(
        `DATABASE_URL='${urlDoContainer(url)}' BACKUP_CHAVE="isto-nao-e-uma-chave" SAIDA=/tmp/b.dump.age /tmp/d.sh; ` +
          `ST=$?; echo "STATUS=$ST"; echo "ORFAOS=$(ls /tmp/*.age /tmp/*.tmp* 2>/dev/null | wc -l)"`,
      );
      expect(r.saida).toMatch(/STATUS=[1-9]/);
      expect(r.saida).toContain('dump-cifrado: falhou');
      expect(r.saida).toContain('ORFAOS=0');
    });
  }, 300_000);
});
