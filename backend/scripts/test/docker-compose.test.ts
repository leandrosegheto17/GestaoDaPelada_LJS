import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';

interface Servico {
  image: string;
  ports?: string[];
  environment?: Record<string, string>;
  volumes?: string[];
}

const raiz = resolve(import.meta.dirname, '../../..');
const compose = yaml.load(readFileSync(resolve(raiz, 'docker-compose.yml'), 'utf8')) as {
  services: Record<string, Servico>;
};

describe('docker-compose.yml (FUN-03)', () => {
  it('sobe só o serviço de banco', () => {
    expect(Object.keys(compose.services)).toEqual(['db']);
  });

  // ADR-031: PostgreSQL 18 em todo ambiente.
  it('usa a imagem oficial do Postgres 18 (com contrib, onde mora o pgcrypto)', () => {
    expect(compose.services['db']?.image).toBe('postgres:18');
  });

  it('monta o volume em /var/lib/postgresql, onde a imagem 18 guarda os dados', () => {
    expect(compose.services['db']?.volumes).toEqual(['dados_db_18:/var/lib/postgresql']);
  });

  it('expõe o Postgres só em 127.0.0.1:5432', () => {
    expect(compose.services['db']?.ports).toEqual(['127.0.0.1:5432:5432']);
  });
});

// ADR-031 e ADR-034: os serviços de banco do CI usam a mesma imagem do local, pela tag oficial postgres:18.
// Motivo da mudança (aprovado pelo usuário): o digest sai; a tag é a mesma nos três projetos.
describe('ci.yml: Postgres de serviço', () => {
  const ci = yaml.load(readFileSync(resolve(raiz, '.github/workflows/ci.yml'), 'utf8')) as {
    jobs: Record<string, { services?: Record<string, { image: string }> }>;
  };
  const imagens = Object.values(ci.jobs).flatMap((job) => Object.values(job.services ?? {}).map((s) => s.image));

  it('todo serviço de banco é postgres:18 pela tag exata', () => {
    expect(imagens.length).toBeGreaterThan(0);
    for (const imagem of imagens) expect(imagem).toBe('postgres:18');
  });
});
