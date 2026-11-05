import { describe, expect, it } from 'vitest';
import { checarPlanoUnico, RAIZ } from '../plano-unico.ts';
import { arquivosDoRepositorio } from '../sem-url-absoluta.ts';

// Os valores são montados por partes: este teste fica fora do escopo da checagem (é teste), mas assim também não
// aparece numa busca pelo texto inteiro.
const ATIVO = ['ati', 'vo'].join('');
const CANCELADO = ['cance', 'lado'].join('');
const USO_PROPRIO = ['uso_', 'proprio'].join('');
const TRIAL = ['tri', 'al'].join('');
const COLUNA = ['situacao_', 'comercial'].join('');
const FUNCAO = ['plano', 'Efetivo'].join('');

describe('checagem plano-unico', () => {
  it(`PLA-01: arquivo de prova em backend/api/src com situacao === '${ATIVO}' reprova`, () => {
    const p = checarPlanoUnico([
      { caminho: 'backend/api/src/aplicacao/plano/prova.ts', conteudo: `// ok\nif (situacao === '${ATIVO}') liberar();\n` },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^backend\/api\/src\/aplicacao\/plano\/prova\.ts:2: compara a situação comercial/);
  });

  it('PLA-01: o mesmo em backend/dominio/src/plano/ passa', () => {
    expect(
      checarPlanoUnico([
        { caminho: 'backend/dominio/src/plano/prova.ts', conteudo: `if (situacao === '${ATIVO}') liberar();\n` },
      ]),
    ).toEqual([]);
  });

  it('PLA-01: migrações e testes ficam fora', () => {
    const conteudo = `if (situacao === '${ATIVO}') x();\nSELECT 1 WHERE ${COLUNA} = '${TRIAL}';\n`;
    expect(
      checarPlanoUnico([
        { caminho: 'backend/api/src/infraestrutura/db/migracoes/1799999999999_x.sql', conteudo },
        { caminho: 'backend/api/test/rotas/plano.test.ts', conteudo },
        { caminho: 'frontend/web/src/telas/plano/MeuPlano.test.tsx', conteudo },
      ]),
    ).toEqual([]);
  });

  it(`PLA-01: '${CANCELADO}' e '${USO_PROPRIO}' comparados reprovam também no front, inclusive em case`, () => {
    const p = checarPlanoUnico([
      { caminho: 'frontend/web/src/telas/plano/x.tsx', conteudo: `const c = s === '${CANCELADO}';\n` },
      { caminho: 'backend/api/src/x.ts', conteudo: `switch (s) {\n  case '${USO_PROPRIO}':\n}\n` },
      { caminho: 'backend/api/src/y.ts', conteudo: `if ('${CANCELADO}' !== s) {}\n` },
    ]);
    expect(p).toHaveLength(3);
  });

  it(`PLA-01: no front, plano === '${TRIAL}' e jogador.situacao === '${ATIVO}' passam (nomes ambíguos)`, () => {
    expect(
      checarPlanoUnico([
        {
          caminho: 'frontend/web/src/telas/plano/x.tsx',
          conteudo: `const t = plano === '${TRIAL}';\nconst a = j.situacao === '${ATIVO}';\n`,
        },
      ]),
    ).toEqual([]);
  });

  it(`PLA-01: no backend, situacaoComercial !== '${TRIAL}' reprova`, () => {
    expect(
      checarPlanoUnico([{ caminho: 'backend/api/src/x.ts', conteudo: `if (g.situacaoComercial !== '${TRIAL}') x();\n` }]),
    ).toHaveLength(1);
  });

  it(`PLA-01: SQL com ${COLUNA} = … num repositório reprova`, () => {
    const p = checarPlanoUnico([
      {
        caminho: 'backend/api/src/infraestrutura/db/repositorios/grupos.ts',
        conteudo: `sql\`SELECT id FROM grupos WHERE ${COLUNA} = 'x'\`;\n`,
      },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/filtra por/);
  });

  it(`PLA-01: ler a coluna ${COLUNA} sem filtrar passa`, () => {
    expect(
      checarPlanoUnico([
        { caminho: 'backend/api/src/infraestrutura/db/repositorios/plano.ts', conteudo: `sql\`SELECT ${COLUNA}, trial_inicio FROM x\`;\n` },
      ]),
    ).toEqual([]);
  });

  it(`PLA-01: ${FUNCAO} reimplementado fora do domínio reprova; importado passa`, () => {
    expect(
      checarPlanoUnico([{ caminho: 'backend/api/src/x.ts', conteudo: `export function ${FUNCAO}(s: string) {}\n` }]),
    ).toHaveLength(1);
    expect(
      checarPlanoUnico([{ caminho: 'frontend/web/src/x.ts', conteudo: `const ${FUNCAO} = () => 'free';\n` }]),
    ).toHaveLength(1);
    expect(
      checarPlanoUnico([
        { caminho: 'backend/api/src/x.ts', conteudo: `import { ${FUNCAO} } from '@pelada/dominio';\n${FUNCAO}(a, b, c, d);\n` },
      ]),
    ).toEqual([]);
  });

  it('PLA-01: a base atual do repositório passa', () => {
    expect(checarPlanoUnico(arquivosDoRepositorio(RAIZ))).toEqual([]);
  });
});
