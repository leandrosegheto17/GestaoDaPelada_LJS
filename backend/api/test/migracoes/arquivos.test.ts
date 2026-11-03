import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from 'vitest';

const pasta = resolve(import.meta.dirname, '../../src/infraestrutura/db/migracoes');
const sqls = () =>
  readdirSync(pasta)
    .filter((n) => n.endsWith('.sql'))
    .sort();

function esperados(): Map<string, string> {
  const linhas = readFileSync(resolve(pasta, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .filter(Boolean);
  return new Map(
    linhas.map((l) => {
      const [hash, nome] = l.split(/\s+/);
      return [nome!, hash!];
    }),
  );
}

test('FUN-08: são exatamente 23 migrações .sql e o migracoes.sha256 lista as mesmas', () => {
  const arquivos = sqls();
  expect(arquivos).toHaveLength(23);
  expect([...esperados().keys()].sort()).toEqual(arquivos);
});

test('FUN-08: o SHA-256 de cada migração é igual ao registrado na origem', () => {
  const hashes = esperados();
  for (const nome of sqls()) {
    const real = createHash('sha256')
      .update(readFileSync(resolve(pasta, nome)))
      .digest('hex');
    expect(real, nome).toBe(hashes.get(nome));
  }
});

test('FUN-09: a ordem lexical dos nomes é a ordem cronológica do timestamp', () => {
  const ts = sqls().map((n) => Number(n.split('_')[0]));
  expect(ts).toEqual([...ts].sort((a, b) => a - b));
  expect(ts[0]).toBe(1792843200000);
  expect(ts.at(-1)).toBe(1792844520000);
});
