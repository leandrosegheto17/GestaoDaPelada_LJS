import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Funções de convite como pelada_app, uma transação por chamada (ACE-31 a ACE-36, ACE-42, ACE-67).
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
const novoEmail = () => `convite${++sequencia}@exemplo.com`;

/** Conta confirmada criada pelo cadastro. */
async function novaConta(email = novoEmail()): Promise<{ id: string; email: string }> {
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Convite', $2, '2026-10-26', $3)",
      [email, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { id, email };
}

/** Grupo com um admin, criado como owner. */
async function grupoDe(admin: string): Promise<string> {
  const { rows } = await cliente.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ('Pelada ' || $2, 'pelada-' || $2, 'quarta', 'semanal', '20:00', $1, now()) RETURNING id`,
    [admin, String(++sequencia)],
  );
  const id = rows[0]?.id as string;
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [admin, id],
  );
  return id;
}

interface Criado {
  resultado: string;
  convite_id: string | null;
  expira_em: Date | null;
  enviar: boolean;
}

const criar = (conta: string, grupo: string, email: string, token = novoHash()) =>
  comoApp(cliente, { conta }, async () => {
    const { rows } = await cliente.query<Criado>('SELECT * FROM convite_criar($1, $2, $3)', [grupo, email, token]);
    return rows[0] as Criado;
  });

const ler = (token: Buffer) =>
  comoApp(cliente, {}, async () => (await cliente.query('SELECT * FROM convite_ler($1)', [token])).rows);

const aceitar = (conta: string, token: Buffer, c: pg.ClientBase = cliente) =>
  comoApp(c, { conta }, async () => {
    const { rows } = await c.query<{ resultado: string; grupo_id: string | null }>(
      'SELECT * FROM convite_aceitar($1)',
      [token],
    );
    return rows[0];
  });

const cadastrarPeloConvite = (token: Buffer, sessao = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ resultado: string; conta_id: string | null; grupo_id: string | null }>(
      "SELECT * FROM convite_cadastrar($1, 'Pessoa Convidada', $2, '2026-10-26', $3)",
      [token, SENHA, sessao],
    );
    return rows[0];
  });

const vinculos = async (grupo: string) =>
  (
    await cliente.query<{ conta_id: string; acessa_financeiro: boolean }>(
      'SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY criado_em, conta_id',
      [grupo],
    )
  ).rows;

const convite = async (id: string) =>
  (
    await cliente.query<{ email: string; dias: number; usado: boolean; cancelado: boolean }>(
      `SELECT email, (extract(epoch FROM expira_em - criado_em) / 86400)::float8 AS dias,
              usado_em IS NOT NULL AS usado, cancelado_em IS NOT NULL AS cancelado
         FROM convites_admin WHERE id = $1`,
      [id],
    )
  ).rows[0];

const auditoria = async (grupo: string) =>
  (
    await cliente.query<{ autor_conta_id: string; acao: string; entidade: string }>(
      'SELECT autor_conta_id, acao, entidade FROM auditoria WHERE grupo_id = $1 ORDER BY id',
      [grupo],
    )
  ).rows;

const passarSegundosDosEnvios = (email: string, segundos: number) =>
  cliente.query(
    "UPDATE envios_email SET enviado_em = enviado_em - make_interval(secs => $2::float8) WHERE destino_hash = digest($1, 'sha256')",
    [email, segundos],
  );

describe('convite_criar (ACE-31, ACE-32, ACE-42, ACE-51)', () => {
  it('admin do grupo cria o convite de 7 dias para o e-mail, com enviar e a auditoria', async () => {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);

    const r = await criar(admin.id, grupo, ' Novo.Admin@Exemplo.com ');

    expect(r).toEqual({ resultado: 'ok', convite_id: expect.any(String), expira_em: expect.any(Date), enviar: true });
    expect(await convite(r.convite_id as string)).toEqual({
      email: 'novo.admin@exemplo.com',
      dias: 7,
      usado: false,
      cancelado: false,
    });
    expect(await auditoria(grupo)).toEqual([
      { autor_conta_id: admin.id, acao: 'convidar_admin', entidade: 'convite_admin' },
    ]);
  });

  it('conta sem vínculo com o grupo: sem_vinculo e nenhum convite', async () => {
    const admin = await novaConta();
    const intrusa = await novaConta();
    const grupo = await grupoDe(admin.id);

    expect(await criar(intrusa.id, grupo, novoEmail())).toEqual({
      resultado: 'sem_vinculo',
      convite_id: null,
      expira_em: null,
      enviar: false,
    });
    const { rows } = await cliente.query('SELECT 1 FROM convites_admin WHERE grupo_id = $1', [grupo]);
    expect(rows).toEqual([]);
  });

  it('e-mail de quem já é admin do grupo: ja_e_admin e nenhum convite', async () => {
    const admin = await novaConta();
    const colega = await novaConta();
    const grupo = await grupoDe(admin.id);
    await cliente.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
      [colega.id, grupo],
    );

    expect((await criar(admin.id, grupo, colega.email.toUpperCase()))?.resultado).toBe('ja_e_admin');
    const { rows } = await cliente.query('SELECT 1 FROM convites_admin WHERE grupo_id = $1', [grupo]);
    expect(rows).toEqual([]);
  });

  it('o segundo convite em menos de 60 s devolve o mesmo, sem enviar; depois dos 60 s, troca o convite', async () => {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);
    const email = novoEmail();
    const primeiroToken = novoHash();
    const primeiro = await criar(admin.id, grupo, email, primeiroToken);

    const segundo = await criar(admin.id, grupo, email);
    expect(segundo).toEqual({ ...primeiro, enviar: false });
    expect(await ler(primeiroToken)).toHaveLength(1);

    await passarSegundosDosEnvios(email, 61);
    const terceiroToken = novoHash();
    const terceiro = await criar(admin.id, grupo, email, terceiroToken);
    expect(terceiro.enviar).toBe(true);
    expect(terceiro.convite_id).not.toBe(primeiro.convite_id);
    expect((await convite(primeiro.convite_id as string))?.cancelado).toBe(true);
    expect(await ler(primeiroToken)).toEqual([]);
    expect(await ler(terceiroToken)).toHaveLength(1);
  });
});

describe('convite_ler (ACE-34, ACE-36)', () => {
  it('convite válido: e-mail, nome do grupo e se a conta existe', async () => {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);
    const semConta = novoHash();
    const comConta = novoHash();
    const existente = await novaConta();
    await criar(admin.id, grupo, 'sem-conta@exemplo.com', semConta);
    await criar(admin.id, grupo, existente.email, comConta);
    const { rows } = await cliente.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [grupo]);

    expect(await ler(semConta)).toEqual([
      { email: 'sem-conta@exemplo.com', grupo_nome: rows[0]?.nome, conta_existe: false },
    ]);
    expect(await ler(comConta)).toEqual([{ email: existente.email, grupo_nome: rows[0]?.nome, conta_existe: true }]);
  });

  it('convite inexistente: nenhuma linha', async () => {
    expect(await ler(novoHash())).toEqual([]);
  });
});

describe('convite_aceitar (ACE-33, ACE-35, ACE-36)', () => {
  async function cenario() {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);
    const convidada = await novaConta();
    const token = novoHash();
    const { convite_id } = await criar(admin.id, grupo, convidada.email, token);
    return { admin, grupo, convidada, token, convite_id: convite_id as string };
  }

  it('com a conta do e-mail convidado: cria o vínculo sem financeiro, usa o convite e grava a auditoria', async () => {
    const { admin, grupo, convidada, token, convite_id } = await cenario();

    expect(await aceitar(convidada.id, token)).toEqual({ resultado: 'ok', grupo_id: grupo });

    expect(await vinculos(grupo)).toEqual([
      { conta_id: admin.id, acessa_financeiro: false },
      { conta_id: convidada.id, acessa_financeiro: false },
    ]);
    expect((await convite(convite_id))?.usado).toBe(true);
    expect((await auditoria(grupo)).at(-1)).toEqual({
      autor_conta_id: convidada.id,
      acao: 'aceitar_convite',
      entidade: 'vinculo_admin',
    });
    expect(await aceitar(convidada.id, token)).toEqual({ resultado: 'link_invalido', grupo_id: null });
  });

  it('conta de outro e-mail: convite_de_outro_email, sem vínculo, e o convite continua valendo', async () => {
    const { grupo, convidada, token, convite_id } = await cenario();
    const outra = await novaConta();

    expect(await aceitar(outra.id, token)).toEqual({ resultado: 'convite_de_outro_email', grupo_id: null });

    expect((await vinculos(grupo)).map((v) => v.conta_id)).not.toContain(outra.id);
    expect((await convite(convite_id))?.usado).toBe(false);
    expect((await aceitar(convidada.id, token))?.resultado).toBe('ok');
  });

  it('convite vencido, cancelado ou inexistente: link_invalido e nenhum vínculo', async () => {
    const vencido = await cenario();
    await cliente.query(
      "UPDATE convites_admin SET criado_em = criado_em - interval '7 days', expira_em = expira_em - interval '7 days' WHERE id = $1",
      [vencido.convite_id],
    );
    expect(await aceitar(vencido.convidada.id, vencido.token)).toEqual({ resultado: 'link_invalido', grupo_id: null });
    expect(await ler(vencido.token)).toEqual([]);

    const cancelado = await cenario();
    await cliente.query('UPDATE convites_admin SET cancelado_em = now() WHERE id = $1', [cancelado.convite_id]);
    expect((await aceitar(cancelado.convidada.id, cancelado.token))?.resultado).toBe('link_invalido');
    expect(await ler(cancelado.token)).toEqual([]);

    expect((await aceitar(vencido.convidada.id, novoHash()))?.resultado).toBe('link_invalido');
    for (const c of [vencido, cancelado]) expect(await vinculos(c.grupo)).toHaveLength(1);
  });

  it('convite a 1 min de vencer ainda vale', async () => {
    const { grupo, convidada, token, convite_id } = await cenario();
    await cliente.query(
      `UPDATE convites_admin SET criado_em = criado_em - interval '6 days 23 hours 59 minutes',
                                 expira_em = expira_em - interval '6 days 23 hours 59 minutes' WHERE id = $1`,
      [convite_id],
    );
    expect(await aceitar(convidada.id, token)).toEqual({ resultado: 'ok', grupo_id: grupo });
  });

  it('dois aceites simultâneos do mesmo convite criam um vínculo só; o segundo recebe link_invalido (ACE-67)', async () => {
    const { grupo, convidada, token } = await cenario();
    const conectar = async () => {
      const c = new pg.Client({ connectionString: banco.url });
      await c.connect();
      return c;
    };
    const c1 = await conectar();
    const c2 = await conectar();
    try {
      // O primeiro aceite fica com a transação aberta; o segundo precisa esperar a trava do convite.
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE pelada_app');
      await c1.query("SELECT set_config('app.conta_id', $1, true)", [convidada.id]);
      const primeiro = (await c1.query('SELECT * FROM convite_aceitar($1)', [token])).rows[0];
      const segundo = aceitar(convidada.id, token, c2);
      const resolvido = await Promise.race([
        segundo.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 300)),
      ]);
      expect(resolvido).toBe(false);
      await c1.query('COMMIT');

      expect(primeiro).toEqual({ resultado: 'ok', grupo_id: grupo });
      expect(await segundo).toEqual({ resultado: 'link_invalido', grupo_id: null });
      expect((await vinculos(grupo)).filter((v) => v.conta_id === convidada.id)).toHaveLength(1);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });
});

describe('convite_cadastrar (ACE-34, ACE-36)', () => {
  it('cria a conta já confirmada com o e-mail do convite, o vínculo, a sessão e a auditoria', async () => {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);
    const email = novoEmail();
    const token = novoHash();
    const { convite_id } = await criar(admin.id, grupo, email, token);
    const sessao = novoHash();

    const r = await cadastrarPeloConvite(token, sessao);

    expect(r).toEqual({ resultado: 'ok', conta_id: expect.any(String), grupo_id: grupo });
    const { rows } = await cliente.query(
      `SELECT email, nome, email_confirmado_em IS NOT NULL AS confirmada, termos_versao,
              termos_aceitos_em IS NOT NULL AS aceitou
         FROM contas WHERE id = $1`,
      [r?.conta_id],
    );
    expect(rows).toEqual([
      { email, nome: 'Pessoa Convidada', confirmada: true, termos_versao: '2026-10-26', aceitou: true },
    ]);
    expect(await vinculos(grupo)).toContainEqual({ conta_id: r?.conta_id, acessa_financeiro: false });
    const { rows: sessoes } = await cliente.query('SELECT token_hash FROM sessoes WHERE conta_id = $1', [r?.conta_id]);
    expect(sessoes).toEqual([{ token_hash: sessao }]);
    expect((await convite(convite_id as string))?.usado).toBe(true);
    expect((await auditoria(grupo)).at(-1)).toEqual({
      autor_conta_id: r?.conta_id,
      acao: 'aceitar_convite',
      entidade: 'vinculo_admin',
    });
    const entrou = await comoApp(
      cliente,
      {},
      async () =>
        (
          await cliente.query<{ resultado: string }>('SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
            email,
            SENHA,
            novoHash(),
            novoHash(),
          ])
        ).rows[0]?.resultado,
    );
    expect(entrou).toBe('ok');

    expect(await cadastrarPeloConvite(token)).toEqual({ resultado: 'link_invalido', conta_id: null, grupo_id: null });
  });

  it('e-mail do convite que já tem conta: conta_existente e nada muda', async () => {
    const admin = await novaConta();
    const grupo = await grupoDe(admin.id);
    const existente = await novaConta();
    const token = novoHash();
    const { convite_id } = await criar(admin.id, grupo, existente.email, token);

    expect(await cadastrarPeloConvite(token)).toEqual({ resultado: 'conta_existente', conta_id: null, grupo_id: null });
    expect((await convite(convite_id as string))?.usado).toBe(false);
    expect(await vinculos(grupo)).toHaveLength(1);
  });

  it('convite inexistente: link_invalido', async () => {
    expect(await cadastrarPeloConvite(novoHash())).toEqual({
      resultado: 'link_invalido',
      conta_id: null,
      grupo_id: null,
    });
  });
});
