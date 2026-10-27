import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contas from '../../src/infraestrutura/db/repositorios/contas.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de contas sobre as funções do banco, como pelada_app (design C2; ACE-43, AD-008). Cada função: o caminho
// feliz e um de erro.
const SENHA = 'senha-certa-1';
const IP = randomBytes(32);

let b: BancoDeRepositorio;
let sequencia = 0;
const hash = () => randomBytes(32);

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const semConta = <T>(acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, {}, acao);
const comoConta = <T>(conta: string, acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, { conta }, acao);

/** Conta cadastrada pelo repositório e confirmada como owner. */
async function contaConfirmada(): Promise<{ id: string; email: string }> {
  const email = `repo${++sequencia}@exemplo.com`;
  const r = await semConta((db) =>
    contas.cadastrar(db, { email, nome: 'Pessoa Repo', senha: SENHA, termosVersao: '2026-10-27', tokenHash: hash() }),
  );
  await b.owner.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [r.contaId]);
  return { id: r.contaId, email };
}

/** Sessão aberta pelo repositório; devolve o hash do token. */
async function sessaoDe(email: string): Promise<Buffer> {
  const token = hash();
  const r = await semConta((db) => contas.entrar(db, { email, senha: SENHA, ipHash: IP, tokenHash: token }));
  expect(r.resultado).toBe('ok');
  return token;
}

async function grupoCom(contaIds: string[], nome: string): Promise<string> {
  const slug = `g-${randomBytes(4).toString('hex')}`;
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'quarta', 'semanal', '20:00', $3, now()) RETURNING id`,
    [nome, slug, contaIds[0]],
  );
  const grupo = rows[0]?.id as string;
  for (const conta of contaIds) {
    await b.owner.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, $3, $1, now())',
      [conta, grupo, conta === contaIds[0]],
    );
  }
  return grupo;
}

describe('contas.cadastrar', () => {
  it('e-mail novo: cria a conta não confirmada com os termos e pede o envio (ACE-01)', async () => {
    const email = `novo${++sequencia}@exemplo.com`;
    const r = await semConta((db) =>
      contas.cadastrar(db, { email, nome: 'Nova Pessoa', senha: SENHA, termosVersao: '2026-10-27', tokenHash: hash() }),
    );
    expect(r).toEqual({ situacao: 'nova', contaId: expect.any(String), enviar: true });
    const { rows } = await b.owner.query(
      'SELECT email, nome, termos_versao, email_confirmado_em FROM contas WHERE id = $1',
      [r.contaId],
    );
    expect(rows[0]).toEqual({
      email,
      nome: 'Nova Pessoa',
      termos_versao: '2026-10-27',
      email_confirmado_em: null,
    });
  });

  it('e-mail existente: devolve "existente" com a conta e não altera nada (ACE-04)', async () => {
    const { id, email } = await contaConfirmada();
    const antes = await b.owner.query('SELECT * FROM contas WHERE id = $1', [id]);
    const r = await semConta((db) =>
      contas.cadastrar(db, { email, nome: 'Outro Nome', senha: 'outra-senha-1', termosVersao: 'x', tokenHash: hash() }),
    );
    expect(r.situacao).toBe('existente');
    expect(r.contaId).toBe(id);
    expect((await b.owner.query('SELECT * FROM contas WHERE id = $1', [id])).rows).toEqual(antes.rows);
  });
});

describe('contas.entrar', () => {
  it('senha certa de conta confirmada: "ok", nome, e a sessão gravada só com o hash (ACE-09, ACE-10)', async () => {
    const { id, email } = await contaConfirmada();
    const token = hash();
    const r = await semConta((db) => contas.entrar(db, { email, senha: SENHA, ipHash: IP, tokenHash: token }));
    expect(r).toEqual({ resultado: 'ok', contaId: id, nome: 'Pessoa Repo', bloqueadoAte: null });
    const { rows } = await b.owner.query<{ conta_id: string }>('SELECT conta_id FROM sessoes WHERE token_hash = $1', [
      token,
    ]);
    expect(rows).toEqual([{ conta_id: id }]);
  });

  it('senha errada: "invalida", sem conta e sem sessão (ACE-11)', async () => {
    const { id, email } = await contaConfirmada();
    const r = await semConta((db) =>
      contas.entrar(db, { email, senha: 'senha-errada-1', ipHash: randomBytes(32), tokenHash: hash() }),
    );
    expect(r).toEqual({ resultado: 'invalida', contaId: null, nome: null, bloqueadoAte: null });
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
  });

  it('5 falhas do par: "bloqueado" com o momento do fim do bloqueio como Date (ACE-13)', async () => {
    const { email } = await contaConfirmada();
    const ip = randomBytes(32);
    for (let i = 0; i < 5; i++) {
      await semConta((db) => contas.entrar(db, { email, senha: 'senha-errada-1', ipHash: ip, tokenHash: hash() }));
    }
    const r = await semConta((db) => contas.entrar(db, { email, senha: SENHA, ipHash: ip, tokenHash: hash() }));
    expect(r.resultado).toBe('bloqueado');
    expect(r.bloqueadoAte).toBeInstanceOf(Date);
    const { rows } = await b.owner.query<{ fim: Date }>(
      "SELECT max(momento) + interval '15 minutes' AS fim FROM tentativas_login WHERE email = $1 AND ip_hash = $2",
      [email, ip],
    );
    expect(r.bloqueadoAte).toEqual(rows[0]?.fim);
  });
});

describe('contas.eu', () => {
  it('com conta: id, nome, e-mail e os grupos com vínculo (id, nome, slug, acessaFinanceiro) (ACE-18)', async () => {
    const a = await contaConfirmada();
    const outra = await contaConfirmada();
    const grupoDono = await grupoCom([a.id], 'Grupo do A');
    const grupoOutro = await grupoCom([outra.id, a.id], 'Grupo do Outro');
    await grupoCom([outra.id], 'Grupo sem A');
    const slugs = await b.owner.query<{ id: string; slug: string }>('SELECT id, slug FROM grupos WHERE id = ANY($1)', [
      [grupoDono, grupoOutro],
    ]);
    const slug = (id: string) => slugs.rows.find((r) => r.id === id)?.slug;

    const eu = await comoConta(a.id, (db) => contas.eu(db));
    expect(eu).toEqual({
      id: a.id,
      nome: 'Pessoa Repo',
      email: a.email,
      grupos: [
        { id: grupoDono, nome: 'Grupo do A', slug: slug(grupoDono), acessaFinanceiro: true },
        { id: grupoOutro, nome: 'Grupo do Outro', slug: slug(grupoOutro), acessaFinanceiro: false },
      ],
    });
  });

  it('sem conta na requisição: nulo', async () => {
    expect(await semConta((db) => contas.eu(db))).toBeNull();
  });
});

describe('contas.trocarSenha', () => {
  it('senha atual certa: true, mantém a sessão atual e apaga as outras (ACE-26)', async () => {
    const { id, email } = await contaConfirmada();
    const atual = await sessaoDe(email);
    await sessaoDe(email);
    const r = await comoConta(id, (db) =>
      contas.trocarSenha(db, { senhaAtual: SENHA, senhaNova: 'senha-nova-123', tokenSessaoHash: atual }),
    );
    expect(r).toBe(true);
    const { rows } = await b.owner.query<{ token_hash: Buffer }>('SELECT token_hash FROM sessoes WHERE conta_id = $1', [
      id,
    ]);
    expect(rows.map((s) => s.token_hash.toString('hex'))).toEqual([atual.toString('hex')]);
    const entrou = await semConta((db) =>
      contas.entrar(db, { email, senha: 'senha-nova-123', ipHash: randomBytes(32), tokenHash: hash() }),
    );
    expect(entrou.resultado).toBe('ok');
  });

  it('senha atual errada: false, a senha não muda e as sessões ficam (ACE-27)', async () => {
    const { id, email } = await contaConfirmada();
    const atual = await sessaoDe(email);
    await sessaoDe(email);
    const r = await comoConta(id, (db) =>
      contas.trocarSenha(db, { senhaAtual: 'senha-errada-1', senhaNova: 'senha-nova-123', tokenSessaoHash: atual }),
    );
    expect(r).toBe(false);
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(2);
    const entrou = await semConta((db) =>
      contas.entrar(db, { email, senha: SENHA, ipHash: randomBytes(32), tokenHash: hash() }),
    );
    expect(entrou.resultado).toBe('ok');
  });
});

describe('contas.excluir', () => {
  it('senha certa, sem ser único admin: "ok" e a conta fica anonimizada (ACE-28)', async () => {
    const { id, email } = await contaConfirmada();
    await sessaoDe(email);
    const r = await comoConta(id, (db) => contas.excluir(db, SENHA));
    expect(r).toEqual({ resultado: 'ok', grupos: [] });
    const { rows } = await b.owner.query(
      'SELECT email, nome, excluida_em IS NOT NULL AS excluida FROM contas WHERE id = $1',
      [id],
    );
    expect(rows[0]).toEqual({ email: `excluida-${id}@invalido`, nome: 'Conta excluída', excluida: true });
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
  });

  it('senha errada: "senha_incorreta" e nada muda (ACE-30)', async () => {
    const { id } = await contaConfirmada();
    const r = await comoConta(id, (db) => contas.excluir(db, 'senha-errada-1'));
    expect(r).toEqual({ resultado: 'senha_incorreta', grupos: [] });
    expect((await b.owner.query('SELECT excluida_em FROM contas WHERE id = $1', [id])).rows[0]).toEqual({
      excluida_em: null,
    });
  });

  it('única admin de um grupo não arquivado: "unico_admin" com os grupos (id e nome) (ACE-29)', async () => {
    const { id } = await contaConfirmada();
    const grupo = await grupoCom([id], 'Grupo Solitário');
    const r = await comoConta(id, (db) => contas.excluir(db, SENHA));
    expect(r).toEqual({ resultado: 'unico_admin', grupos: [{ id: grupo, nome: 'Grupo Solitário' }] });
  });
});
