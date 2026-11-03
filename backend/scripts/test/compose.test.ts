import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import { expect, test } from 'vitest';

const raiz = resolve(import.meta.dirname, '../../..');
const compose = parse(readFileSync(resolve(raiz, 'docker-compose.yml'), 'utf8'));

test('FUN-03: o compose sobe um serviço só, com a imagem postgres:18', () => {
  const servicos = Object.keys(compose.services);
  expect(servicos).toHaveLength(1);
  expect(compose.services[servicos[0]!].image).toBe('postgres:18');
});

test('FUN-03: a porta do banco é presa em 127.0.0.1', () => {
  const [servico] = Object.values<{ ports: string[] }>(compose.services);
  expect(servico!.ports).toHaveLength(1);
  expect(servico!.ports[0]).toMatch(/^127\.0\.0\.1:5432:5432$/);
});

test('FUN-03: há volume nomeado e healthcheck', () => {
  const [servico] = Object.values<{ volumes: string[]; healthcheck: unknown }>(compose.services);
  expect(servico!.healthcheck).toBeTruthy();
  expect(Object.keys(compose.volumes)).toHaveLength(1);
  expect(servico!.volumes[0]).toContain(Object.keys(compose.volumes)[0]);
});
