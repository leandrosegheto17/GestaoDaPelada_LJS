import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from './apoio.ts';
import {
  conteudo,
  escritaDe,
  ident as q,
  idsDoGrupo,
  RLS,
  SEM_GRANT,
  tentar,
  type IdsDoGrupo,
  type Tentativa,
} from './casos-escrita.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from './cenario-grupos.ts';
import { MATRIZ } from './matriz.ts';

/**
 * Matriz do grupo arquivado por comando (T1; GEL-25, GEL-107, GEL-112). Caracteriza a `grupos_visiveis()` vigente
 * (`1792844280000_grupos-visiveis-arquivado.sql:9-20`) com G arquivado, como `pelada_app`: a criadora C vê e escreve;
 * a outra admin O vê zero linhas e não escreve, inclusive com UPDATE e DELETE sem WHERE; B continua sem ver G; o
 * slug público sem conta não vê G (desde a T26 da partidas-e-ranking; antes via); reativado, O volta a ver.
 *
 * Evidência da rede (registrar na T1): com `grupos_visiveis()` trocada, no banco de teste, pela versão de
 * `1792843320000_rls.sql:17-24` (sem o filtro de arquivado), os testes de O ficam vermelhos.
 */

let aberto: CenarioGruposAberto;
let idsG: IdsDoGrupo;
let antesG: Record<string, string>;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  await arquivar(db, cenario.grupoG);
  idsG = await idsDoGrupo(db, cenario.grupoG);
  antesG = await conteudo(db, cenario.grupoG);
});

afterAll(async () => {
  await aberto?.fechar();
});

function tentarEmG(conta: string, sql: string, valores: unknown[] = []): Promise<Tentativa> {
  return tentar(aberto.db, { conta }, aberto.cenario.grupoG, sql, valores);
}

function esperaRecusa(t: Tentativa, motivo: RegExp): void {
  expect(t.erro?.code, t.erro?.message ?? `afetou ${t.linhas} linha(s)`).toBe('42501');
  expect(t.erro?.message).toMatch(motivo);
  expect(t.observado).toEqual(antesG);
}

function esperaZero(t: Tentativa): void {
  expect(t.erro, t.erro?.message).toBeNull();
  expect(t.linhas).toBe(0);
  expect(t.observado).toEqual(antesG);
}

async function linhasDeG(tabela: string, coluna: string): Promise<number> {
  const { db, cenario } = aberto;
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ${q(db, tabela)} WHERE ${q(db, coluna)} = $1`,
    [cenario.grupoG],
  );
  return r.rows[0]?.n ?? 0;
}

async function vistoEmG(conta: string, tabela: string, coluna: string): Promise<number> {
  const { db, cenario } = aberto;
  return comoApp(db, { conta }, async (d) => {
    const r = await d.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${q(d, tabela)} WHERE ${q(d, coluna)} = $1`,
      [cenario.grupoG],
    );
    return r.rows[0]?.n ?? 0;
  });
}

const porGrupo = MATRIZ.filter((c) => c.leitura === 'por-grupo');

describe.each(porGrupo)('GEL-25: G arquivado, $tabela', (caso) => {
  const e = escritaDe(caso);
  const tab = caso.tabela;
  const col = caso.coluna;

  it('GEL-25: SELECT, a criadora C vê todas as linhas de G', async () => {
    const { cenario } = aberto;
    const total = await linhasDeG(tab, col);
    expect(total).toBeGreaterThan(0);
    expect(await vistoEmG(cenario.contaC, tab, col)).toBe(total);
  });

  it('GEL-25: SELECT, a outra admin O vê zero linhas de G', async () => {
    const { cenario } = aberto;
    expect(await vistoEmG(cenario.contaO, tab, col)).toBe(0);
  });

  it('GEL-25: INSERT, a outra admin O é recusada e G fica idêntico', async () => {
    const { cenario } = aberto;
    const [sql, valores] = e.inserir(cenario.grupoG, cenario.contaO, idsG);
    esperaRecusa(await tentarEmG(cenario.contaO, sql, valores), e.insere ? RLS : SEM_GRANT);
  });

  it('GEL-25: INSERT, a criadora C não é barrada pela RLS', async () => {
    const { cenario } = aberto;
    const [sql, valores] = e.inserir(cenario.grupoG, cenario.contaC, idsG);
    const t = await tentarEmG(cenario.contaC, sql, valores);
    if (!e.insere || e.donoInsere === false) {
      expect(t.erro?.code).toBe('42501');
      return;
    }
    // Sucesso, ou erro de outra natureza (unicidade, chave estrangeira): nunca 42501.
    if (t.erro) expect(t.erro.code, t.erro.message).not.toBe('42501');
    else expect(t.linhas).toBe(1);
  });

  it('GEL-25: UPDATE com WHERE, a outra admin O afeta zero linhas de G', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(
      cenario.contaO,
      `UPDATE ${q(db, tab)} SET ${e.alterar} WHERE ${q(db, col)} = $1`,
      [cenario.grupoG],
    );
    if (e.altera) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('GEL-25: UPDATE sem WHERE, a outra admin O não altera nenhuma linha de G', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(cenario.contaO, `UPDATE ${q(db, tab)} SET ${e.alterar}`);
    if (e.altera) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('GEL-25: UPDATE com WHERE, a criadora C altera G', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(
      cenario.contaC,
      `UPDATE ${q(db, tab)} SET ${e.alterar} WHERE ${q(db, col)} = $1`,
      [cenario.grupoG],
    );
    if (!e.altera) {
      esperaRecusa(t, SEM_GRANT);
      return;
    }
    if (t.erro) expect(t.erro.code, t.erro.message).not.toBe('42501');
    else expect(t.linhas).toBeGreaterThan(0);
  });

  it('GEL-25: DELETE com WHERE, a outra admin O afeta zero linhas de G', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(
      cenario.contaO,
      `DELETE FROM ${q(db, tab)} WHERE ${q(db, col)} = $1`,
      [cenario.grupoG],
    );
    if (e.apaga) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('GEL-25: DELETE sem WHERE, a outra admin O não apaga nenhuma linha de G', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(cenario.contaO, `DELETE FROM ${q(db, tab)}`);
    if (e.apaga) esperaZero(t);
    else esperaRecusa(t, SEM_GRANT);
  });

  it('GEL-25: DELETE com WHERE, a criadora C não é barrada pela RLS onde há grant', async () => {
    const { db, cenario } = aberto;
    const t = await tentarEmG(
      cenario.contaC,
      `DELETE FROM ${q(db, tab)} WHERE ${q(db, col)} = $1`,
      [cenario.grupoG],
    );
    if (!e.apaga) {
      esperaRecusa(t, SEM_GRANT);
      return;
    }
    // Apaga, ou esbarra numa chave estrangeira do histórico (23503): nunca 42501 nem zero linhas sem erro.
    if (t.erro) expect(t.erro.code, t.erro.message).not.toBe('42501');
    else expect(t.linhas).toBeGreaterThan(0);
  });
});

describe('GEL-107: a conta B continua sem ver nem alterar G', () => {
  it('GEL-107: com G arquivado, B não vê G e o UPDATE sem WHERE de B não toca G', async () => {
    const { cenario } = aberto;
    expect(await vistoEmG(cenario.contaB, 'grupos', 'id')).toBe(0);
    // Sem WHERE, B só alcança o próprio grupo H (uma linha); G fica idêntico.
    const t = await tentarEmG(cenario.contaB, `UPDATE grupos SET nome = 'Invadido'`);
    expect(t.erro, t.erro?.message).toBeNull();
    expect(t.linhas).toBe(1);
    expect(t.observado).toEqual(antesG);
  });
});

// Trocado pela T26 da partidas-e-ranking (1792844880000_grupos-visiveis-publico-ativo.sql; PAR-92; Autorizações de
// 2026-11-04): o ramo do slug passou a esconder o grupo arquivado. Mesma consulta e lista exata; G sai do resultado.
describe('GEL-112 e PAR-92: o slug público não vê G arquivado', () => {
  it('PAR-92: sem conta, com o slug de G arquivado, a leitura de grupos devolve nada', async () => {
    const { db, cenario } = aberto;
    const ids = await comoApp(db, { slug: cenario.slugG }, async (d) => {
      const r = await d.query<{ id: string }>('SELECT id FROM grupos');
      return r.rows.map((l) => l.id);
    });
    expect(ids).toEqual([]);
  });

  it('GEL-112: sem conta, com o slug de G, a escrita continua recusada', async () => {
    const { cenario } = aberto;
    const t = await tentar(
      aberto.db,
      { slug: cenario.slugG },
      cenario.grupoG,
      `UPDATE grupos SET nome = 'Invadido'`,
    );
    expect(t.erro, t.erro?.message).toBeNull();
    expect(t.linhas).toBe(0);
    expect(t.observado).toEqual(antesG);
  });
});

describe('GEL-25: reativado, a outra admin O volta a ver G', () => {
  beforeAll(async () => {
    await reativar(aberto.db, aberto.cenario.grupoG);
  });

  afterAll(async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
  });

  it('GEL-25: O vê G e as linhas de G em jogadores', async () => {
    const { cenario } = aberto;
    expect(await vistoEmG(cenario.contaO, 'grupos', 'id')).toBe(1);
    expect(await vistoEmG(cenario.contaO, 'jogadores', 'grupo_id')).toBe(
      await linhasDeG('jogadores', 'grupo_id'),
    );
  });

  it('GEL-107: reativado, B continua sem ver G', async () => {
    const { cenario } = aberto;
    expect(await vistoEmG(cenario.contaB, 'grupos', 'id')).toBe(0);
  });
});
