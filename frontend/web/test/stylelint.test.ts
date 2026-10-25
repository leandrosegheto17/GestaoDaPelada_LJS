import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import config from '../stylelint.config.mjs';

const RAIZ = join(import.meta.dirname, '..');

async function avisos(code: string): Promise<number> {
  const { results } = await stylelint.lint({ code, config, codeFilename: join(RAIZ, 'src/x.module.css') });
  return results.reduce((soma, r) => soma + r.warnings.length, 0);
}

describe('stylelint: cor, fonte e sombra literais são proibidas', () => {
  it.each([
    'a{color:#FFF}',
    'a{color:#0a0a0a80}',
    'a{color:red}',
    'a{color:rgb(0 0 0)}',
    'a{color:hsl(10 10% 10%)}',
    'a{color:color-mix(in srgb, red, blue)}',
    'a{color:var(--x, #fff)}',
    'a{--minha-cor:#123}',
    'a{border:1px solid #000}',
    'a{font-family:Arial}',
    'a{font:16px Barlow}',
    'a{box-shadow:0 1px 2px black}',
  ])('recusa %s', async (css) => {
    expect(await avisos(css)).toBeGreaterThan(0);
  });

  it.each([
    'a{color:var(--cor-texto)}',
    'a{color:transparent}',
    'a{color:currentColor}',
    'a{font-family:inherit}',
    'a{font-family:var(--fonte-texto)}',
    'a{box-shadow:none}',
    'a{box-shadow:var(--sombra-1)}',
    '/* #fff é só comentário */ a{color:var(--cor-texto)}',
    '',
  ])('aceita %s', async (css) => {
    expect(await avisos(css)).toBe(0);
  });

  it('o global.css real passa', async () => {
    const css = readFileSync(join(RAIZ, 'src/estilos/global.css'), 'utf8');
    expect(await avisos(css)).toBe(0);
  });
});
