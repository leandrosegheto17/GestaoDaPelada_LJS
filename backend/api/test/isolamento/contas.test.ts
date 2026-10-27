import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { codigoDoErro, comContexto } from '../apoio/como-role.ts';
import { CASOS_CONTA } from './casos.ts';

// Isolamento das tabelas de conta no banco, como pelada_app, com duas contas (ACE-43 a ACE-45).
const RECUSADO = '42501';
const A = GRUPO_A.conta;
const B = GRUPO_B.conta;

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

/** Conteúdo de todas as linhas da tabela, visto pelo owner (sem RLS). */
async function conteudo(tabela: string): Promise<string> {
  const { rows } = await cliente.query<{ h: string | null; n: string }>(
    `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h, count(*) AS n FROM ${tabela} t`,
  );
  return `${rows[0]?.n}:${rows[0]?.h}`;
}

/** Tenta a escrita e devolve as linhas afetadas, ou o código do erro se for recusada. */
async function escrever(sql: string, params: unknown[] = []): Promise<number | string> {
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

const PROPRIAS = Object.entries(CASOS_CONTA).filter(([, c]) => c.acesso === 'propria');
const SEM_GRANT = Object.entries(CASOS_CONTA).filter(([, c]) => c.acesso === 'sem-grant');

describe('as tabelas de conta têm caso de isolamento (ACE-45)', () => {
  it('contas, sessoes, tentativas_login e as tabelas de apoio novas estão em CASOS_CONTA', () => {
    expect(Object.keys(CASOS_CONTA).sort()).toEqual(
      ['contas', 'envios_email', 'links_conta', 'pedidos_reset', 'sessoes', 'tentativas_login'].sort(),
    );
  });
});

describe.each(PROPRIAS)('isolamento por conta de %s (ACE-43, ACE-44)', (tabela, caso) => {
  const coluna = caso.coluna ?? 'id';
  const contasVistas = async () =>
    (await cliente.query<{ c: string }>(`SELECT DISTINCT ${coluna} AS c FROM ${tabela} ORDER BY 1`)).rows.map(
      (r) => r.c,
    );

  it('A lê só as próprias linhas', async () => {
    expect(await comContexto(cliente, { conta: A }, contasVistas)).toEqual([A]);
  });

  it('B não lê nada de A', async () => {
    const r = await comContexto(cliente, { conta: B }, () =>
      cliente.query(`SELECT ${coluna} FROM ${tabela} WHERE ${coluna} = $1`, [A]),
    );
    expect(r.rows).toEqual([]);
  });

  it('sem contexto, não vê nenhuma linha', async () => {
    const n = await comContexto(cliente, {}, async () => {
      const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela}`);
      return Number(rows[0]?.n);
    });
    expect(n).toBe(0);
  });

  it('B não insere, não altera e não apaga nada de A', async () => {
    const antes = await conteudo(tabela);
    const depois = await comContexto(cliente, { conta: B }, async () => {
      expect(await escrever(`INSERT INTO ${tabela} DEFAULT VALUES`)).toBe(RECUSADO);
      const alterar =
        tabela === 'contas'
          ? await escrever("UPDATE contas SET nome = 'Invasor' WHERE id = $1", [A])
          : await escrever(`UPDATE ${tabela} SET ${coluna} = ${coluna} WHERE ${coluna} = $1`, [A]);
      expect(recusadaOuNenhuma(alterar)).toBe(true);
      expect(recusadaOuNenhuma(await escrever(`DELETE FROM ${tabela} WHERE ${coluna} = $1`, [A]))).toBe(true);
      await cliente.query('RESET ROLE');
      return conteudo(tabela);
    });
    expect(depois).toBe(antes);
    expect(antes.startsWith('2:')).toBe(true);
  });
});

describe('contas: colunas visíveis e alteráveis (ACE-43, ACE-44)', () => {
  it('ninguém lê senha_hash, nem a da própria conta', async () => {
    await comContexto(cliente, { conta: A }, async () => {
      expect(await codigoDoErro(cliente, 'SELECT senha_hash FROM contas WHERE id = $1', [A])).toBe(RECUSADO);
      expect(await codigoDoErro(cliente, 'SELECT * FROM contas')).toBe(RECUSADO);
    });
  });

  it('A lê os próprios dados de conta, sem o hash', async () => {
    const linhas = await comContexto(cliente, { conta: A }, async () => {
      const { rows } = await cliente.query(
        'SELECT id, email, nome, email_confirmado_em IS NOT NULL AS confirmado, excluida_em FROM contas',
      );
      return rows;
    });
    expect(linhas).toEqual([
      { id: A, email: 'grupo-a@exemplo.com', nome: 'grupo-a', confirmado: false, excluida_em: null },
    ]);
  });

  it('A altera o próprio nome, e só o nome', async () => {
    await comContexto(cliente, { conta: A }, async () => {
      expect(await escrever("UPDATE contas SET nome = 'Novo nome' WHERE id = $1", [A])).toBe(1);
      expect(await escrever("UPDATE contas SET email = 'outro@exemplo.com' WHERE id = $1", [A])).toBe(RECUSADO);
      expect(await escrever("UPDATE contas SET senha_hash = 'x' WHERE id = $1", [A])).toBe(RECUSADO);
      expect(await escrever('UPDATE contas SET e_dono = true WHERE id = $1', [A])).toBe(RECUSADO);
      expect(await escrever('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [A])).toBe(RECUSADO);
    });
  });
});

describe('sessoes: a conta apaga as próprias (ACE-44)', () => {
  it('A apaga a própria sessão; não cria nem altera sessão', async () => {
    await comContexto(cliente, { conta: A }, async () => {
      expect(await escrever('DELETE FROM sessoes WHERE conta_id = $1', [A])).toBe(1);
      expect(await escrever('UPDATE sessoes SET ultimo_uso_em = now()')).toBe(RECUSADO);
    });
  });
});

const UMA_COLUNA: Record<string, string> = {
  tentativas_login: 'sucesso',
  links_conta: 'usado_em',
  envios_email: 'enviado_em',
  pedidos_reset: 'resolvido_em',
};

describe.each(SEM_GRANT)('%s: só as funções do banco tocam (ACE-43, ACE-45)', (tabela) => {
  it('nem a própria conta lê, insere, altera ou apaga', async () => {
    const antes = await conteudo(tabela);
    const depois = await comContexto(cliente, { conta: A }, async () => {
      const coluna = UMA_COLUNA[tabela];
      expect(await escrever(`SELECT 1 FROM ${tabela}`)).toBe(RECUSADO);
      expect(await escrever(`INSERT INTO ${tabela} DEFAULT VALUES`)).toBe(RECUSADO);
      expect(await escrever(`UPDATE ${tabela} SET ${coluna} = ${coluna}`)).toBe(RECUSADO);
      expect(await escrever(`DELETE FROM ${tabela}`)).toBe(RECUSADO);
      await cliente.query('RESET ROLE');
      return conteudo(tabela);
    });
    expect(depois).toBe(antes);
    expect(antes.startsWith('2:')).toBe(true);
  });
});
