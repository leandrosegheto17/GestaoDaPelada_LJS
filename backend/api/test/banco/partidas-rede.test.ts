import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  gruposVistos,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Rede de proteção da partidas-e-ranking (T0; PAR-91, PAR-15, PAR-130, linha de base): o comportamento atual do
 * banco que as migrações desta feature (T21 a T26) tocam.
 *
 * (a) ramo com conta de `grupos_visiveis()` (`1792844280000_grupos-visiveis-arquivado.sql:9-22`): fica verde até o
 *     fim da feature;
 * (b) `grupo_criar` de 6 parâmetros (`1792844340000_grupo-criar.sql:10-75`): fica verde até o fim (a delegação de
 *     T22 o mantém), por isso não afirma nada sobre `config_pesos`;
 * (c) grants atuais de `partidas`, `config_pesos`, `presencas` e `eventos_uso` (`1792843260000_roles.sql:22-31`):
 *     documenta o antes de T23 e T25, que trocam estes testes com motivo no commit;
 * (d) ramo do slug ainda mostra grupo arquivado (I-3): é o teste que T26 inverte, com motivo.
 *
 * Evidência da rede (registrar na T0 do tasks.md, pelo /executar):
 * - (a) `CREATE OR REPLACE` de `grupos_visiveis()` sem `(g.arquivado_em IS NULL OR g.criado_por = app_conta_id())`
 *   deixa vermelho "arquivado some para a conta não criadora";
 * - (b) `grupo_criar` sem o `INSERT INTO vinculos_admin` deixa vermelho "cria grupo, vínculo e habilidades";
 * - (c) `GRANT INSERT ON eventos_uso TO pelada_app` deixa vermelho "nenhum grant em eventos_uso";
 * - (d) a migração de T26 deixa vermelho "slug de arquivado ainda é visível" (é a inversão prevista).
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

async function privilegios(tabela: string): Promise<string[]> {
  const r = await aberto.db.query<{ privilege_type: string }>(
    `SELECT privilege_type FROM information_schema.role_table_grants
      WHERE grantee = 'pelada_app' AND table_schema = 'public' AND table_name = $1
      ORDER BY privilege_type`,
    [tabela],
  );
  return r.rows.map((l) => l.privilege_type);
}

describe('rede da partidas-e-ranking: grupos_visiveis() com conta (a)', () => {
  it('PAR-91: grupo arquivado some para a conta não criadora e aparece para a criadora', async () => {
    const { cenario, db } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      expect(await gruposVistos(db, cenario.contaO)).not.toContain(cenario.grupoG);
      expect(await gruposVistos(db, cenario.contaC)).toContain(cenario.grupoG);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });

  it('PAR-91: grupo ativo aparece para as duas admins e não para a conta de outro grupo', async () => {
    const { cenario, db } = aberto;
    expect(await gruposVistos(db, cenario.contaO)).toContain(cenario.grupoG);
    expect(await gruposVistos(db, cenario.contaC)).toContain(cenario.grupoG);
    expect(await gruposVistos(db, cenario.contaB)).not.toContain(cenario.grupoG);
  });
});

// (b) desde a T25 do simulador chama a de 7 (a de 6 foi removida, AD-037), mesmas asserções.
describe('rede da partidas-e-ranking: grupo_criar de 6 parâmetros (b)', () => {
  it('PAR-15: cria grupo, vínculo e as habilidades', async () => {
    const { cenario, db } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const r = await d.query<{ id: string }>(
        `SELECT id FROM grupo_criar('Racha da Rede', 'quinta', 'semanal', '20:00', 'racha-da-rede',
           ARRAY['Passe', 'Chute']::text[], (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
      );
      const id = r.rows[0]?.id;
      expect(id).toBeTruthy();
      await d.query('RESET ROLE');
      expect(await contar(d, 'SELECT 1 FROM grupos WHERE id = $1', [id])).toBe(1);
      expect(await contar(d, 'SELECT 1 FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2', [id, cenario.contaC])).toBe(1);
      expect(await contar(d, 'SELECT 1 FROM habilidades WHERE grupo_id = $1', [id])).toBe(2);
    });
  });

  it('PAR-15: falha forçada (habilidade de 1 caractere) desfaz grupo, vínculo e habilidades', async () => {
    const { cenario, db } = aberto;
    const totais = async (d: pg.Client): Promise<number[]> => [
      await contar(d, 'SELECT 1 FROM grupos'),
      await contar(d, 'SELECT 1 FROM vinculos_admin'),
      await contar(d, 'SELECT 1 FROM habilidades'),
      await contar(d, 'SELECT 1 FROM config_pesos'),
    ];
    const antes = await totais(db);
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      await d.query('SAVEPOINT antes');
      await expect(
        d.query(
          `SELECT id FROM grupo_criar('Racha Falho', 'quinta', 'semanal', '20:00', 'racha-falho', ARRAY['Passe', 'X']::text[],
             (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      await d.query('RESET ROLE');
      expect(await totais(d)).toEqual(antes);
    });
  });
});

describe('rede da partidas-e-ranking: grants atuais (c)', () => {
  // Trocado pela T25 (1792844820000_grants-partidas-pesos.sql): antes, UPDATE na tabela inteira; agora, sem UPDATE de
  // tabela e com UPDATE só nas colunas que a edição muda (a lista exata está em grants-partidas-pesos.test.ts).
  it('PAR-130: pelada_app não tem UPDATE de tabela em partidas nem em config_pesos (T25)', async () => {
    expect(await privilegios('partidas')).toEqual(['DELETE', 'INSERT', 'SELECT']);
    expect(await privilegios('config_pesos')).toEqual(['INSERT', 'SELECT']);
  });

  it('PAR-130: pelada_app tem SELECT, INSERT, UPDATE e DELETE em presencas', async () => {
    expect(await privilegios('presencas')).toEqual(expect.arrayContaining(['DELETE', 'INSERT', 'SELECT', 'UPDATE']));
  });

  // Trocado pela T23 (1792844700000_eventos-uso.sql): antes, nenhum grant; agora, exatamente SELECT e INSERT.
  it('PAR-130: em eventos_uso, pelada_app tem exatamente SELECT e INSERT (T23)', async () => {
    expect(await privilegios('eventos_uso')).toEqual(['INSERT', 'SELECT']);
  });
});

// Item (d) invertido pela T26 (1792844880000_grupos-visiveis-publico-ativo.sql): o I-3 deixou de valer. Mesmo ator e
// mesma consulta; a asserção passa de "vê G" para "vê nada", tão estrita quanto antes (lista exata).
describe('rede da partidas-e-ranking: ramo do slug (d, I-3 fechado pela T26)', () => {
  it('PAR-92 (depois da T26): slug de arquivado não vê o grupo pelo ramo do slug', async () => {
    const { cenario, db } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      const vistos = await comoApp(db, { slug: cenario.slugG }, async (d) => {
        const r = await d.query<{ id: string }>('SELECT id FROM grupos');
        return r.rows.map((l) => l.id);
      });
      expect(vistos).toEqual([]);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });
});
