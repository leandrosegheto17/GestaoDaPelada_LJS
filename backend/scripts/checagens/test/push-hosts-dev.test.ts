import { describe, expect, it } from 'vitest';
import { checarPushHostsDev, checarRepositorio } from '../push-hosts-dev.ts';

// O nome é montado por partes: assim este teste não depende de como a checagem lê comentários.
const NOME = ['PUSH', 'HOSTS', 'DEV'].join('_');

describe('checagem push-hosts-dev', () => {
  it('NOT-63: a variável nas vars do wrangler.jsonc reprova, com a linha', () => {
    const exemplo = `{\n  "vars": {\n    "VERSAO": "local",\n    "${NOME}": "localhost:8790"\n  }\n}\n`;
    expect(checarPushHostsDev(exemplo, 'wrangler.jsonc')).toEqual([
      `wrangler.jsonc:4: define ${NOME}; ela só vale no .env local e no e2e`,
    ]);
  });

  it('NOT-63: a variável num --var ou num env do deploy.yml reprova', () => {
    const passo = `      - run: wrangler deploy --var ${NOME}:localhost:8790\n`;
    expect(checarPushHostsDev(passo, '.github/workflows/deploy.yml')).toEqual([
      `.github/workflows/deploy.yml:1: define ${NOME}; ela só vale no .env local e no e2e`,
    ]);
    const env = `    env:\n      ${NOME}: localhost:8790\n`;
    expect(checarPushHostsDev(env, '.github/workflows/deploy.yml')).toHaveLength(1);
  });

  it('NOT-63: comentário que cita o nome não reprova, no JSONC e no YAML', () => {
    expect(checarPushHostsDev(`{\n  // ${NOME} só no .env local\n  "vars": {}\n}\n`, 'wrangler.jsonc')).toEqual([]);
    expect(checarPushHostsDev(`# ${NOME} nunca aqui\nrun: echo ok # sem ${NOME}\n`, '.github/workflows/deploy.yml')).toEqual(
      [],
    );
  });

  it('NOT-63: # dentro de string no YAML e // dentro de string no JSONC não escondem a variável', () => {
    expect(checarPushHostsDev(`run: echo "a#b" ${NOME}=x\n`, '.github/workflows/deploy.yml')).toHaveLength(1);
    expect(checarPushHostsDev(`{ "a": "https://x", "${NOME}": "1" }`, 'wrangler.jsonc')).toHaveLength(1);
  });

  it('NOT-63: o wrangler.jsonc e o deploy.yml reais passam', () => {
    expect(checarRepositorio()).toEqual([]);
  });
});
