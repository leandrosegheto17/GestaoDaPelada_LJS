import { describe, expect, it } from 'vitest';
import { checarDonoEHash } from '../sem-e-dono.ts';
import { arquivosDoRepositorio } from '../sem-url-absoluta.ts';

// O nome da coluna e a chamada são montados por partes: este arquivo não pode citá-los por
// inteiro, senão a checagem da base atual reprovaria o próprio teste.
const DONO = ['e', 'dono'].join('_');
const CRYPT = ['cry', 'pt('].join('');

describe('checagem sem-e-dono', () => {
  it(`ACE-63: arquivo de exemplo em rotas/ com a coluna de dono reprova`, () => {
    const p = checarDonoEHash([
      {
        caminho: 'backend/api/src/entrada/rotas/exemplo.ts',
        conteudo: `// ok\nconst x = linha.${DONO};\n`,
      },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^backend\/api\/src\/entrada\/rotas\/exemplo\.ts:2: cita a coluna/);
  });

  it('ACE-63: a coluna de dono em aplicacao/ e em repositorios/ também reprova', () => {
    const conteudo = `SELECT ${DONO} FROM contas`;
    expect(
      checarDonoEHash([
        { caminho: 'backend/api/src/aplicacao/acesso/x.ts', conteudo },
        { caminho: 'backend/api/src/infraestrutura/db/repositorios/x.ts', conteudo },
      ]),
    ).toHaveLength(2);
  });

  it('ACE-63: a coluna de dono em migracoes/ passa', () => {
    expect(
      checarDonoEHash([
        {
          caminho: 'backend/api/src/infraestrutura/db/migracoes/1799999999999_x.sql',
          conteudo: `UPDATE contas SET ${DONO} = true;\nSELECT ${CRYPT}'x', gen_salt('bf'));\n`,
        },
      ]),
    ).toEqual([]);
  });

  it('ACE-63: a coluna de dono num nome maior (outra palavra) não reprova', () => {
    expect(
      checarDonoEHash([
        { caminho: 'backend/api/src/entrada/x.ts', conteudo: `const ${DONO}s_x = 1;` },
      ]),
    ).toEqual([]);
  });

  it(`crypt( num repositório reprova`, () => {
    const p = checarDonoEHash([
      {
        caminho: 'backend/api/src/infraestrutura/db/repositorios/contas.ts',
        conteudo: `sql\`SELECT ${CRYPT}\${senha}, gen_salt('bf'))\``,
      },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/usa crypt\(/);
  });

  it('biblioteca de hash de senha na API ou no front reprova', () => {
    expect(
      checarDonoEHash([
        {
          caminho: 'backend/api/src/infraestrutura/x.ts',
          conteudo: `import bcrypt from 'bcryptjs';`,
        },
        { caminho: 'frontend/web/src/x.ts', conteudo: `import { hash } from "argon2";` },
      ]),
    ).toHaveLength(2);
  });

  it('crypto.subtle e decrypt( não são o crypt do bcrypt', () => {
    expect(
      checarDonoEHash([
        {
          caminho: 'backend/api/src/infraestrutura/x.ts',
          conteudo: `await crypto.subtle.digest('SHA-256', b);\ndecrypt(x);`,
        },
      ]),
    ).toEqual([]);
  });

  it('fora das pastas conferidas (testes, scripts) nada reprova', () => {
    expect(
      checarDonoEHash([
        {
          caminho: 'backend/api/test/isolamento/cenario-conta.ts',
          conteudo: `${CRYPT}$2, gen_salt('bf', 4)) ${DONO}`,
        },
        { caminho: 'backend/scripts/src/seed.ts', conteudo: DONO },
      ]),
    ).toEqual([]);
  });

  it('a checagem roda na base atual e passa', () => {
    expect(checarDonoEHash(arquivosDoRepositorio())).toEqual([]);
  });
});
