import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as convites from '../../src/infraestrutura/db/repositorios/convites.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de convites (design C2; ACE-31 a ACE-38, ACE-42), como pelada_app.
let b: BancoDeRepositorio;
let sequencia = 0;
const hash = () => randomBytes(32);

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(conta: string, acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, { conta }, acao);
const semConta = <T>(acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, {}, acao);

async function conta(): Promise<{ id: string; email: string }> {
  const email = `convite${++sequencia}@exemplo.com`;
  const { rows } = await b.owner.query<{ id: string }>(
    "INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em) VALUES ($1, 'Pessoa Convite', '!', now(), now()) RETURNING id",
    [email],
  );
  return { id: rows[0]?.id as string, email };
}

async function grupoDe(contaId: string): Promise<string> {
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ('Grupo Convite', $1, 'quarta', 'semanal', '20:00', $2, now()) RETURNING id`,
    [`g-${randomBytes(4).toString('hex')}`, contaId],
  );
  const id = rows[0]?.id as string;
  await b.owner.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [contaId, id],
  );
  return id;
}

const auditoriaDe = async (grupoId: string) =>
  (
    await b.owner.query<{ acao: string; entidade_id: string }>(
      'SELECT acao, entidade_id FROM auditoria WHERE grupo_id = $1 ORDER BY id',
      [grupoId],
    )
  ).rows;

describe('convites.criar', () => {
  it('admin do grupo: "ok" com o id, a validade de 7 dias e enviar (ACE-31)', async () => {
    const ana = await conta();
    const g = await grupoDe(ana.id);
    const r = await como(ana.id, (db) => convites.criar(db, g, 'Nova@Exemplo.com ', hash()));
    expect(r).toEqual({ resultado: 'ok', conviteId: expect.any(String), expiraEm: expect.any(Date), enviar: true });
    const { rows } = await b.owner.query(
      "SELECT grupo_id, email, criado_por, expira_em = criado_em + interval '7 days' AS sete_dias FROM convites_admin WHERE id = $1",
      [r.conviteId],
    );
    expect(rows).toEqual([{ grupo_id: g, email: 'nova@exemplo.com', criado_por: ana.id, sete_dias: true }]);
  });

  it('e-mail que já é admin do grupo: "ja_e_admin" e nenhum convite (ACE-32)', async () => {
    const ana = await conta();
    const g = await grupoDe(ana.id);
    const r = await como(ana.id, (db) => convites.criar(db, g, ana.email, hash()));
    expect(r).toEqual({ resultado: 'ja_e_admin', conviteId: null, expiraEm: null, enviar: false });
    expect((await b.owner.query('SELECT 1 FROM convites_admin WHERE grupo_id = $1', [g])).rowCount).toBe(0);
  });

  it('conta sem vínculo com o grupo: "sem_vinculo" e nenhum convite (ACE-41)', async () => {
    const ana = await conta();
    const intrusa = await conta();
    const g = await grupoDe(ana.id);
    const r = await como(intrusa.id, (db) => convites.criar(db, g, 'alvo@exemplo.com', hash()));
    expect(r.resultado).toBe('sem_vinculo');
    expect((await b.owner.query('SELECT 1 FROM convites_admin WHERE grupo_id = $1', [g])).rowCount).toBe(0);
  });
});

describe('convites.cancelar', () => {
  it('convite pendente: true, o link deixa de valer e a auditoria fica gravada (ACE-38, ACE-42)', async () => {
    const ana = await conta();
    const g = await grupoDe(ana.id);
    const token = hash();
    const { conviteId } = await como(ana.id, (db) => convites.criar(db, g, 'alvo@exemplo.com', token));
    expect(await como(ana.id, (db) => convites.cancelar(db, g, conviteId as string))).toBe(true);
    expect(await semConta((db) => convites.ler(db, token))).toBeNull();
    expect(await auditoriaDe(g)).toEqual([
      { acao: 'convidar_admin', entidade_id: conviteId },
      { acao: 'cancelar_convite', entidade_id: conviteId },
    ]);
  });

  it('já cancelado, de outro grupo ou inexistente: false e nada na auditoria', async () => {
    const ana = await conta();
    const g = await grupoDe(ana.id);
    const outro = await grupoDe(ana.id);
    const { conviteId } = await como(ana.id, (db) => convites.criar(db, g, 'alvo@exemplo.com', hash()));
    await como(ana.id, (db) => convites.cancelar(db, g, conviteId as string));
    expect(await como(ana.id, (db) => convites.cancelar(db, g, conviteId as string))).toBe(false);
    const { conviteId: deG } = await como(ana.id, (db) => convites.criar(db, g, 'outro@exemplo.com', hash()));
    expect(await como(ana.id, (db) => convites.cancelar(db, outro, deG as string))).toBe(false);
    expect(await como(ana.id, (db) => convites.cancelar(db, g, crypto.randomUUID()))).toBe(false);
    expect((await auditoriaDe(g)).filter((a) => a.acao === 'cancelar_convite')).toHaveLength(1);
    expect(await auditoriaDe(outro)).toEqual([]);
  });

  it('conta sem vínculo não cancela o convite de outro grupo (RLS)', async () => {
    const ana = await conta();
    const intrusa = await conta();
    const g = await grupoDe(ana.id);
    await grupoDe(intrusa.id);
    const token = hash();
    const { conviteId } = await como(ana.id, (db) => convites.criar(db, g, 'alvo@exemplo.com', token));
    expect(await como(intrusa.id, (db) => convites.cancelar(db, g, conviteId as string))).toBe(false);
    expect(await semConta((db) => convites.ler(db, token))).not.toBeNull();
  });
});

describe('convites.ler', () => {
  it('convite válido: e-mail, nome do grupo e se o e-mail tem conta (ACE-34)', async () => {
    const ana = await conta();
    const bia = await conta();
    const g = await grupoDe(ana.id);
    const paraNova = hash();
    const paraBia = hash();
    await como(ana.id, (db) => convites.criar(db, g, 'sem-conta@exemplo.com', paraNova));
    await como(ana.id, (db) => convites.criar(db, g, bia.email, paraBia));
    expect(await semConta((db) => convites.ler(db, paraNova))).toEqual({
      email: 'sem-conta@exemplo.com',
      grupoNome: 'Grupo Convite',
      contaExiste: false,
    });
    expect(await semConta((db) => convites.ler(db, paraBia))).toEqual({
      email: bia.email,
      grupoNome: 'Grupo Convite',
      contaExiste: true,
    });
  });

  it('token inexistente: nulo (ACE-36)', async () => {
    expect(await semConta((db) => convites.ler(db, hash()))).toBeNull();
  });
});

describe('convites.aceitar', () => {
  it('conta do e-mail convidado: "ok" com o grupo e o vínculo sem financeiro (ACE-33)', async () => {
    const ana = await conta();
    const bia = await conta();
    const g = await grupoDe(ana.id);
    const token = hash();
    await como(ana.id, (db) => convites.criar(db, g, bia.email, token));
    expect(await como(bia.id, (db) => convites.aceitar(db, token))).toEqual({ resultado: 'ok', grupoId: g });
    const { rows } = await b.owner.query(
      'SELECT acessa_financeiro FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
      [bia.id, g],
    );
    expect(rows).toEqual([{ acessa_financeiro: false }]);
  });

  it('conta de outro e-mail: "convite_de_outro_email" e nenhum vínculo (ACE-35)', async () => {
    const ana = await conta();
    const bia = await conta();
    const g = await grupoDe(ana.id);
    const token = hash();
    await como(ana.id, (db) => convites.criar(db, g, 'outra-pessoa@exemplo.com', token));
    expect(await como(bia.id, (db) => convites.aceitar(db, token))).toEqual({
      resultado: 'convite_de_outro_email',
      grupoId: null,
    });
    expect((await b.owner.query('SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [bia.id])).rowCount).toBe(0);
  });

  it('token inexistente: "link_invalido" (ACE-36)', async () => {
    const bia = await conta();
    expect(await como(bia.id, (db) => convites.aceitar(db, hash()))).toEqual({
      resultado: 'link_invalido',
      grupoId: null,
    });
  });
});

describe('convites.cadastrar', () => {
  it('convite válido para e-mail sem conta: "ok", conta confirmada, vínculo e sessão (ACE-34)', async () => {
    const ana = await conta();
    const g = await grupoDe(ana.id);
    const token = hash();
    const sessao = hash();
    await como(ana.id, (db) => convites.criar(db, g, 'recem@exemplo.com', token));
    const r = await semConta((db) =>
      convites.cadastrar(db, {
        tokenHash: token,
        nome: 'Recém Chegada',
        senha: 'senha-certa-1',
        termosVersao: '2026-10-27',
        tokenSessaoHash: sessao,
      }),
    );
    expect(r).toEqual({ resultado: 'ok', contaId: expect.any(String), grupoId: g });
    const contaCriada = await b.owner.query(
      'SELECT email, nome, email_confirmado_em IS NOT NULL AS confirmada FROM contas WHERE id = $1',
      [r.contaId],
    );
    expect(contaCriada.rows).toEqual([{ email: 'recem@exemplo.com', nome: 'Recém Chegada', confirmada: true }]);
    const s = await b.owner.query('SELECT conta_id FROM sessoes WHERE token_hash = $1', [sessao]);
    expect(s.rows).toEqual([{ conta_id: r.contaId }]);
  });

  it('convite inválido: "link_invalido" e nenhuma conta (ACE-36)', async () => {
    const r = await semConta((db) =>
      convites.cadastrar(db, {
        tokenHash: hash(),
        nome: 'Ninguém Aqui',
        senha: 'senha-certa-1',
        termosVersao: '2026-10-27',
        tokenSessaoHash: hash(),
      }),
    );
    expect(r).toEqual({ resultado: 'link_invalido', contaId: null, grupoId: null });
    expect((await b.owner.query("SELECT 1 FROM contas WHERE nome = 'Ninguém Aqui'")).rowCount).toBe(0);
  });
});
