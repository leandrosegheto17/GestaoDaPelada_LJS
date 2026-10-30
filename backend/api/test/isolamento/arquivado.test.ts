import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import { GRUPO_A, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { comContexto } from '../apoio/como-role.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';
import { CASOS } from './casos.ts';

// Isolamento do grupo arquivado (T32; GEL-25, GEL-27, GEL-107; AD-014), como pelada_app: em toda tabela com grupo_id
// que a pelada_app lê, a criadora (ainda admin) lê o grupo arquivado e a outra admin lê zero linhas; a lista de
// grupos só mostra o arquivado à criadora, em `arquivados`; o slug público continua vendo o grupo (regra anterior).

const OUTRA_ADMIN = '00000000-0000-0000-0000-0000000000a8';
const NEGOCIO = Object.entries(CASOS).filter(([, caso]) => caso.acesso === 'negocio');
// convites_admin traz o e-mail do convidado: pelo slug público não é legível (rls.test.ts).
const PELO_SLUG = NEGOCIO.filter(([tabela]) => tabela !== 'convites_admin');

let b: BancoDeRepositorio;
let cliente: pg.Client;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
  cliente = b.owner;
  await gravarDoisGrupos(cliente);
  await cliente.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, 'outra-admin@exemplo.com', 'Outra', 'x', now())",
    [OUTRA_ADMIN],
  );
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())',
    [OUTRA_ADMIN, GRUPO_A.grupo, GRUPO_A.conta],
  );
  await cliente.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]);
});

afterAll(async () => {
  await b?.encerrar();
});

async function linhasDeA(tabela: string, coluna: string): Promise<number> {
  const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela} WHERE ${coluna} = $1`, [
    GRUPO_A.grupo,
  ]);
  return Number(rows[0]?.n);
}

describe('tabelas com grupo_id no grupo arquivado (GEL-25, GEL-107)', () => {
  it.each(NEGOCIO)('%s: a criadora lê as linhas do arquivado', async (tabela, caso) => {
    expect(await comContexto(cliente, { conta: GRUPO_A.conta }, () => linhasDeA(tabela, caso.coluna))).toBeGreaterThan(
      0,
    );
  });

  it.each(NEGOCIO)('%s: a outra admin lê zero linhas', async (tabela, caso) => {
    expect(await comContexto(cliente, { conta: OUTRA_ADMIN }, () => linhasDeA(tabela, caso.coluna))).toBe(0);
  });

  it('a lista inclui jogadores, habilidades, notas e períodos', () => {
    expect(NEGOCIO.map(([t]) => t)).toEqual(
      expect.arrayContaining(['jogadores', 'habilidades', 'notas', 'periodos_ativos']),
    );
  });
});

describe('lista de grupos (GEL-25, GEL-27)', () => {
  it('a criadora vê o arquivado em arquivados; a outra admin não o vê', async () => {
    const daCriadora = await comDb(b.urlApp, { conta: GRUPO_A.conta }, (db) => grupos.listarDaConta(db));
    const daOutra = await comDb(b.urlApp, { conta: OUTRA_ADMIN }, (db) => grupos.listarDaConta(db));
    expect(daCriadora.ativos).toEqual([]);
    expect(daCriadora.arquivados.map((g) => g.id)).toEqual([GRUPO_A.grupo]);
    expect(daOutra).toEqual({ ativos: [], arquivados: [] });
  });
});

describe('ramo do slug público de grupos_visiveis() (inalterado)', () => {
  it.each(PELO_SLUG)('%s: só com o slug do arquivado, as linhas continuam visíveis', async (tabela, caso) => {
    expect(await comContexto(cliente, { slug: GRUPO_A.slug }, () => linhasDeA(tabela, caso.coluna))).toBeGreaterThan(0);
  });
});
