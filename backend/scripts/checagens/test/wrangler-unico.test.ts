import { describe, expect, it } from 'vitest';
import { arquivosDoRepositorio } from '../sem-url-absoluta.ts';
import { checarWrangler, documentacao, UNICO_PERMITIDO } from '../wrangler-unico.ts';

// Os comandos são montados por partes: este arquivo não pode citá-los por inteiro, senão a
// checagem da base atual reprovaria o próprio teste.
const DEPLOY = ['wrangler', 'deploy'].join(' ');
const PUBLISH = ['wrangler', 'publish'].join(' ');
const VERSOES = ['wrangler', 'versions', 'deploy'].join(' ');

describe('checagem wrangler-unico', () => {
  it('FUN-45: o comando num script do package.json reprova', () => {
    const p = checarWrangler([
      { caminho: 'package.json', conteudo: `{\n  "scripts": { "publicar": "${DEPLOY}" }\n}\n` },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^package\.json:2: publica o Worker/);
  });

  it('FUN-45: o comando num script .mjs reprova', () => {
    const p = checarWrangler([
      { caminho: 'scripts/publicar.mjs', conteudo: `spawn('pnpm', ['exec', '${DEPLOY}']);\n` },
    ]);
    expect(p).toHaveLength(1);
  });

  it('FUN-45: o comando em outro workflow reprova', () => {
    const p = checarWrangler([
      {
        caminho: '.github/workflows/ci.yml',
        conteudo: `      - run: pnpm exec ${DEPLOY} --env x\n`,
      },
    ]);
    expect(p).toHaveLength(1);
  });

  it('FUN-45: o antigo publish, o versions deploy, maiúsculas e espaços duplos também reprovam', () => {
    for (const comando of [PUBLISH, VERSOES, DEPLOY.toUpperCase(), DEPLOY.replace(' ', '   ')]) {
      expect(
        checarWrangler([{ caminho: 'a.ts', conteudo: `run('${comando}')\n` }]),
        comando,
      ).toHaveLength(1);
    }
  });

  it('FUN-45: o único lugar permitido é o deploy.yml', () => {
    expect(UNICO_PERMITIDO).toBe('.github/workflows/deploy.yml');
    expect(
      checarWrangler([
        { caminho: '.github/workflows/deploy.yml', conteudo: `      - run: ${DEPLOY}\n` },
      ]),
    ).toEqual([]);
    expect(
      checarWrangler([
        { caminho: '.github/workflows/deploy.yaml', conteudo: `      - run: ${DEPLOY}\n` },
      ]),
    ).toHaveLength(1);
    expect(
      checarWrangler([
        { caminho: 'backend/.github/workflows/deploy.yml', conteudo: `${DEPLOY}\n` },
      ]),
    ).toHaveLength(1);
  });

  it('FUN-45: menção em documentação (docs/, README.md) não reprova', () => {
    expect(
      checarWrangler([
        { caminho: 'docs/runbook.md', conteudo: `Rode ${DEPLOY} só pelo workflow.\n` },
        { caminho: 'README.md', conteudo: `${DEPLOY}\n` },
        { caminho: '.specs/features/fundacao/spec.md', conteudo: `${DEPLOY}\n` },
      ]),
    ).toEqual([]);
    expect(documentacao('docs/x.txt')).toBe(true);
    expect(documentacao('frontend/docs.ts')).toBe(false);
  });

  it('FUN-45: wrangler dev e wrangler deployments list não reprovam', () => {
    expect(
      checarWrangler([
        {
          caminho: 'a.ts',
          conteudo: `run('${['wrangler', 'dev'].join(' ')}')\nrun('${['wrangler', 'deployments'].join(' ')}')\n`,
        },
      ]),
    ).toEqual([]);
  });

  it('FUN-45: a checagem roda na base atual e passa', () => {
    expect(checarWrangler(arquivosDoRepositorio())).toEqual([]);
  });
});
