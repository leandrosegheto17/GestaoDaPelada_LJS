import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Servico {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
}

const raiz = resolve(import.meta.dirname, '../../..');
const compose = yaml.load(readFileSync(resolve(raiz, 'docker-compose.yml'), 'utf8')) as {
  services: Record<string, Servico>;
};

describe('docker-compose.yml (FUN-03)', () => {
  it('sobe só o serviço de banco', () => {
    expect(Object.keys(compose.services)).toEqual(['db']);
  });

  it('usa a imagem oficial do Postgres 16 (com contrib, onde mora o pgcrypto)', () => {
    expect(compose.services['db']?.image).toBe('postgres:16');
  });

  it('expõe o Postgres só em 127.0.0.1:5432', () => {
    expect(compose.services['db']?.ports).toEqual(['127.0.0.1:5432:5432']);
  });
});
