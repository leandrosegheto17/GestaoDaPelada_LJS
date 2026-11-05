import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const RAIZ = join(import.meta.dirname, '..', '..', '..');

interface Compose {
  services: Record<string, { image?: string; ports?: string[] }>;
}

const compose = parse(readFileSync(join(RAIZ, 'docker-compose.yml'), 'utf8')) as Compose;

describe('docker-compose.yml', () => {
  it('FUN-03: tem um serviço só, o Postgres 18', () => {
    expect(Object.keys(compose.services)).toEqual(['postgres']);
    expect(compose.services.postgres?.image).toMatch(/^postgres:18(\.|$|-)/);
  });

  it('FUN-03: toda porta publicada fica presa em 127.0.0.1', () => {
    const portas = compose.services.postgres?.ports ?? [];
    expect(portas.length).toBeGreaterThan(0);
    for (const porta of portas) {
      expect(String(porta)).toMatch(/^127\.0\.0\.1:\d+:5432$/);
    }
  });
});
