import { readFileSync } from 'node:fs';
import pg from 'pg';
import { expect, test } from 'vitest';
import {
  ARQUIVO_ESQUEMA_PRODUCAO,
  lerEsquema,
  ROLES_DA_APLICACAO,
} from '../../src/infraestrutura/db/esquema.ts';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste, comTravaDeMigracao } from '../apoio/banco.ts';

const DEFINER_ESPERADAS = 19;

const referencia = () =>
  readFileSync(ARQUIVO_ESQUEMA_PRODUCAO, 'utf8')
    .split('\n')
    .filter((l) => l !== '');

test('FUN-08: banco vazio migrado tem lerEsquema igual ao esquema-producao.txt versionado', async () => {
  await comBancoDeTeste(async (url) => {
    await comTravaDeMigracao(() => migrar(url));
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      expect(await lerEsquema(c, { roles: ROLES_DA_APLICACAO })).toEqual(referencia());
    } finally {
      await c.end();
    }
  });
}, 120_000);

test('FUN-08: a referência cobre as 25 tabelas com FORCE e as funções SECURITY DEFINER herdadas', () => {
  const linhas = referencia();
  expect(linhas.filter((l) => l.startsWith('tabela '))).toHaveLength(25);
  expect(linhas.filter((l) => /^rls .* enabled=t force=t$/.test(l))).toHaveLength(25);
  const definer = linhas.filter((l) => l.startsWith('funcao ') && l.includes(' security=definer '));
  expect(definer.length).toBeGreaterThan(0);
  expect(definer).toHaveLength(DEFINER_ESPERADAS);
});
