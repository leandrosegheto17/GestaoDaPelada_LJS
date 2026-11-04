import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const configFile = join(WEB, '.stylelintrc.json');

async function lint(code: string, codeFilename = join(WEB, 'src/estilos/exemplo.css')) {
  const r = await stylelint.lint({ code, codeFilename, configFile });
  return r.results[0]!.warnings.map((w) => w.text);
}

describe('Stylelint: só tokens', () => {
  test.each([
    ['cor hexadecimal', 'a { color: #fff; }'],
    ['rgb()', 'a { background: rgb(0 0 0); }'],
    ['rgba()', 'a { border-color: rgba(0, 0, 0, 0.5); }'],
    ['hsl()', 'a { color: hsl(10 20% 30%); }'],
    ['cor nomeada', 'a { color: red; }'],
    ['fonte literal', 'a { font-family: Arial; }'],
    ['fonte literal com aspas', 'a { font-family: "Comic Sans MS", cursive; }'],
    ['sombra com cor literal', 'a { box-shadow: 0 0 4px #000; }'],
    ['sombra literal sem cor', 'a { box-shadow: 0 0 4px black; }'],
  ])('FUN-32: %s reprova', async (_nome, css) => {
    expect((await lint(css)).length).toBeGreaterThan(0);
  });

  test('FUN-32: o exemplo da spec (#fff, rgb, Arial, box-shadow) reprova em cada linha', async () => {
    const css = [
      'a { color: #fff; }',
      'b { background: rgb(1 2 3); }',
      'c { font-family: Arial; }',
      'd { box-shadow: 0 0 4px #000; }',
    ].join('\n');
    expect((await lint(css)).length).toBeGreaterThanOrEqual(4);
  });

  test.each([
    ['cor por var()', 'a { color: var(--cor-texto); background: var(--cor-fundo); }'],
    ['fonte por var()', 'a { font-family: var(--fonte-texto); }'],
    ['sombra por var()', 'a { box-shadow: var(--sombra-cartao); }'],
    ['currentColor e transparent', 'a { color: currentColor; background: transparent; }'],
    [
      '@font-face das fontes do projeto',
      '@font-face { font-family: "Barlow"; src: url("/fontes/x.woff2"); }',
    ],
  ])('FUN-32: %s passa', async (_nome, css) => {
    expect(await lint(css)).toEqual([]);
  });

  test('FUN-32: o próprio tokens.css passa', async () => {
    const tokens = join(WEB, 'src/estilos/tokens.css');
    expect(await lint(readFileSync(tokens, 'utf8'), tokens)).toEqual([]);
  });
});
