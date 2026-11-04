import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';

export const PASTA = join(
  import.meta.dirname,
  '..',
  '..',
  'src',
  'infraestrutura',
  'db',
  'migracoes',
);

function hashes(): Record<string, string> {
  const lista = readFileSync(join(PASTA, 'migracoes.sha256'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => l.trim().split(/\s+/) as [string, string]);
  return Object.fromEntries(lista.map(([h, n]) => [n.replace(/^\*/, ''), h]));
}

const sqls = () =>
  readdirSync(PASTA)
    .filter((n) => n.endsWith('.sql'))
    .sort();
const sha = (n: string) =>
  createHash('sha256')
    .update(readFileSync(join(PASTA, n)))
    .digest('hex');

let restaurar: (() => void) | undefined;
afterEach(() => restaurar?.());

test('FUN-08: o SHA-256 dos 23 arquivos bate com o migracoes.sha256 da origem', () => {
  const esperado = hashes();
  expect(Object.keys(esperado).sort()).toEqual(sqls());
  for (const nome of sqls()) expect(sha(nome), nome).toBe(esperado[nome]);
});

test('FUN-08: são exatamente 23 arquivos .sql', () => {
  expect(sqls()).toHaveLength(23);
});

test('FUN-08: alterar um byte de uma migração faz a conferência falhar', () => {
  const nome = sqls()[0]!;
  const original = readFileSync(join(PASTA, nome));
  restaurar = () => writeFileSync(join(PASTA, nome), original);
  writeFileSync(join(PASTA, nome), Buffer.concat([original, Buffer.from(' ')]));
  expect(sha(nome)).not.toBe(hashes()[nome]);
});
