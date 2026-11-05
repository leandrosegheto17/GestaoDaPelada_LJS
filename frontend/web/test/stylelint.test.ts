// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';

/**
 * Stylelint só com tokens (FUN-32): cor, fonte e sombra literais reprovam fora de tokens.css.
 * Roda no Node (o Stylelint lê arquivos e carrega o plugin): ver a primeira linha.
 */

const WEB = join(import.meta.dirname, '..');
const CONFIG = join(WEB, '.stylelintrc.json');

async function lint(code: string, arquivo = 'src/exemplo.module.css') {
  const r = await stylelint.lint({ code, codeFilename: join(WEB, arquivo), configFile: CONFIG, configBasedir: WEB });
  const avisos = r.results.flatMap((x) => x.warnings);
  return { erros: r.errored === true, regras: avisos.map((a) => a.rule) };
}

describe('Stylelint: só tokens', () => {
  it('FUN-32: um CSS com #fff, rgb(...), font-family: Arial e box-shadow literal reprova', async () => {
    const { erros, regras } = await lint(`
      .a { color: #fff; }
      .b { background: rgb(0 0 0 / 50%); }
      .c { font-family: Arial, sans-serif; }
      .d { box-shadow: 0 0 4px #000; }
    `);
    expect(erros).toBe(true);
    expect(regras).toContain('color-no-hex');
    expect(regras).toContain('function-disallowed-list');
    expect(regras.filter((r) => r === 'pelada/so-tokens')).toHaveLength(2);
  });

  for (const [nome, css, regra] of [
    ['#fff', '.a { color: #fff; }', 'color-no-hex'],
    ['rgb()', '.a { color: rgb(1, 2, 3); }', 'function-disallowed-list'],
    ['hsl()', '.a { border-color: hsl(10 20% 30%); }', 'function-disallowed-list'],
    ['cor nomeada', '.a { color: red; }', 'color-named'],
    ['font-family literal', '.a { font-family: Arial; }', 'pelada/so-tokens'],
    ['font abreviado literal', '.a { font: 600 1rem/1.2 Georgia, serif; }', 'pelada/so-tokens'],
    ['box-shadow literal', '.a { box-shadow: 0 0 4px #000; }', 'pelada/so-tokens'],
    ['text-shadow literal', '.a { text-shadow: 1px 1px 0 black; }', 'pelada/so-tokens'],
  ] as const) {
    it(`FUN-32: ${nome} reprova (${regra})`, async () => {
      const { erros, regras } = await lint(css);
      expect(erros).toBe(true);
      expect(regras).toContain(regra);
    });
  }

  it('FUN-32: um CSS com var(--...) passa', async () => {
    const { erros, regras } = await lint(`
      .a { color: var(--cor-texto); background: var(--cor-fundo); }
      .b { font-family: var(--fonte-texto); font: inherit; }
      .c { box-shadow: var(--sombra-1); text-shadow: none; }
    `);
    expect(regras).toEqual([]);
    expect(erros).toBe(false);
  });

  it('FUN-32: o nome da fonte dentro de @font-face passa', async () => {
    const { erros } = await lint(`
      @font-face { font-family: "Barlow"; font-weight: 400; src: url("/fontes/Barlow-400-latin.woff2") format("woff2"); }
    `);
    expect(erros).toBe(false);
  });

  it('FUN-32: o próprio tokens.css passa', async () => {
    const tokens = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'), 'utf8');
    const { erros, regras } = await lint(tokens, 'src/estilos/tokens.css');
    expect(regras).toEqual([]);
    expect(erros).toBe(false);
  });

  it('FUN-32: o conteúdo do tokens.css fora do arquivo de tokens reprova', async () => {
    const tokens = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'), 'utf8');
    const { erros } = await lint(tokens, 'src/estilos/outro.css');
    expect(erros).toBe(true);
  });

  it('FUN-32: o script lint do front chama o ESLint e o Stylelint', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts.lint).toMatch(/eslint/);
    expect(pkg.scripts.lint).toMatch(/stylelint/);
  });
});
