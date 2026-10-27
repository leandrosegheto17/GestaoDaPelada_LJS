import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aplicarMigracoes } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { comCliente, criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';

// Premissa da spec ("Contas que já existem"): toda conta existente na migration fica com o e-mail confirmado.
const ANTES_DA_CONTA = ['1792843200000_linha-de-base', '1792843260000_roles', '1792843320000_rls'];

let banco: BancoTemporario;

beforeAll(async () => {
  banco = await criarBancoTemporario();
});

afterAll(async () => {
  await banco?.remover();
});

describe('migration das tabelas de conta', () => {
  it('uma conta existente antes da migration fica com email_confirmado_em = criada_em', async () => {
    expect(await aplicarMigracoes({ url: banco.url, quantas: ANTES_DA_CONTA.length })).toEqual(ANTES_DA_CONTA);
    await comCliente(banco.url, (c) =>
      c.query(
        `INSERT INTO contas (email, nome, senha_hash, criada_em)
         VALUES ('antiga@exemplo.com', 'Antiga', 'x', '2026-03-04T05:06:07Z')`,
      ),
    );

    expect(await aplicarMigracoes({ url: banco.url, quantas: 1 })).toEqual(['1792843380000_conta-tabelas']);

    const linhas = await comCliente(banco.url, async (c) => {
      const { rows } = await c.query<{ confirmado: Date; criada: Date }>(
        "SELECT email_confirmado_em AS confirmado, criada_em AS criada FROM contas WHERE email = 'antiga@exemplo.com'",
      );
      return rows;
    });
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.confirmado.toISOString()).toBe('2026-03-04T05:06:07.000Z');
    expect(linhas[0]?.confirmado.toISOString()).toBe(linhas[0]?.criada.toISOString());
  });
});
