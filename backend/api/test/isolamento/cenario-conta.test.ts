import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';
import { comoApp } from './apoio.ts';
import {
  abrirCenarioConta,
  comCenarioConta,
  IP_HASH_1,
  novoToken,
  type CenarioContaAberto,
} from './cenario-conta.ts';

/**
 * Cenário de conta (T0; ACE-43, ACE-45). Caracteriza o estado de partida: com as 23
 * migrações, as contas com senha definida por `conta_definir_senha` entram por `conta_entrar`
 * e cada uma enxerga só o próprio grupo.
 */

const URL_BASE = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;

async function bancosDeTeste(): Promise<string[]> {
  return comCliente(URL_BASE, async (c) => {
    const r = await c.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'teste\\_%'`,
    );
    return r.rows.map((l) => l.datname).sort();
  });
}

async function entrar(
  db: pg.Client,
  email: string,
  senha: string,
): Promise<{ resultado: string; conta_id: string | null }> {
  return comoApp(db, {}, async (d) => {
    const r = await d.query<{ resultado: string; conta_id: string | null }>(
      'SELECT resultado, conta_id FROM conta_entrar($1, $2, $3, $4)',
      [email, senha, IP_HASH_1, novoToken().hash],
    );
    const linha = r.rows[0];
    if (!linha) throw new Error('conta_entrar sem linha');
    return linha;
  });
}

describe('cenário de conta', () => {
  let aberto: CenarioContaAberto;

  beforeAll(async () => {
    aberto = await abrirCenarioConta();
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  it('ACE-43: a conta A entra com a senha do cenário e enxerga só o grupo A', async () => {
    const { db, cenario } = aberto;
    expect(await entrar(db, cenario.emailA, cenario.senhaA)).toEqual({
      resultado: 'ok',
      conta_id: cenario.contaA,
    });
    const grupos = await comoApp(db, { conta: cenario.contaA }, (d) =>
      d.query<{ id: string }>('SELECT id FROM grupos'),
    );
    expect(grupos.rows.map((l) => l.id)).toEqual([cenario.grupoA]);
  });

  it('ACE-43: a conta B entra com a senha do cenário e enxerga só o grupo B', async () => {
    const { db, cenario } = aberto;
    expect(await entrar(db, cenario.emailB, cenario.senhaB)).toEqual({
      resultado: 'ok',
      conta_id: cenario.contaB,
    });
    const grupos = await comoApp(db, { conta: cenario.contaB }, (d) =>
      d.query<{ id: string }>('SELECT id FROM grupos'),
    );
    expect(grupos.rows.map((l) => l.id)).toEqual([cenario.grupoB]);
  });

  it('ACE-43: a senha de B não abre a conta A', async () => {
    const { db, cenario } = aberto;
    expect(await entrar(db, cenario.emailA, cenario.senhaB)).toEqual({
      resultado: 'invalida',
      conta_id: null,
    });
  });

  it('ACE-43: a conta não confirmada, com a senha certa, não entra', async () => {
    const { db, cenario } = aberto;
    expect(await entrar(db, cenario.emailNaoConfirmada, cenario.senhaNaoConfirmada)).toEqual({
      resultado: 'nao_confirmado',
      conta_id: null,
    });
  });

  it('ACE-43: o banco guarda só o hash bcrypt, nunca a senha em claro', async () => {
    const { db, cenario } = aberto;
    const r = await db.query<{ senha_hash: string }>(
      'SELECT senha_hash FROM contas WHERE id = $1',
      [cenario.contaA],
    );
    expect(r.rows[0]?.senha_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(r.rows[0]?.senha_hash).not.toContain(cenario.senhaA);
  });
});

describe('limpeza do cenário de conta', () => {
  it('ACE-45: o banco é removido no finally quando o corpo lança erro', async () => {
    let nome = '';
    await expect(
      comCenarioConta(async (_db, _cenario, banco) => {
        nome = banco.nome;
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');
    expect(nome).toMatch(/^teste_/);
    expect(await bancosDeTeste()).not.toContain(nome);
  });

  it('ACE-45: o banco é removido quando a criação do cenário de conta falha', async () => {
    const antes = await bancosDeTeste();
    // E-mail em maiúsculas viola o CHECK de contas.email: a criação falha depois do banco criado.
    await expect(
      comCenarioConta(async () => 'não deveria rodar', {
        emailNaoConfirmada: 'MAIUSCULA@exemplo.test',
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(await bancosDeTeste()).toEqual(antes);
  });

  it('ACE-45: abrirCenarioConta que falha na criação não deixa banco órfão', async () => {
    const antes = await bancosDeTeste();
    await expect(
      abrirCenarioConta({ emailNaoConfirmada: 'MAIUSCULA@exemplo.test' }),
    ).rejects.toMatchObject({
      code: '23514',
    });
    expect(await bancosDeTeste()).toEqual(antes);
  });
});
