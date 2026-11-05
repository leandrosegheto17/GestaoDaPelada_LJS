import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { migrar, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { bancoDeTeste, comCliente } from '../apoio/banco.ts';

const ARQUIVOS = readdirSync(PASTA_MIGRACOES)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => f.replace(/\.sql$/, ''));

async function registradas(url: string): Promise<string[]> {
  return comCliente(url, async (c) =>
    (await c.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id')).rows.map(
      (r) => r.name,
    ),
  );
}

async function existeTabela(url: string, nome: string): Promise<boolean> {
  return comCliente(url, async (c) => {
    const r = await c.query<{ existe: boolean }>('SELECT to_regclass($1) IS NOT NULL AS existe', [
      `public.${nome}`,
    ]);
    return r.rows[0]?.existe === true;
  });
}

describe('migrar', () => {
  it('FUN-07: banco vazio, depois migrar, registra as 23 na ordem dos arquivos', async () => {
    await bancoDeTeste(async (url) => {
      const aplicadas = await migrar(url);
      expect(aplicadas).toEqual(ARQUIVOS);
      expect(await registradas(url)).toEqual(ARQUIVOS);
      expect(ARQUIVOS).toHaveLength(23);
    });
  });

  it('FUN-07: migrar de novo não aplica nada', async () => {
    await bancoDeTeste(async (url) => {
      await migrar(url);
      expect(await migrar(url)).toEqual([]);
      expect(await registradas(url)).toEqual(ARQUIVOS);
    });
  });

  it('FUN-07: migração que falha no meio não deixa DDL parcial dela', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pelada-migracoes-'));
    try {
      writeFileSync(join(pasta, '1000_a.sql'), '-- Up Migration\nCREATE TABLE exemplo_a (x int);\n');
      writeFileSync(
        join(pasta, '2000_b.sql'),
        '-- Up Migration\nCREATE TABLE exemplo_b (x int);\nSELECT 1 / 0;\nCREATE TABLE exemplo_c (x int);\n',
      );
      await bancoDeTeste(async (url) => {
        await expect(migrar(url, { pasta })).rejects.toThrow();
        expect(await existeTabela(url, 'exemplo_a')).toBe(true);
        expect(await existeTabela(url, 'exemplo_b')).toBe(false);
        expect(await existeTabela(url, 'exemplo_c')).toBe(false);
        expect(await registradas(url)).toEqual(['1000_a']);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('FUN-07: só arquivos .sql entram', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'pelada-migracoes-'));
    try {
      writeFileSync(join(pasta, '1000_a.sql'), '-- Up Migration\nCREATE TABLE exemplo_a (x int);\n');
      writeFileSync(join(pasta, 'notas.txt'), 'não é migração');
      writeFileSync(join(pasta, 'migracoes.sha256'), 'abc  1000_a.sql\n');
      await bancoDeTeste(async (url) => {
        expect(await migrar(url, { pasta })).toEqual(['1000_a']);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('FUN-07: duas execuções simultâneas aplicam cada migração uma vez', async () => {
    await bancoDeTeste(async (url) => {
      const [a, b] = await Promise.all([migrar(url), migrar(url)]);
      expect([...a, ...b].sort()).toEqual([...ARQUIVOS].sort());
      const nomes = await registradas(url);
      expect(nomes).toEqual(ARQUIVOS);
      expect(new Set(nomes).size).toBe(nomes.length);
    });
  });
});
