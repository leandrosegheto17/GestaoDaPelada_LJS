import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checarActionsPorSha } from '../actions-por-sha.ts';
import { repo } from './apoio.ts';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';
const wf = (uses: string) => `jobs:\n  a:\n    steps:\n      - ${uses}\n`;

describe('checarActionsPorSha', () => {
  test('FUN-40: uses com tag móvel reprova, citando arquivo e linha', () => {
    const raiz = repo({ '.github/workflows/ci.yml': wf('uses: actions/checkout@v4') });
    const r = checarActionsPorSha({ raiz });
    expect(r.ok).toBe(false);
    expect(r.violacoes).toEqual([expect.stringContaining('.github/workflows/ci.yml:4')]);
  });

  test('FUN-40: uses com SHA de 40 caracteres passa, com ou sem comentário de versão', () => {
    const raiz = repo({
      '.github/workflows/a.yml': wf(`uses: actions/checkout@${SHA} # v7.0.1`),
      '.github/workflows/b.yaml': wf(`uses: "actions/setup-node@${SHA}"`),
    });
    expect(checarActionsPorSha({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test.each([
    ['SHA curto', 'uses: actions/checkout@3d3c42e'],
    ['SHA com 41 caracteres', `uses: actions/checkout@${SHA}0`],
    ['SHA com letra fora de hex', `uses: actions/checkout@${SHA.slice(0, 39)}z`],
    ['branch', 'uses: actions/checkout@main'],
    ['sem versão', 'uses: actions/checkout'],
    ['imagem de docker', 'uses: docker://alpine:3'],
  ])('FUN-40: %s reprova', (_nome, uses) => {
    const raiz = repo({ '.github/workflows/ci.yml': wf(uses) });
    expect(checarActionsPorSha({ raiz }).ok).toBe(false);
  });

  test('FUN-40: uses de action local passa', () => {
    const raiz = repo({ '.github/workflows/ci.yml': wf('uses: ./.github/actions/x') });
    expect(checarActionsPorSha({ raiz }).ok).toBe(true);
  });

  test('FUN-40: uses dentro de comentário ou de texto de run não conta', () => {
    const raiz = repo({
      '.github/workflows/ci.yml': `# uses: actions/checkout@v4\njobs:\n  a:\n    steps:\n      - run: echo "uses: x@v1"\n`,
    });
    expect(checarActionsPorSha({ raiz }).ok).toBe(true);
  });

  test('FUN-40: reprova também em action composta (.github/actions/*/action.yml)', () => {
    const raiz = repo({
      '.github/actions/x/action.yml': wf('uses: actions/cache@v4'),
    });
    expect(checarActionsPorSha({ raiz }).ok).toBe(false);
  });

  test('FUN-40: roda nos workflows reais do repositório (backup.yml) e passa', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..', '..');
    expect(checarActionsPorSha({ raiz })).toEqual({ ok: true, violacoes: [] });
  });
});
