import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from './apoio.ts';
import { abrirCenarioConta, criarSessao, type CenarioContaAberto, type Token } from './cenario-conta.ts';

/**
 * Matriz política × comando de `contas` e `sessoes` (T1; ACE-43, ACE-44, ACE-45), como
 * `pelada_app`, com a conta A, a conta B e sem contexto. Policies e grants em
 * `1792843380000_conta-tabelas.sql:69-81`. Cada caso morre com a policy aberta (`USING (true)`),
 * sem `WITH CHECK` ou com grant a mais.
 */

const PERMISSAO = { code: '42501' };

/** Colunas de `contas` que `pelada_app` pode ler (todas menos `senha_hash`). */
const COLUNAS_CONTA =
  'id, email, nome, senha_temporaria, e_dono, aviso_privacidade_visto_em, criada_em, ' +
  'email_confirmado_em, termos_versao, termos_aceitos_em, excluida_em';

let aberto: CenarioContaAberto;
let sessoesA: Token[];
let sessaoB: Token;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  const { db, cenario } = aberto;
  sessoesA = [await criarSessao(db, cenario.contaA), await criarSessao(db, cenario.contaA)];
  sessaoB = await criarSessao(db, cenario.contaB);
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Volta à role da sessão (o superusuário, sem RLS) dentro da transação do `comoApp`. */
async function comoSuperusuario<T>(db: pg.Client, fn: () => Promise<T>): Promise<T> {
  await db.query('RESET ROLE');
  return fn();
}

describe('contas como pelada_app', () => {
  it('ACE-43: SELECT da conta A devolve só a própria linha', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) => d.query<{ id: string }>(`SELECT ${COLUNAS_CONTA} FROM contas`));
    expect(r.rows.map((l) => l.id)).toEqual([cenario.contaA]);
  });

  it('ACE-43: SELECT da conta B devolve só a própria linha', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaB }, (d) => d.query<{ id: string }>('SELECT id FROM contas'));
    expect(r.rows.map((l) => l.id)).toEqual([cenario.contaB]);
  });

  it('ACE-43: SELECT da conta A filtrando a linha de B devolve zero linhas', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query('SELECT id, email FROM contas WHERE id = $1', [cenario.contaB]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('ACE-43: SELECT sem contexto devolve zero linhas', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('SELECT id FROM contas'));
    expect(r.rowCount).toBe(0);
  });

  it('ACE-43: SELECT de senha_hash, mesmo da própria linha, é recusado pelo grant de coluna', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => d.query('SELECT senha_hash FROM contas WHERE id = $1', [cenario.contaA])),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-43: SELECT * (que inclui senha_hash) é recusado', async () => {
    const { db, cenario } = aberto;
    await expect(comoApp(db, { conta: cenario.contaA }, (d) => d.query('SELECT * FROM contas'))).rejects.toMatchObject(
      PERMISSAO,
    );
  });

  it('ACE-43: INSERT em contas é recusado (sem grant)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query(`INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('nova@exemplo.test', 'Nova', 'x', now())`),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-43: UPDATE do nome da própria linha afeta 1 linha', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query(`UPDATE contas SET nome = 'Nome Novo' WHERE id = $1`, [cenario.contaA]),
    );
    expect(r.rowCount).toBe(1);
  });

  it('ACE-43: UPDATE da conta B sobre a linha de A afeta 0 linhas e A fica intacta', async () => {
    const { db, cenario } = aberto;
    const depois = await comoApp(db, { conta: cenario.contaB }, async (d) => {
      const r = await d.query(`UPDATE contas SET nome = 'Invadida' WHERE id = $1`, [cenario.contaA]);
      expect(r.rowCount).toBe(0);
      return comoSuperusuario(d, () => d.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [cenario.contaA]));
    });
    expect(depois.rows[0]?.nome).toBe('Conta A');
  });

  it('ACE-43: UPDATE sem WHERE da conta A afeta só a linha de A', async () => {
    const { db, cenario } = aberto;
    const alteradas = await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const r = await d.query(`UPDATE contas SET nome = 'Todas'`);
      expect(r.rowCount).toBe(1);
      return comoSuperusuario(d, () => d.query<{ id: string }>(`SELECT id FROM contas WHERE nome = 'Todas'`));
    });
    expect(alteradas.rows.map((l) => l.id)).toEqual([cenario.contaA]);
  });

  it('ACE-43: UPDATE sem contexto afeta 0 linhas', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query(`UPDATE contas SET nome = 'Ninguém'`));
    expect(r.rowCount).toBe(0);
  });

  it('ACE-43: UPDATE que muda o id da própria linha para o de B é recusado', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query('UPDATE contas SET id = $1 WHERE id = $2', [cenario.contaB, cenario.contaA]),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-43: UPDATE de coluna fora do grant (e_dono, senha_hash, email) é recusado', async () => {
    const { db, cenario } = aberto;
    for (const sql of [
      'UPDATE contas SET e_dono = true WHERE id = $1',
      `UPDATE contas SET senha_hash = 'x' WHERE id = $1`,
      `UPDATE contas SET email = 'outro@exemplo.test' WHERE id = $1`,
      'UPDATE contas SET email_confirmado_em = now() WHERE id = $1',
    ]) {
      await expect(comoApp(db, { conta: cenario.contaA }, (d) => d.query(sql, [cenario.contaA]))).rejects.toMatchObject(
        PERMISSAO,
      );
    }
  });

  it('ACE-43: DELETE em contas é recusado (sem grant)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) => d.query('DELETE FROM contas WHERE id = $1', [cenario.contaA])),
    ).rejects.toMatchObject(PERMISSAO);
  });
});

describe('sessoes como pelada_app', () => {
  it('ACE-44: SELECT da conta A devolve só as duas sessões de A', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query<{ conta_id: string; token_hash: Buffer }>('SELECT conta_id, token_hash FROM sessoes'),
    );
    expect(r.rows.map((l) => l.conta_id)).toEqual([cenario.contaA, cenario.contaA]);
    expect(r.rows.map((l) => l.token_hash.toString('hex')).sort()).toEqual(
      sessoesA.map((s) => s.hash.toString('hex')).sort(),
    );
  });

  it('ACE-44: a conta A não lê o token_hash de uma sessão de B, nem procurando por ele', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query('SELECT token_hash FROM sessoes WHERE token_hash = $1', [sessaoB.hash]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('ACE-44: SELECT da conta B devolve só a sessão de B', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaB }, (d) => d.query<{ conta_id: string }>('SELECT conta_id FROM sessoes'));
    expect(r.rows.map((l) => l.conta_id)).toEqual([cenario.contaB]);
  });

  it('ACE-44: SELECT sem contexto devolve zero sessões', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('SELECT id FROM sessoes'));
    expect(r.rowCount).toBe(0);
  });

  it('ACE-44: INSERT em sessoes é recusado (só conta_entrar cria sessão)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query(
          `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
           VALUES (gen_random_bytes(32), $1, 'completo', now(), now(), now() + interval '12 hours')`,
          [cenario.contaA],
        ),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-44: UPDATE em sessoes é recusado (só sessao_tocar renova)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoApp(db, { conta: cenario.contaA }, (d) =>
        d.query(`UPDATE sessoes SET expira_em = now() + interval '1 year' WHERE conta_id = $1`, [cenario.contaA]),
      ),
    ).rejects.toMatchObject(PERMISSAO);
  });

  it('ACE-44: DELETE da conta A sobre as sessões de B apaga 0 linhas', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query('DELETE FROM sessoes WHERE conta_id = $1', [cenario.contaB]),
    );
    expect(r.rowCount).toBe(0);
  });

  it('ACE-44: DELETE sem WHERE da conta A apaga só as de A e a de B continua', async () => {
    const { db, cenario } = aberto;
    const restantes = await comoApp(db, { conta: cenario.contaA }, async (d) => {
      const r = await d.query('DELETE FROM sessoes');
      expect(r.rowCount).toBe(2);
      return comoSuperusuario(d, () => d.query<{ conta_id: string }>('SELECT conta_id FROM sessoes'));
    });
    expect(restantes.rows.map((l) => l.conta_id)).toEqual([cenario.contaB]);
  });

  it('ACE-44: DELETE sem contexto apaga 0 sessões', async () => {
    const { db } = aberto;
    const r = await comoApp(db, {}, (d) => d.query('DELETE FROM sessoes'));
    expect(r.rowCount).toBe(0);
  });
});
