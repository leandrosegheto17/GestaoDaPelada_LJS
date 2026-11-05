import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * README (FUN-51): cobre rodar local, variáveis, testes, deploy da prévia e backup, e cita cada
 * variável do `.env.example`.
 */

const RAIZ = join(import.meta.dirname, '..');
const README = readFileSync(join(RAIZ, 'README.md'), 'utf8');
const VARIAVEIS = readFileSync(join(RAIZ, '.env.example'), 'utf8')
  .split(/\r?\n/)
  .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l.trim())?.[1])
  .filter((n): n is string => Boolean(n));

describe('README', () => {
  it('FUN-51: tem as seções de rodar local, variáveis, testes, deploy da prévia e backup', () => {
    for (const secao of ['## Rodar local', '## Variáveis de ambiente', '## Testes e checagens', '## Deploy da prévia', '## Backup']) {
      expect(README, secao).toContain(secao);
    }
  });

  it('FUN-51: cita cada variável do .env.example', () => {
    expect(VARIAVEIS.length).toBeGreaterThan(0);
    for (const nome of VARIAVEIS) expect(README, nome).toContain(`\`${nome}\``);
  });

  it('FUN-51: os comandos de rodar local levam ao app em http://localhost:5173', () => {
    for (const comando of ['pnpm install', 'docker compose up -d --wait', 'pnpm migrar', 'pnpm seed', 'pnpm dev']) {
      expect(README, comando).toContain(comando);
    }
    expect(README).toContain('http://localhost:5173');
  });
});
