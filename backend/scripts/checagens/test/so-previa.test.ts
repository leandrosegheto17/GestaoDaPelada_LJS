import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checarSoPrevia } from '../so-previa.ts';
import { repo } from './apoio.ts';

const wrangler = (corpo: string) => `{\n  // comentário\n  ${corpo}\n}\n`;
const deploy = (corpo: string) => `name: deploy\njobs:\n  d:\n    steps:\n      - run: ${corpo}\n`;

describe('checarSoPrevia', () => {
  test('FUN-28: name gestaodapelada reprova; gestaodapelada-v2 passa', () => {
    const ruim = repo({ 'wrangler.jsonc': wrangler('"name": "gestaodapelada",') });
    const r = checarSoPrevia({ raiz: ruim });
    expect(r.ok).toBe(false);
    expect(r.violacoes).toEqual([expect.stringContaining('wrangler.jsonc:3')]);
    const boa = repo({ 'wrangler.jsonc': wrangler('"name": "gestaodapelada-v2",') });
    expect(checarSoPrevia({ raiz: boa })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-28: a menção ao Worker de produção também reprova no deploy.yml', () => {
    const raiz = repo({
      '.github/workflows/deploy.yml': deploy('pnpm exec wrangler --name gestaodapelada'),
    });
    expect(checarSoPrevia({ raiz }).ok).toBe(false);
  });

  test.each([
    [
      'routes no wrangler.jsonc',
      'wrangler.jsonc',
      wrangler('"routes": [{ "pattern": "x.com/*" }],'),
    ],
    ['route no wrangler.jsonc', 'wrangler.jsonc', wrangler('"route": "x.com/*",')],
    [
      'custom_domain no wrangler.jsonc',
      'wrangler.jsonc',
      wrangler('"x": [{ "pattern": "x.com", "custom_domain": true }],'),
    ],
    [
      'routes no deploy.yml',
      '.github/workflows/deploy.yml',
      'jobs:\n  d:\n    routes:\n      - x\n',
    ],
    [
      'custom_domain no deploy.yml',
      '.github/workflows/deploy.yml',
      'jobs:\n  d:\n    steps:\n      - with:\n          custom_domain: true\n',
    ],
    [
      'a flag --routes na linha de comando',
      '.github/workflows/deploy.yml',
      deploy('pnpm exec wrangler --routes x.com'),
    ],
  ])('FUN-28: %s reprova', (_n, caminho, texto) => {
    const raiz = repo({ [caminho]: texto });
    expect(checarSoPrevia({ raiz }).ok).toBe(false);
  });

  test('FUN-28: menção em comentário ao conceito de rotas não reprova', () => {
    const raiz = repo({
      'wrangler.jsonc': wrangler('"name": "gestaodapelada-v2", // sem routes nem custom_domain'),
    });
    expect(checarSoPrevia({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-28: environment producao passa (AD-119)', () => {
    const raiz = repo({
      '.github/workflows/deploy.yml': 'jobs:\n  d:\n    environment: producao\n    steps: []\n',
    });
    expect(checarSoPrevia({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-28: sem os arquivos, não há o que reprovar', () => {
    expect(checarSoPrevia({ raiz: repo({ 'README.md': 'x' }) }).ok).toBe(true);
  });

  test('FUN-28: passa nos arquivos reais', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..', '..');
    expect(checarSoPrevia({ raiz })).toEqual({ ok: true, violacoes: [] });
  });
});
