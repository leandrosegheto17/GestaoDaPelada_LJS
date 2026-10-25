import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { codigoDoErro, comContexto } from '../apoio/como-role.ts';
import { CASOS, type Caso } from './casos.ts';

// Isolamento no banco, como pelada_app, sem passar pela API (FUN-17, design C3).
const RECUSADO = '42501';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  await gravarDoisGrupos(cliente);
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

/** Conteúdo das linhas do grupo A na tabela, visto pelo owner (sem RLS). */
async function linhasDeA(tabela: string, caso: Caso): Promise<string> {
  const { rows } = await cliente.query<{ h: string | null; n: string }>(
    `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h, count(*) AS n FROM ${tabela} t WHERE ${caso.coluna} = $1`,
    [GRUPO_A.grupo],
  );
  return `${rows[0]?.n}:${rows[0]?.h}`;
}

/** Tenta a escrita e devolve as linhas afetadas, ou o código do erro se for recusada. */
async function escrever(sql: string, params: unknown[]): Promise<number | string> {
  await cliente.query('SAVEPOINT escrita');
  try {
    const r = await cliente.query(sql, params);
    await cliente.query('RELEASE SAVEPOINT escrita');
    return r.rowCount ?? 0;
  } catch (erro) {
    await cliente.query('ROLLBACK TO SAVEPOINT escrita');
    return (erro as { code?: string }).code ?? 'sem-codigo';
  }
}

const recusadaOuNenhuma = (r: number | string) => r === 0 || r === RECUSADO;

describe.each(Object.entries(CASOS))('isolamento de %s', (tabela, caso) => {
  const ler = (grupo: string) =>
    cliente.query<{ g: string }>(`SELECT ${caso.coluna} AS g FROM ${tabela} WHERE ${caso.coluna} = $1`, [grupo]);
  const gruposVisiveis = async () =>
    (await cliente.query<{ g: string }>(`SELECT DISTINCT ${caso.coluna} AS g FROM ${tabela} ORDER BY 1`)).rows.map(
      (r) => r.g,
    );

  if (caso.acesso === 'negocio') {
    it('A lê só as linhas do próprio grupo', async () => {
      expect(await comContexto(cliente, { conta: GRUPO_A.conta }, gruposVisiveis)).toEqual([GRUPO_A.grupo]);
    });

    it('B não lê nada de A', async () => {
      const r = await comContexto(cliente, { conta: GRUPO_B.conta }, () => ler(GRUPO_A.grupo));
      expect(r.rows).toEqual([]);
    });

    it('a mesma inserção que B tenta em A não é barrada pela RLS para A (controle)', async () => {
      const [sql, params] = caso.inserir(GRUPO_A);
      const r = await comContexto(cliente, { conta: GRUPO_A.conta }, () => codigoDoErro(cliente, sql, params));
      expect(r).not.toBe(RECUSADO);
    });
  } else {
    it('nenhuma conta lê, nem a do próprio grupo (sem grant na fundação)', async () => {
      const r = await comContexto(cliente, { conta: GRUPO_A.conta }, () =>
        codigoDoErro(cliente, `SELECT 1 FROM ${tabela}`),
      );
      expect(r).toBe(RECUSADO);
    });
  }

  it('B não insere, não altera e não apaga nada de A', async () => {
    const antes = await linhasDeA(tabela, caso);
    const depois = await comContexto(cliente, { conta: GRUPO_B.conta }, async () => {
      const [sql, params] = caso.inserir(GRUPO_A);
      expect(await escrever(sql, params)).toBe(RECUSADO);
      const alterar = await escrever(`UPDATE ${tabela} SET ${caso.coluna} = ${caso.coluna} WHERE ${caso.coluna} = $1`, [
        GRUPO_A.grupo,
      ]);
      expect(recusadaOuNenhuma(alterar)).toBe(true);
      const mover = await escrever(`UPDATE ${tabela} SET ${caso.coluna} = $2 WHERE ${caso.coluna} = $1`, [
        GRUPO_A.grupo,
        GRUPO_B.grupo,
      ]);
      expect(recusadaOuNenhuma(mover)).toBe(true);
      const apagar = await escrever(`DELETE FROM ${tabela} WHERE ${caso.coluna} = $1`, [GRUPO_A.grupo]);
      expect(recusadaOuNenhuma(apagar)).toBe(true);
      await cliente.query('RESET ROLE');
      return linhasDeA(tabela, caso);
    });
    expect(depois).toBe(antes);
    expect(antes.startsWith('0:')).toBe(false);
  });

  it('o slug público não escreve', async () => {
    const antes = await linhasDeA(tabela, caso);
    const depois = await comContexto(cliente, { slug: GRUPO_A.slug }, async () => {
      const [sql, params] = caso.inserir(GRUPO_A);
      expect(await escrever(sql, params)).toBe(RECUSADO);
      const alterar = await escrever(`UPDATE ${tabela} SET ${caso.coluna} = ${caso.coluna} WHERE ${caso.coluna} = $1`, [
        GRUPO_A.grupo,
      ]);
      expect(recusadaOuNenhuma(alterar)).toBe(true);
      const apagar = await escrever(`DELETE FROM ${tabela} WHERE ${caso.coluna} = $1`, [GRUPO_A.grupo]);
      expect(recusadaOuNenhuma(apagar)).toBe(true);
      await cliente.query('RESET ROLE');
      return linhasDeA(tabela, caso);
    });
    expect(depois).toBe(antes);
  });

  it('sem contexto, não vê nenhuma linha', async () => {
    const r = await comContexto(cliente, {}, async () => {
      await cliente.query('SAVEPOINT leitura');
      try {
        const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela}`);
        return Number(rows[0]?.n);
      } catch (erro) {
        await cliente.query('ROLLBACK TO SAVEPOINT leitura');
        return (erro as { code?: string }).code;
      }
    });
    expect(r).toBe(caso.acesso === 'negocio' ? 0 : RECUSADO);
  });
});
