import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  comoConta,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Rede de proteção do financeiro (T0; FIN-37, FIN-38, FIN-39, FIN-41, linha de base): o comportamento atual do banco
 * que as migrações desta feature (T9, T10) trocam ou precisam manter. Atores do cenário de grupos: C = criadora de G
 * (nasce com `acessa_financeiro = true` pela `grupo_criar`), O = admin de G sem acesso ao financeiro, B = conta só do
 * grupo H.
 *
 * (a) constraints das 3 tabelas (`1792843200000_linha-de-base.sql:233-269`): ficam verdes até o fim;
 * (b) conta de outro grupo não lê nem escreve (`1792843320000_rls.sql:32-61`): fica verde até o fim;
 * (c) SEC-003 vigente: o slug de G lê as 3 tabelas e O lê e escreve. São os testes que T9 inverte, com motivo;
 * (d) `pelada_app` muda `vinculos_admin.acessa_financeiro` da própria conta: é o teste que T10 inverte, com motivo;
 * (e) exclusão de jogador com pagamento dá 23503 (GEL-85) e `admins_listar` devolve `acessa_financeiro`
 *     (`1792843680000_conta-admins-listar.sql:8-20`): ficam verdes até o fim;
 * (f) arquivado: a não criadora não vê as linhas do financeiro (FIN-37): fica verde até o fim.
 *
 * Evidência da rede (registrar na T0 do tasks.md, pelo /executar, uma sabotagem por item numa cópia):
 * - (a) `ALTER TABLE pagamentos_mes DROP CONSTRAINT pagamentos_mes_lancamento_id_key` deixa vermelho o 23505 do
 *   lançamento repetido; trocar o `ON DELETE RESTRICT` por `CASCADE` deixa vermelho o 23503;
 * - (b) `CREATE POLICY ... FOR SELECT TO pelada_app USING (true)` em `lancamentos` deixa vermelho "B não lê";
 * - (c) a migração de T9 deixa vermelhos os testes marcados "T9 inverte" (é a inversão prevista);
 * - (d) a migração de T10 deixa vermelho o teste marcado "T10 inverte";
 * - (e) `REVOKE DELETE ON jogadores FROM pelada_app` muda o código para 42501 e deixa vermelho o 23503;
 * - (f) `grupos_visiveis()` sem o ramo do arquivado deixa vermelho "O vê zero linhas".
 */

const TABELAS_FINANCEIRO = ['config_financeira', 'lancamentos', 'pagamentos_mes'] as const;

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

/** Linhas de G em cada tabela do financeiro, vistas pelo contexto dado. */
async function linhasDeG(contexto: { conta?: string; slug?: string }): Promise<number[]> {
  const { db, cenario } = aberto;
  return comoApp(db, contexto, async (d) => {
    const n: number[] = [];
    for (const tabela of TABELAS_FINANCEIRO) {
      n.push(await contar(d, `SELECT 1 FROM ${tabela} WHERE grupo_id = $1`, [cenario.grupoG]));
    }
    return n;
  });
}

const inserirLancamento = (d: pg.Client, grupo: string, conta: string, valor = 1_000, descricao = 'Bolas') =>
  d.query(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'saida', '2026-01-10', $4, $3, $2, now(), $2, now()) RETURNING id`,
    [grupo, conta, valor, descricao],
  );

describe('rede do financeiro: constraints das 3 tabelas (a)', () => {
  it('FIN-13: valor_centavos 0 e 100.000.000 recusados', async () => {
    const { db, cenario } = aberto;
    for (const valor of [0, 100_000_000]) {
      await expect(
        comoConta(db, cenario.contaC, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaC, valor)),
      ).rejects.toMatchObject({ code: '23514' });
    }
  });

  it('FIN-13: valor_centavos 1 e 99.999.999 aceitos', async () => {
    const { db, cenario } = aberto;
    for (const valor of [1, 99_999_999]) {
      const r = await comoConta(db, cenario.contaC, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaC, valor));
      expect(r.rowCount).toBe(1);
    }
  });

  it('FIN-13: descrição só com espaços recusada', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaC, 1_000, '   ')),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('FIN-13: mensalidade 0 na configuração recusada', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query('UPDATE config_financeira SET mensalidade_centavos = 0 WHERE grupo_id = $1', [cenario.grupoG]),
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('FIN-20: segundo pagamento do mesmo jogador e mês dá 23505', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(
          `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
           VALUES ($1, $2, '2026-01', NULL, $3, now())`,
          [cenario.grupoG, cenario.idsG.jogadorHistorico, cenario.contaC],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('FIN-20: o mesmo lançamento em dois pagamentos dá 23505 (UNIQUE lancamento_id)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) =>
        d.query(
          `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
           VALUES ($1, $2, '2026-02', $3, $4, now())`,
          [cenario.grupoG, cenario.idsG.jogadorAtivo, cenario.idsG.lancamento, cenario.contaC],
        ),
      ),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('FIN-30: apagar o lançamento de um pagamento dá 23503', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, (d) => d.query('DELETE FROM lancamentos WHERE id = $1', [cenario.idsG.lancamento])),
    ).rejects.toMatchObject({ code: '23503' });
  });
});

describe('rede do financeiro: conta de outro grupo (b)', () => {
  it('FIN-39: B vê zero linhas de G nas 3 tabelas', async () => {
    expect(await linhasDeG({ conta: aberto.cenario.contaB })).toEqual([0, 0, 0]);
  });

  it('FIN-39: B não insere lançamento em G', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaB, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaB)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('FIN-39: UPDATE e DELETE sem WHERE de B não afetam G', async () => {
    const { db, cenario } = aberto;
    const afetadas = await comoConta(db, cenario.contaB, async (d) => [
      (await d.query('UPDATE lancamentos SET valor_centavos = 1')).rowCount,
      (await d.query('DELETE FROM pagamentos_mes')).rowCount,
    ]);
    expect(afetadas).toEqual([0, 0]);
  });
});

// Item (c) invertido pela T9 (`1792845300000_financeiro-rls.sql`): o SEC-003 deixou de valer. Mesmos atores e mesmas
// consultas; a asserção passa de "lê/insere" para "zero linhas/recusado", tão estrita quanto antes.
describe('rede do financeiro: SEC-003 fechado pela T9 (c)', () => {
  it('FIN-38 (depois da T9): o slug de G vê zero linhas de G nas 3 tabelas', async () => {
    expect(await linhasDeG({ slug: aberto.cenario.slugG })).toEqual([0, 0, 0]);
  });

  it('FIN-39 (depois da T9): O, sem acesso ao financeiro, vê zero linhas de G', async () => {
    expect(await linhasDeG({ conta: aberto.cenario.contaO })).toEqual([0, 0, 0]);
  });

  it('FIN-39 (depois da T9): O, sem acesso ao financeiro, não insere lançamento em G', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaO, (d) => inserirLancamento(d, cenario.grupoG, cenario.contaO)),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('FIN-39: C, com acesso, lê as linhas de G (controle; fica verde)', async () => {
    const linhas = await linhasDeG({ conta: aberto.cenario.contaC });
    expect(linhas.every((n) => n > 0)).toBe(true);
  });
});

describe('rede do financeiro: acessa_financeiro da própria conta (d)', () => {
  it('FIN-41 (antes; T10 inverte): O muda a própria acessa_financeiro para verdadeiro', async () => {
    const { db, cenario } = aberto;
    const r = await comoConta(db, cenario.contaO, (d) =>
      d.query('UPDATE vinculos_admin SET acessa_financeiro = true WHERE conta_id = $1 AND grupo_id = $2', [
        cenario.contaO,
        cenario.grupoG,
      ]),
    );
    expect(r.rowCount).toBe(1);
  });
});

describe('rede do financeiro: jogador com pagamento e lista de admins (e)', () => {
  it('FIN-37: excluir jogador com pagamento dá 23503 (GEL-85)', async () => {
    const { db, cenario } = aberto;
    await expect(
      comoConta(db, cenario.contaC, async (d) => {
        const j = await d.query<{ id: string }>(
          `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
           VALUES ($1, 'Pagante', 'meia', $2, now(), $2, now()) RETURNING id`,
          [cenario.grupoG, cenario.contaC],
        );
        const jogador = j.rows[0]?.id;
        await d.query(
          `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
           VALUES ($1, $2, '2026-03', NULL, $3, now())`,
          [cenario.grupoG, jogador, cenario.contaC],
        );
        await d.query('DELETE FROM jogadores WHERE id = $1', [jogador]);
      }),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('FIN-35: admins_listar devolve acessa_financeiro de cada admin', async () => {
    const { db, cenario } = aberto;
    const admins = await comoConta(db, cenario.contaC, async (d) => {
      const r = await d.query<{ id: string; acessa_financeiro: boolean }>(
        'SELECT id, acessa_financeiro FROM admins_listar($1)',
        [cenario.grupoG],
      );
      return Object.fromEntries(r.rows.map((l) => [l.id, l.acessa_financeiro]));
    });
    expect(admins).toEqual({ [cenario.contaC]: true, [cenario.contaO]: false });
  });
});

describe('rede do financeiro: grupo arquivado (f)', () => {
  it('FIN-37: com G arquivado, a não criadora vê zero linhas nas 3 tabelas e a criadora continua vendo', async () => {
    const { db, cenario } = aberto;
    await arquivar(db, cenario.grupoG);
    try {
      expect(await linhasDeG({ conta: cenario.contaO })).toEqual([0, 0, 0]);
      const daCriadora = await linhasDeG({ conta: cenario.contaC });
      expect(daCriadora.every((n) => n > 0)).toBe(true);
    } finally {
      await reativar(db, cenario.grupoG);
    }
  });
});
