import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * A criadora não é removida por outra admin (T32; SEC-001), pela rota `DELETE /api/grupos/:grupoId/admins/:contaId`
 * contra o cenário de grupos: C criou G, O é a outra admin. O `beforeEach` devolve os dois vínculos de G.
 */

let aberto: CenarioGruposAberto;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function adminsDeG(): Promise<string[]> {
  const r = await aberto.db.query<{ conta_id: string }>('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id', [
    aberto.cenario.grupoG,
  ]);
  return r.rows.map((l) => l.conta_id);
}

async function remocoes(): Promise<number> {
  const r = await aberto.db.query<{ n: string }>(
    `SELECT count(*) AS n FROM auditoria WHERE grupo_id = $1 AND acao = 'remover_admin'`,
    [aberto.cenario.grupoG],
  );
  return Number(r.rows[0]?.n ?? 0);
}

function remover(token: string, conta: string) {
  return cliente(aberto.url)(`/grupos/${aberto.cenario.grupoG}/admins/${conta}`, { metodo: 'DELETE', sessao: token });
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  const { db, cenario } = aberto;
  await reativar(db, cenario.grupoG);
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
     VALUES ($1, $3, true, $1, now()), ($2, $3, false, $1, now()) ON CONFLICT DO NOTHING`,
    [cenario.contaC, cenario.contaO, cenario.grupoG],
  );
});

describe('SEC-001: remover a criadora', () => {
  it('SEC-001: O removendo C dá 409 criadora_nao_removivel, C continua admin e nada é auditado', async () => {
    const { cenario } = aberto;
    const antes = await remocoes();
    const r = await remover(await sessao(cenario.contaO), cenario.contaC);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'criadora_nao_removivel' });
    expect(await adminsDeG()).toEqual([cenario.contaC, cenario.contaO].sort());
    expect(await remocoes()).toBe(antes);
  });

  it('SEC-001: C removendo O dá 204', async () => {
    const { cenario } = aberto;
    const r = await remover(await sessao(cenario.contaC), cenario.contaO);
    expect(r.status).toBe(204);
    expect(await adminsDeG()).toEqual([cenario.contaC]);
  });

  it('SEC-001: C saindo de si mesma, havendo outra admin, dá 204', async () => {
    const { cenario } = aberto;
    const r = await remover(await sessao(cenario.contaC), cenario.contaC);
    expect(r.status).toBe(204);
    expect(await adminsDeG()).toEqual([cenario.contaO]);
  });

  it('SEC-001: O saindo de si mesma dá 204 (a regra é só sobre a criadora)', async () => {
    const { cenario } = aberto;
    const r = await remover(await sessao(cenario.contaO), cenario.contaO);
    expect(r.status).toBe(204);
    expect(await adminsDeG()).toEqual([cenario.contaC]);
  });

  it('ACE-40: C, última admin, não sai de si mesma (ultimo_admin continua valendo)', async () => {
    const { cenario, db } = aberto;
    await db.query('DELETE FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2', [cenario.grupoG, cenario.contaO]);
    const r = await remover(await sessao(cenario.contaC), cenario.contaC);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'ultimo_admin' });
    expect(await adminsDeG()).toEqual([cenario.contaC]);
  });
});
