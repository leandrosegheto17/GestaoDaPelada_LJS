import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contas from '../../src/infraestrutura/db/repositorios/contas.ts';
import * as sessoes from '../../src/infraestrutura/db/repositorios/sessoes.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de sessões (design C2, AD-007; ACE-15, ACE-16, ACE-17, ACE-47). `tocar` abre e fecha a própria
// transação curta, antes da transação da rota.
const SENHA = 'senha-certa-1';

let b: BancoDeRepositorio;
let sequencia = 0;
const hash = () => randomBytes(32);

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

async function contaComSessao(): Promise<{ id: string; token: Buffer }> {
  const email = `sessao${++sequencia}@exemplo.com`;
  const { contaId } = await comDb(b.urlApp, {}, (db) =>
    contas.cadastrar(db, { email, nome: 'Pessoa Sessão', senha: SENHA, termosVersao: 'v', tokenHash: hash() }),
  );
  await b.owner.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [contaId]);
  const token = hash();
  await comDb(b.urlApp, {}, (db) => contas.entrar(db, { email, senha: SENHA, ipHash: hash(), tokenHash: token }));
  return { id: contaId, token };
}

/** Conexões de pelada_app abertas no banco temporário (vistas pelo owner). */
async function conexoesDoApp(): Promise<number> {
  const { rows } = await b.owner.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = $1 AND usename = 'pelada_app'",
    [b.banco.nome],
  );
  return rows[0]?.n ?? -1;
}

async function esperarSemConexoesDoApp(): Promise<number> {
  let n = await conexoesDoApp();
  for (let i = 0; i < 20 && n > 0; i++) {
    await new Promise((ok) => setTimeout(ok, 50));
    n = await conexoesDoApp();
  }
  return n;
}

describe('sessoes.tocar (transação curta própria, AD-007)', () => {
  it('sessão válida: devolve o conta_id, a renovação fica gravada (COMMIT) e a conexão é fechada', async () => {
    const { id, token } = await contaComSessao();
    await b.owner.query("UPDATE sessoes SET ultimo_uso_em = now() - interval '10 minutes' WHERE token_hash = $1", [
      token,
    ]);
    expect(await sessoes.tocar(b.urlApp, token)).toBe(id);
    const { rows } = await b.owner.query<{ recente: boolean }>(
      "SELECT ultimo_uso_em > now() - interval '1 minute' AS recente FROM sessoes WHERE token_hash = $1",
      [token],
    );
    expect(rows).toEqual([{ recente: true }]);
    expect(await esperarSemConexoesDoApp()).toBe(0);
  });

  it('token desconhecido: nulo', async () => {
    expect(await sessoes.tocar(b.urlApp, hash())).toBeNull();
    expect(await esperarSemConexoesDoApp()).toBe(0);
  });

  it('parada há 15 min: nulo e a sessão fica apagada (ACE-15)', async () => {
    const { token } = await contaComSessao();
    await b.owner.query("UPDATE sessoes SET ultimo_uso_em = now() - interval '15 minutes' WHERE token_hash = $1", [
      token,
    ]);
    expect(await sessoes.tocar(b.urlApp, token)).toBeNull();
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [token])).rowCount).toBe(0);
  });

  it('criada há 12 h, mesmo em uso: nulo e a sessão fica apagada (ACE-16)', async () => {
    const { token } = await contaComSessao();
    await b.owner.query('UPDATE sessoes SET expira_em = now() WHERE token_hash = $1', [token]);
    expect(await sessoes.tocar(b.urlApp, token)).toBeNull();
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [token])).rowCount).toBe(0);
  });

  it('banco inacessível: a falha sobe e nenhuma conexão fica aberta', async () => {
    const url = new URL(b.urlApp);
    url.password = 'senha-errada';
    await expect(sessoes.tocar(url.toString(), hash())).rejects.toThrow();
    expect(await esperarSemConexoesDoApp()).toBe(0);
  });
});

describe('sessoes.encerrarAtual', () => {
  it('apaga a sessão da conta da requisição e devolve true (ACE-17)', async () => {
    const { id, token } = await contaComSessao();
    const r = await comDb(b.urlApp, { conta: id }, (db) => sessoes.encerrarAtual(db, token));
    expect(r).toBe(true);
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [token])).rowCount).toBe(0);
  });

  it('sessão de outra conta: false e ela continua (RLS, ACE-44)', async () => {
    const a = await contaComSessao();
    const outra = await contaComSessao();
    const r = await comDb(b.urlApp, { conta: a.id }, (db) => sessoes.encerrarAtual(db, outra.token));
    expect(r).toBe(false);
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [outra.token])).rowCount).toBe(1);
  });
});
