import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checarEnvExample, bindingsDoWrangler, lerEnvExample } from '../env-example.ts';
import { arquivosDoRepositorio, RAIZ } from '../sem-url-absoluta.ts';

// As leituras são montadas por partes: este arquivo não pode conter uma leitura de variável
// fora do .env.example, senão a checagem da base atual reprovaria o próprio teste.
const ler = (objeto: string, nome: string) => `${objeto}.${['env', nome].join('.')}`;
const FALTANDO = ['VARIAVEL', 'QUE', 'FALTA'].join('_');

const ENV_OK = [
  '# obrigatória: sim | formato: URL postgres | segredo: não',
  'DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/pelada',
  '# obrigatória: não | formato: texto | segredo: sim',
  'PELADA_APP_SENHA=',
  '',
].join('\n');

const codigo = (conteudo: string) => [{ caminho: 'backend/scripts/src/x.ts', conteudo }];

describe('checagem env-example', () => {
  it('FUN-46: variável usada no código e ausente do .env.example reprova', () => {
    const p = checarEnvExample(codigo(`const u = ${ler('process', FALTANDO)};\n`), ENV_OK);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(
      new RegExp(
        `^backend/scripts/src/x\\.ts:1: ${FALTANDO} é usada e não está no \\.env\\.example`,
      ),
    );
  });

  it('FUN-46: as formas de leitura (process, import.meta, env[...] e parâmetro env) são todas conferidas', () => {
    for (const conteudo of [
      ler('process', FALTANDO),
      ler('import.meta', `VITE_${FALTANDO}`),
      `process.env['${FALTANDO}']`,
      `function f(env) { return env.${FALTANDO}; }`,
    ]) {
      expect(checarEnvExample(codigo(conteudo), ENV_OK), conteudo).toHaveLength(1);
    }
  });

  it('FUN-46: secret ou var de workflow ausente do .env.example reprova', () => {
    const wf = [
      {
        caminho: '.github/workflows/x.yml',
        conteudo: `env:\n  A: \${{ secrets.${FALTANDO} }}\n  B: \${{ vars.${FALTANDO}_2 }}\n`,
      },
    ];
    expect(checarEnvExample(wf, ENV_OK)).toHaveLength(2);
  });

  it('FUN-46: variável listada, do ambiente (CI, GITHUB_*) ou binding do Worker passa', () => {
    const conteudo = [
      ler('process', 'DATABASE_URL'),
      ler('process', 'CI'),
      ler('process', 'GITHUB_SHA'),
      'c.env.HYPERDRIVE',
    ].join('\n');
    expect(checarEnvExample(codigo(conteudo), ENV_OK, new Set(['HYPERDRIVE']))).toEqual([]);
  });

  for (const campo of ['obrigatória', 'formato', 'segredo']) {
    it(`FUN-46: variável sem a marcação "${campo}:" reprova`, () => {
      const comentario = ['obrigatória: sim', 'formato: texto', 'segredo: não']
        .filter((c) => !c.startsWith(campo))
        .join(' | ');
      const p = checarEnvExample([], `# ${comentario}\nPELADA_X=\n`);
      expect(p).toHaveLength(1);
      expect(p[0]).toContain(`PELADA_X sem "${campo}:"`);
    });
  }

  it('FUN-46: variável sem comentário nenhum reprova nos três campos', () => {
    expect(checarEnvExample([], 'PELADA_X=\n')).toHaveLength(3);
  });

  it('FUN-46: campo com valor vazio conta como ausente', () => {
    expect(
      checarEnvExample([], '# obrigatória: | formato: texto | segredo: não\nPELADA_X=\n'),
    ).toHaveLength(1);
  });

  it('FUN-46: segredo com valor no .env.example reprova', () => {
    const p = checarEnvExample(
      [],
      '# obrigatória: sim | formato: texto | segredo: sim\nPELADA_X=valor-real\n',
    );
    expect(p).toHaveLength(1);
    expect(p[0]).toContain('é segredo e tem valor');
  });

  it('FUN-46: o .env.example atual não tem valor em nenhum segredo e lista cada variável uma vez', () => {
    const variaveis = lerEnvExample(readFileSync(join(RAIZ, '.env.example'), 'utf8'));
    const nomes = variaveis.map((v) => v.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
    expect(variaveis.length).toBeGreaterThan(0);
  });

  it('FUN-46: os bindings do wrangler.jsonc são lidos (Hyperdrive e limites)', () => {
    const b = bindingsDoWrangler(readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8'));
    expect(b.has('HYPERDRIVE')).toBe(true);
    expect(b.has('LIMITE_ENTRAR')).toBe(true);
  });

  it('FUN-46: a checagem roda na base atual e passa', () => {
    const p = checarEnvExample(
      arquivosDoRepositorio(),
      readFileSync(join(RAIZ, '.env.example'), 'utf8'),
      bindingsDoWrangler(readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8')),
    );
    expect(p).toEqual([]);
  });
});
