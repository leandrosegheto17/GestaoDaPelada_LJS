import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const raiz = join(import.meta.dirname, '..', '..', '..');
const compose = parse(readFileSync(join(raiz, 'docker-compose.yml'), 'utf8'));

test('FUN-03: um único serviço, postgres:18, porta presa em 127.0.0.1', () => {
  const servicos = Object.keys(compose.services);
  expect(servicos).toHaveLength(1);
  const pg = compose.services[servicos[0]!];
  expect(pg.image).toBe('postgres:18');
  expect(pg.ports).toEqual(['127.0.0.1:5432:5432']);
  expect(pg.healthcheck.test.join(' ')).toContain('pg_isready');
  expect(Object.keys(compose.volumes)).toHaveLength(1);
});
