import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// conta_trocar_senha e conta_excluir como pelada_app, com a conta da sessão em app.conta_id (ACE-26 a ACE-30, ACE-69).
const SENHA = 'senha-certa-1';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

let sequencia = 0;
const novoHash = () => randomBytes(32);

interface ContaDeTeste {
  id: string;
  email: string;
  nome: string;
  atual: Buffer;
  outra: Buffer;
}

/** Conta confirmada com duas sessões abertas pelo login (a "atual" e a de outro aparelho). */
async function novaConta(): Promise<ContaDeTeste> {
  const n = ++sequencia;
  const email = `conta${n}@exemplo.com`;
  const nome = `Pessoa ${n}`;
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, $2, $3, '2026-10-26', $4)",
      [email, nome, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  const atual = novoHash();
  const outra = novoHash();
  for (const token of [atual, outra]) expect(await entrar(email, SENHA, token)).toBe('ok');
  return { id, email, nome, atual, outra };
}

const entrar = (email: string, senha: string, token = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ resultado: string }>('SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
      email,
      senha,
      novoHash(),
      token,
    ]);
    return rows[0]?.resultado;
  });

const tocar = (token: Buffer) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ r: string | null }>('SELECT sessao_tocar($1) AS r', [token]);
    return rows[0]?.r ?? null;
  });

const trocarSenha = (c: ContaDeTeste, atual: string, nova: string) =>
  comoApp(cliente, { conta: c.id }, async () => {
    const { rows } = await cliente.query<{ r: boolean }>('SELECT conta_trocar_senha($1, $2, $3) AS r', [
      atual,
      nova,
      c.atual,
    ]);
    return rows[0]?.r;
  });

const excluir = (c: ContaDeTeste, senha: string) =>
  comoApp(cliente, { conta: c.id }, async () => {
    const { rows } = await cliente.query<{ resultado: string; grupos: unknown }>('SELECT * FROM conta_excluir($1)', [
      senha,
    ]);
    return rows[0];
  });

const tokensDasSessoes = async (contaId: string) =>
  (await cliente.query<{ t: Buffer }>('SELECT token_hash AS t FROM sessoes WHERE conta_id = $1', [contaId])).rows.map(
    (r) => r.t,
  );

/** Grupo criado como owner, com vínculo de cada conta da lista. */
async function grupo(nome: string, admins: string[], arquivado = false): Promise<string> {
  const slug = `g-${++sequencia}`;
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
     VALUES ($1, $2, 'quarta', 'semanal', '20:00', $3, now(), CASE WHEN $4 THEN now() END) RETURNING id`,
    [nome, slug, admins[0], arquivado],
  );
  const id = rows[0]?.id as string;
  for (const conta of admins) {
    await cliente.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
      [conta, id],
    );
  }
  return id;
}

/** Tudo o que a conta tem no banco, para provar que nada mudou. */
async function retrato(c: ContaDeTeste) {
  const um = async (sql: string) => (await cliente.query(sql, [c.id])).rows;
  return {
    conta: await um('SELECT md5(t::text) AS h FROM contas t WHERE id = $1'),
    sessoes: await um('SELECT md5(t::text) AS h FROM sessoes t WHERE conta_id = $1 ORDER BY 1'),
    vinculos: await um('SELECT md5(t::text) AS h FROM vinculos_admin t WHERE conta_id = $1 ORDER BY 1'),
    links: await um('SELECT md5(t::text) AS h FROM links_conta t WHERE conta_id = $1 ORDER BY 1'),
  };
}

describe('conta_trocar_senha (ACE-26, ACE-27)', () => {
  it('com a senha atual certa, troca a senha, apaga as outras sessões e mantém a atual', async () => {
    const c = await novaConta();

    expect(await trocarSenha(c, SENHA, 'senha-nova-2')).toBe(true);

    expect(await tokensDasSessoes(c.id)).toEqual([c.atual]);
    expect(await tocar(c.atual)).toBe(c.id);
    expect(await tocar(c.outra)).toBeNull();
    expect(await entrar(c.email, 'senha-nova-2')).toBe('ok');
    expect(await entrar(c.email, SENHA)).toBe('invalida');
  });

  it('com a senha atual errada, não troca nada e as sessões continuam', async () => {
    const c = await novaConta();
    const antes = await retrato(c);

    expect(await trocarSenha(c, 'senha-errada', 'senha-nova-2')).toBe(false);

    expect(await retrato(c)).toEqual(antes);
    expect(await entrar(c.email, SENHA)).toBe('ok');
  });
});

describe('conta_excluir (ACE-28 a ACE-30, ACE-69)', () => {
  it('sem ser única admin: apaga sessões, vínculos e links, anonimiza a conta e a auditoria mostra "Conta excluída"', async () => {
    const c = await novaConta();
    const colega = await novaConta();
    const compartilhado = await grupo('Grupo com dois admins', [colega.id, c.id]);
    const arquivado = await grupo('Grupo arquivado', [c.id], true);
    await comoApp(cliente, {}, () =>
      cliente.query("SELECT * FROM link_pedir($1, 'recuperacao', $2)", [c.email, novoHash()]),
    );
    await cliente.query(
      `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
       VALUES ($1, $2, $3, $4, now(), now() + interval '7 days')`,
      [compartilhado, c.email, novoHash(), colega.id],
    );
    const { rows: aud } = await cliente.query<{ id: string }>(
      `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, grupo_id, momento)
       VALUES ('conta', $1, 'criar', 'grupo', $2, now()) RETURNING id`,
      [c.id, compartilhado],
    );

    expect(await excluir(c, SENHA)).toEqual({ resultado: 'ok', grupos: [] });

    expect(await tokensDasSessoes(c.id)).toEqual([]);
    const contar = async (sql: string, params: unknown[]) =>
      Number((await cliente.query<{ n: string }>(sql, params)).rows[0]?.n);
    expect(await contar('SELECT count(*) AS n FROM vinculos_admin WHERE conta_id = $1', [c.id])).toBe(0);
    expect(await contar('SELECT count(*) AS n FROM links_conta WHERE conta_id = $1', [c.id])).toBe(0);
    expect(await contar('SELECT count(*) AS n FROM vinculos_admin WHERE grupo_id = $1', [compartilhado])).toBe(1);

    const { rows } = await cliente.query(
      'SELECT email, nome, senha_hash, excluida_em IS NOT NULL AS excluida FROM contas WHERE id = $1',
      [c.id],
    );
    expect(rows).toEqual([
      { email: `excluida-${c.id}@invalido`, nome: 'Conta excluída', senha_hash: '!', excluida: true },
    ]);
    // Nenhum nome ou e-mail da pessoa fica no banco.
    const { rows: restos } = await cliente.query<{ n: string }>(
      `SELECT (SELECT count(*) FROM contas WHERE email = $1 OR nome = $2)
            + (SELECT count(*) FROM convites_admin WHERE email = $1)
            + (SELECT count(*) FROM tentativas_login WHERE email = $1)
            + (SELECT count(*) FROM envios_email WHERE destino_hash = digest($1, 'sha256')) AS n`,
      [c.email, c.nome],
    );
    expect(Number(restos[0]?.n)).toBe(0);
    const { rows: autor } = await cliente.query(
      'SELECT c.nome FROM auditoria a JOIN contas c ON c.id = a.autor_conta_id WHERE a.id = $1',
      [aud[0]?.id],
    );
    expect(autor).toEqual([{ nome: 'Conta excluída' }]);
    // A remoção dos vínculos fica na auditoria (ACE-42), uma linha por grupo.
    const { rows: remocoes } = await cliente.query(
      "SELECT grupo_id FROM auditoria WHERE acao = 'excluir_conta' AND autor_conta_id = $1 ORDER BY grupo_id",
      [c.id],
    );
    expect(remocoes).toEqual([compartilhado, arquivado].sort().map((g) => ({ grupo_id: g })));

    expect(await entrar(c.email, SENHA)).toBe('invalida');
    expect(await entrar(`excluida-${c.id}@invalido`, '!')).toBe('invalida');
  });

  it('depois da exclusão, a sessão antiga em outro aparelho não vale mais (ACE-69)', async () => {
    const c = await novaConta();
    expect((await excluir(c, SENHA))?.resultado).toBe('ok');
    expect(await tocar(c.outra)).toBeNull();
    expect(await tocar(c.atual)).toBeNull();
  });

  it('única admin de grupo não arquivado: unico_admin com a lista dos grupos, e nada muda', async () => {
    const c = await novaConta();
    const colega = await novaConta();
    const zebra = await grupo('Zebra FC', [c.id]);
    const alfa = await grupo('Alfa FC', [c.id]);
    await grupo('Compartilhado FC', [c.id, colega.id]);
    await grupo('Arquivado FC', [c.id], true);
    const antes = await retrato(c);

    expect(await excluir(c, SENHA)).toEqual({
      resultado: 'unico_admin',
      grupos: [
        { id: alfa, nome: 'Alfa FC' },
        { id: zebra, nome: 'Zebra FC' },
      ],
    });

    expect(await retrato(c)).toEqual(antes);
    expect(await entrar(c.email, SENHA)).toBe('ok');
  });

  it('senha errada: senha_incorreta e nada muda', async () => {
    const c = await novaConta();
    const antes = await retrato(c);

    expect(await excluir(c, 'senha-errada')).toEqual({ resultado: 'senha_incorreta', grupos: [] });

    expect(await retrato(c)).toEqual(antes);
    expect(await tocar(c.outra)).toBe(c.id);
  });
});

describe('conta_definir_senha (só o owner; script do dono e seed, ACE-61, ACE-64)', () => {
  const EMAIL_DONO = 'leandrosegheto17@gmail.com';
  const definir = (email: string, senha: string, dono: boolean) =>
    cliente.query<{ id: string }>('SELECT conta_definir_senha($1, $2, $3) AS id', [email, senha, dono]);

  it('pelada_app não executa', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query('SET LOCAL ROLE pelada_app');
      await expect(definir('qualquer@exemplo.com', 'senha-nova-1', false)).rejects.toMatchObject({ code: '42501' });
    } finally {
      await cliente.query('ROLLBACK');
    }
  });

  it('cria a conta do dono confirmada; a segunda execução troca a senha e encerra as sessões', async () => {
    const id = (await definir(EMAIL_DONO, 'senha-dono-1', true)).rows[0]?.id as string;
    const { rows } = await cliente.query(
      'SELECT nome, e_dono, email_confirmado_em IS NOT NULL AS confirmada FROM contas WHERE id = $1',
      [id],
    );
    expect(rows).toEqual([{ nome: 'Dono', e_dono: true, confirmada: true }]);
    expect(await entrar(EMAIL_DONO, 'senha-dono-1')).toBe('ok');

    expect((await definir(EMAIL_DONO, 'senha-dono-2', true)).rows[0]?.id).toBe(id);
    expect(await tokensDasSessoes(id)).toEqual([]);
    expect(await entrar(EMAIL_DONO, 'senha-dono-2')).toBe('ok');
    expect(await entrar(EMAIL_DONO, 'senha-dono-1')).toBe('invalida');
  });

  it('sem dono, define a senha de conta existente e confirma o e-mail; conta inexistente é recusada', async () => {
    const c = await novaConta();
    await cliente.query('UPDATE contas SET email_confirmado_em = NULL WHERE id = $1', [c.id]);
    expect((await definir(c.email, 'senha-seed-1', false)).rows[0]?.id).toBe(c.id);
    expect(await entrar(c.email, 'senha-seed-1')).toBe('ok');
    const { rows } = await cliente.query<{ e_dono: boolean }>('SELECT e_dono FROM contas WHERE id = $1', [c.id]);
    expect(rows).toEqual([{ e_dono: false }]);

    await expect(definir('ninguem-aqui@exemplo.com', 'senha-seed-1', false)).rejects.toMatchObject({ code: 'P0002' });
  });
});
