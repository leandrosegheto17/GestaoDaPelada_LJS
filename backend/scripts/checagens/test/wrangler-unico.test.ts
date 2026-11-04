import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checarWranglerUnico } from '../wrangler-unico.ts';
import { repo } from './apoio.ts';

describe('checarWranglerUnico', () => {
  test.each([
    ['package.json', '{ "scripts": { "deploy": "wrangler deploy" } }'],
    ['scripts/publicar.mjs', "spawn('wrangler publish', [])"],
    [
      '.github/workflows/ci.yml',
      'jobs:\n  a:\n    steps:\n      - run: pnpm exec wrangler deploy --env x\n',
    ],
    ['backend/api/package.json', '{ "scripts": { "d": "npx wrangler   deploy" } }'],
  ])('FUN-45: wrangler deploy ou publish em %s reprova', (caminho, texto) => {
    const r = checarWranglerUnico({ raiz: repo({ [caminho]: texto }) });
    expect(r.ok).toBe(false);
    expect(r.violacoes).toEqual([expect.stringContaining(caminho)]);
  });

  test('FUN-45: o único lugar permitido é o deploy.yml', () => {
    const raiz = repo({
      '.github/workflows/deploy.yml':
        'jobs:\n  d:\n    steps:\n      - run: pnpm exec wrangler deploy\n',
    });
    expect(checarWranglerUnico({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-45: menção em documentação não reprova', () => {
    const raiz = repo({
      'docs/runbook.md': 'Para publicar à mão: `wrangler deploy`.\n',
      'README.md': 'Nunca rode wrangler deploy localmente.\n',
    });
    expect(checarWranglerUnico({ raiz }).ok).toBe(true);
  });

  test('FUN-45: wrangler dev e outros subcomandos não reprovam', () => {
    const raiz = repo({
      'package.json':
        '{ "scripts": { "dev": "wrangler dev", "t": "wrangler types", "d2": "wrangler deployments list" } }',
    });
    expect(checarWranglerUnico({ raiz }).ok).toBe(true);
  });

  test('FUN-45: o repositório real passa', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..', '..');
    expect(checarWranglerUnico({ raiz })).toEqual({ ok: true, violacoes: [] });
  });
});
