import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checarEmailDev } from '../email-dev.ts';
import { RAIZ } from '../sem-url-absoluta.ts';

// O nome é montado por partes: assim este teste não depende de como a checagem lê comentários.
const NOME = ['EMAIL', 'DEV'].join('_');

describe('checagem email-dev', () => {
  it('ACE-52: um wrangler.jsonc com a variável em vars reprova, com a linha', () => {
    const exemplo = `{\n  "vars": {\n    "VERSAO": "local",\n    "${NOME}": "1"\n  }\n}\n`;
    expect(checarEmailDev(exemplo)).toEqual([`wrangler.jsonc:4: define ${NOME}; ela só vale no .env local e no e2e`]);
  });

  it('ACE-52: a variável em qualquer outro lugar do JSON também reprova', () => {
    expect(checarEmailDev(`{ "env": { "dev": { "vars": { "${NOME}": "1" } } } }`)).toHaveLength(1);
  });

  it('ACE-52: comentário que cita o nome não reprova', () => {
    expect(checarEmailDev(`{\n  // ${NOME} só no .env local\n  "vars": {}\n}\n`)).toEqual([]);
    expect(checarEmailDev(`{ "vars": {} } // ${NOME} não\n`)).toEqual([]);
  });

  it('ACE-52: URL com // dentro de string não esconde a variável depois dela', () => {
    expect(checarEmailDev(`{ "a": "https://x", "${NOME}": "1" }`)).toHaveLength(1);
  });

  it('ACE-52: o wrangler.jsonc real passa', () => {
    expect(checarEmailDev(readFileSync(join(RAIZ, 'wrangler.jsonc'), 'utf8'))).toEqual([]);
  });
});
