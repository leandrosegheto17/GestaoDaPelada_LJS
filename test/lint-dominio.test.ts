import { resolve } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const raiz = resolve(import.meta.dirname, '..');
const eslint = new ESLint({ cwd: raiz });
const DOMINIO = 'backend/dominio/src/regra.ts';
const API = 'backend/api/src/aplicacao/x.ts';

async function violacoes(codigo: string, arquivo: string) {
  const [resultado] = await eslint.lintText(codigo, { filePath: resolve(raiz, arquivo) });
  return (resultado?.messages ?? []).filter((m) => m.ruleId?.startsWith('no-restricted')).map((m) => m.ruleId);
}

describe('domínio sem I/O (FUN-06)', () => {
  it.each([
    "import { readFileSync } from 'node:fs';",
    "import fs from 'fs';",
    "import { readFile } from 'node:fs/promises';",
    "import http from 'node:http';",
    "import https from 'node:https';",
    "import net from 'node:net';",
    "import pg from 'pg';",
    "import { Kysely } from 'kysely';",
    "import { fetch } from 'undici';",
    "const m = await import('node:fs');",
    'const m = await import(nome);',
  ])('barra %s', async (codigo) => {
    expect((await violacoes(codigo, DOMINIO)).length).toBeGreaterThan(0);
  });

  it('aceita código puro no domínio', async () => {
    expect(await violacoes('export const soma = (a: number, b: number) => a + b;', DOMINIO)).toEqual([]);
  });

  it('não barra node:fs fora do domínio', async () => {
    expect(await violacoes("import { readFileSync } from 'node:fs';", API)).toEqual([]);
  });
});
