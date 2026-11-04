import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { checarEnvExemplo } from '../env-exemplo.ts';
import { repo } from './apoio.ts';

const MARCA = '# obrigatória: sim | formato: texto | segredo: não';
const exemplo = (linhas: string) => ({ '.env.example': linhas });

describe('checarEnvExemplo', () => {
  test('FUN-46: variável usada no código e ausente do .env.example reprova', () => {
    const raiz = repo({
      ...exemplo(`${MARCA}\nOUTRA=x\n`),
      'backend/api/src/a.ts': 'export const u = process.env.URL_NOVA;\n',
    });
    const r = checarEnvExemplo({ raiz });
    expect(r.ok).toBe(false);
    expect(r.violacoes).toEqual([expect.stringContaining('URL_NOVA')]);
    expect(r.violacoes[0]).toContain('backend/api/src/a.ts:1');
  });

  test.each([
    ['process.env.X', 'const a = process.env.VAR_A;'],
    ['process.env com colchetes', "const a = process.env['VAR_A'];"],
    ['desestruturação', 'const { VAR_A, OUTRA: b } = process.env;'],
    ['import.meta.env', 'const a = import.meta.env.VAR_A;'],
    ['env do Worker', 'const a = c.env.VAR_A;'],
  ])('FUN-46: detecta o uso por %s', (_n, codigo) => {
    const raiz = repo({
      ...exemplo(''),
      'backend/api/src/a.ts': `${codigo}\n`,
    });
    expect(checarEnvExemplo({ raiz }).violacoes.join('\n')).toContain('VAR_A');
  });

  test('FUN-46: detecta secrets e vars de workflow', () => {
    const raiz = repo({
      ...exemplo(''),
      '.github/workflows/x.yml':
        'env:\n  A: ${{ secrets.SEGREDO_CI }}\n  B: ${{ vars.CONFIG_CI }}\n',
    });
    const r = checarEnvExemplo({ raiz });
    expect(r.violacoes.join('\n')).toContain('SEGREDO_CI');
    expect(r.violacoes.join('\n')).toContain('CONFIG_CI');
  });

  test('FUN-46: variável do sistema, built-in do Vite, binding e atribuição não exigem entrada', () => {
    const raiz = repo({
      ...exemplo(''),
      'backend/api/src/a.ts':
        'const a = [process.env.PATH, process.env.CI, import.meta.env.MODE, import.meta.env.DEV, c.env.HYPERDRIVE, c.env.LIMITE_ENTRAR];\nprocess.env.SO_ATRIBUIDA = "x";\nprocess.env.OUTRA_ATRIBUIDA ||= "y";\n',
    });
    expect(checarEnvExemplo({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test.each([
    ['sem nenhuma marcação', 'VAR_A=x'],
    ['sem obrigatoriedade', '# formato: texto | segredo: não\nVAR_A=x'],
    ['sem formato', '# obrigatória: sim | segredo: não\nVAR_A=x'],
    ['sem a marca de segredo', '# obrigatória: sim | formato: texto\nVAR_A=x'],
    [
      'com valor inválido em obrigatória',
      '# obrigatória: talvez | formato: texto | segredo: não\nVAR_A=x',
    ],
  ])('FUN-46: variável %s reprova', (_n, linhas) => {
    const raiz = repo({
      ...exemplo(`${linhas}\n`),
      'a.ts': 'const a = process.env.VAR_A;\n',
    });
    const r = checarEnvExemplo({ raiz });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toContain('VAR_A');
  });

  test('FUN-46: variável completa e usada passa', () => {
    const raiz = repo({
      ...exemplo(`# obrigatória: não | formato: URL postgres | segredo: não\nVAR_A=postgres://x\n`),
      'a.ts': 'const a = process.env.VAR_A;\n',
    });
    expect(checarEnvExemplo({ raiz })).toEqual({ ok: true, violacoes: [] });
  });

  test('FUN-46: segredo com valor preenchido reprova (nenhum valor real no exemplo)', () => {
    const raiz = repo({
      ...exemplo('# obrigatória: sim | formato: texto | segredo: sim\nVAR_A=valor-real\n'),
      'a.ts': 'const a = process.env.VAR_A;\n',
    });
    const r = checarEnvExemplo({ raiz });
    expect(r.ok).toBe(false);
    expect(r.violacoes.join('\n')).toMatch(/VAR_A.*segredo.*valor/s);
  });

  test('FUN-46: a checagem não lê os próprios arquivos nem .specs', () => {
    const raiz = repo({
      ...exemplo(''),
      'backend/scripts/checagens/x.ts': 'process.env.IGNORADA;\n',
      '.specs/a.md': 'process.env.IGNORADA_TAMBEM\n',
      'node_modules/p/i.js': 'process.env.DE_PACOTE;\n',
    });
    expect(checarEnvExemplo({ raiz }).ok).toBe(true);
  });

  test('FUN-46: o repositório real passa', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..', '..');
    const r = checarEnvExemplo({ raiz });
    expect(r.violacoes).toEqual([]);
  });

  test('FUN-46: o .gitleaks.toml estende as regras padrão do gitleaks', () => {
    const raiz = join(import.meta.dirname, '..', '..', '..', '..');
    const toml = readFileSync(join(raiz, '.gitleaks.toml'), 'utf8');
    expect(toml).toMatch(/\[extend\][^[]*useDefault\s*=\s*true/s);
  });
});
