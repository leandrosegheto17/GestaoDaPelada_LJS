import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/esquema.ts';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { referenciaDoEsquema } from '../../src/infraestrutura/db/referencia.ts';
import { bancoDeTeste } from '../apoio/banco.ts';

const arquivo = resolve(
  import.meta.dirname,
  '../../src/infraestrutura/db/migracoes/esquema-producao.txt',
);

async function esquemaDoBancoVazioMigrado(): Promise<string> {
  return bancoDeTeste(async (url) => {
    await migrar(url);
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      return referenciaDoEsquema(await lerEsquema(c));
    } finally {
      await c.end();
    }
  });
}

test('FUN-08: banco vazio migrado tem lerEsquema igual ao esquema-producao.txt versionado', async () => {
  expect(await esquemaDoBancoVazioMigrado()).toBe(readFileSync(arquivo, 'utf8'));
}, 60_000);

test('FUN-08: o arquivo cobre as 25 tabelas com FORCE e as funções SECURITY DEFINER herdadas', () => {
  const linhas = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean);
  expect(linhas.filter((l) => l.startsWith('tabela '))).toHaveLength(25);
  expect(linhas.filter((l) => /^rls \S+ enable=true force=true$/.test(l))).toHaveLength(25);
  expect(linhas.filter((l) => l.includes('securitydefiner=true')).length).toBeGreaterThanOrEqual(1);
  expect(linhas.some((l) => l.includes('pgmigrations'))).toBe(false);
});

test('FUN-08: a referência não depende do estado do cluster (login e roles de outros testes)', () => {
  const linhas = [
    'tabela a',
    'role pelada_app login=true bypassrls=false superuser=false createdb=false createrole=false replication=false',
    'role pelada_t_abc login=false bypassrls=false superuser=false createdb=false createrole=false replication=false',
    'role pelada_backup login=false bypassrls=false superuser=false createdb=false createrole=false replication=false',
  ];
  expect(referenciaDoEsquema(linhas)).toBe(
    'tabela a\nrole pelada_app login=* bypassrls=false superuser=false createdb=false createrole=false replication=false\n',
  );
});
