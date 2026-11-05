import { describe, expect, it } from 'vitest';
import { checarEscritoresPeriodo } from '../escritores-periodo.ts';
import { arquivosDoRepositorio } from '../sem-url-absoluta.ts';

// A tabela e a coluna são montadas por partes, como na checagem.
const TABELA = ['periodos', 'ativos'].join('_');
const COLUNA = ['inicio', 'pontuacao'].join('_');

const ROTA = 'backend/api/src/entrada/rotas/exemplo.ts';
const REPO_JOGADORES = 'backend/api/src/infraestrutura/db/repositorios/jogadores.ts';

describe('checagem escritores-periodo', () => {
  it(`GEL-111: arquivo de exemplo em rotas/ com updateTable('${TABELA}') reprova`, () => {
    const p = checarEscritoresPeriodo([
      { caminho: ROTA, conteudo: `// ok\nawait db.updateTable('${TABELA}').set({ fim: hoje }).execute();\n` },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^backend\/api\/src\/entrada\/rotas\/exemplo\.ts:2: escrita Kysely/);
  });

  it(`GEL-111: o mesmo em repositorios/jogadores.ts passa`, () => {
    expect(
      checarEscritoresPeriodo([
        { caminho: REPO_JOGADORES, conteudo: `await db.updateTable('${TABELA}').set({ fim: hoje }).execute();` },
      ]),
    ).toEqual([]);
  });

  it.each([
    ['insertInto', `db.insertInto("${TABELA}").values(v)`],
    ['deleteFrom', `db.deleteFrom(\`${TABELA}\`)`],
    ['INSERT INTO', `sql\`INSERT INTO ${TABELA} (jogador_id) VALUES (1)\``],
    ['UPDATE', `sql\`update ${TABELA} SET fim = now()\``],
    ['DELETE FROM', `sql\`\n  DELETE FROM\n  ${TABELA} WHERE id = 1\``],
  ])('GEL-111: %s em outro repositório reprova', (_nome, conteudo) => {
    expect(
      checarEscritoresPeriodo([{ caminho: 'backend/api/src/infraestrutura/db/repositorios/grupos.ts', conteudo }]),
    ).toHaveLength(1);
  });

  it(`GEL-83: ${COLUNA} num SET fora do repositório reprova`, () => {
    const p = checarEscritoresPeriodo([
      { caminho: ROTA, conteudo: `sql\`UPDATE jogadores SET ${COLUNA} = \${data}::date WHERE id = \${id}\`` },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/num SET/);
  });

  it(`GEL-83: ${COLUNA} num .set({ … }) do Kysely, em várias linhas, reprova`, () => {
    const p = checarEscritoresPeriodo([
      {
        caminho: 'backend/api/src/infraestrutura/db/repositorios/jogadores-edicao.ts',
        conteudo: `await db\n  .updateTable('jogadores')\n  .set({\n    apelido,\n    ${COLUNA}: data,\n  })\n  .execute();`,
      },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/:3: .*set\/values/);
  });

  it(`GEL-83: ${COLUNA} na lista de colunas de um INSERT INTO jogadores reprova`, () => {
    expect(
      checarEscritoresPeriodo([
        { caminho: ROTA, conteudo: `sql\`INSERT INTO jogadores (grupo_id,\n apelido, ${COLUNA}) VALUES (1, 2, 3)\`` },
      ]),
    ).toHaveLength(1);
  });

  it('GEL-83, GEL-111: migrações passam', () => {
    expect(
      checarEscritoresPeriodo([
        {
          caminho: 'backend/api/src/infraestrutura/db/migracoes/1799999999999_x.sql',
          conteudo: `UPDATE ${TABELA} SET fim = NULL;\nUPDATE jogadores SET ${COLUNA} = now();`,
        },
      ]),
    ).toEqual([]);
  });

  it('leituras passam: SELECT, cast e o tipo da coluna', () => {
    expect(
      checarEscritoresPeriodo([
        {
          caminho: 'backend/api/src/infraestrutura/db/repositorios/jogadores-leitura.ts',
          conteudo: `sql\`SELECT ${COLUNA}::text AS ${COLUNA} FROM jogadores\`;\nsql\`SELECT inicio FROM ${TABELA} pa\`;\ntype T = { ${COLUNA}: string | null };`,
        },
        { caminho: 'backend/api/src/infraestrutura/db/tipos.ts', conteudo: `  ${COLUNA}: ColumnType<string | null>;\n  ${TABELA}: Tabela;` },
      ]),
    ).toEqual([]);
  });

  it('o front também é conferido', () => {
    expect(
      checarEscritoresPeriodo([{ caminho: 'frontend/web/src/x.ts', conteudo: `db.deleteFrom('${TABELA}')` }]),
    ).toHaveLength(1);
  });

  it('fora das pastas conferidas (testes, seed) nada reprova', () => {
    expect(
      checarEscritoresPeriodo([
        { caminho: 'backend/api/test/repositorios/x.test.ts', conteudo: `INSERT INTO ${TABELA} (x) VALUES (1)` },
        { caminho: 'backend/scripts/src/seed.ts', conteudo: `INSERT INTO ${TABELA} (x) VALUES (1)` },
      ]),
    ).toEqual([]);
  });

  it('a checagem roda na base atual e passa', () => {
    expect(checarEscritoresPeriodo(arquivosDoRepositorio())).toEqual([]);
  });
});
