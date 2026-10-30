import { randomBytes } from 'node:crypto';
import { readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Convite de grupo arquivado (T76; SEC-004): convite_ler, convite_aceitar e convite_cadastrar tratam o convite de um
// grupo arquivado como indisponível (nenhuma linha / link_invalido) e não criam vínculo nem conta. Reativado o grupo,
// o mesmo convite volta a valer (ele não é cancelado nem usado).

const MIGRACAO = '1792844460000_convites-grupo-arquivado.sql';
const SENHA = 'senha-certa-1';

let sequencia = 0;
const novoHash = () => randomBytes(32);
const novoEmail = () => `arquivado${++sequencia}-${randomBytes(3).toString('hex')}@exemplo.com`;

/** Funções de convite sobre um cliente já conectado ao banco (owner). */
function apoio(cliente: pg.Client) {
  async function novaConta(email = novoEmail()): Promise<{ id: string; email: string }> {
    const id = await comoApp(cliente, {}, async () => {
      const { rows } = await cliente.query<{ conta_id: string }>(
        "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Arquivado', $2, '2026-10-26', $3)",
        [email, SENHA, novoHash()],
      );
      return rows[0]?.conta_id as string;
    });
    await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
    return { id, email };
  }

  async function grupoDe(admin: string): Promise<string> {
    const { rows } = await cliente.query<{ id: string }>(
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ('Pelada ' || $2, 'arquivado-' || $2, 'quarta', 'semanal', '20:00', $1, now()) RETURNING id`,
      [admin, `${++sequencia}-${randomBytes(3).toString('hex')}`],
    );
    const id = rows[0]?.id as string;
    await cliente.query(
      'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
      [admin, id],
    );
    return id;
  }

  async function convidar(admin: string, grupo: string, email: string): Promise<{ token: Buffer; id: string }> {
    const token = novoHash();
    const id = await comoApp(cliente, { conta: admin }, async () => {
      const { rows } = await cliente.query<{ resultado: string; convite_id: string }>(
        'SELECT resultado, convite_id FROM convite_criar($1, $2, $3)',
        [grupo, email, token],
      );
      expect(rows[0]?.resultado).toBe('ok');
      return rows[0]?.convite_id as string;
    });
    return { token, id };
  }

  const arquivar = (grupo: string) => cliente.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [grupo]);
  const reativar = (grupo: string) => cliente.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [grupo]);

  const ler = (token: Buffer) =>
    comoApp(cliente, {}, async () => (await cliente.query('SELECT * FROM convite_ler($1)', [token])).rows);

  const aceitar = (conta: string, token: Buffer) =>
    comoApp(cliente, { conta }, async () => {
      const { rows } = await cliente.query<{ resultado: string; grupo_id: string | null }>(
        'SELECT * FROM convite_aceitar($1)',
        [token],
      );
      return rows[0];
    });

  const cadastrar = (token: Buffer) =>
    comoApp(cliente, {}, async () => {
      const { rows } = await cliente.query<{ resultado: string; conta_id: string | null; grupo_id: string | null }>(
        "SELECT * FROM convite_cadastrar($1, 'Pessoa Convidada', $2, '2026-10-26', $3)",
        [token, SENHA, novoHash()],
      );
      return rows[0];
    });

  const vinculos = async (grupo: string) =>
    (
      await cliente.query<{ conta_id: string }>(
        'SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1 ORDER BY criado_em, conta_id',
        [grupo],
      )
    ).rows.map((r) => r.conta_id);

  const situacao = async (id: string) =>
    (
      await cliente.query<{ usado: boolean; cancelado: boolean }>(
        'SELECT usado_em IS NOT NULL AS usado, cancelado_em IS NOT NULL AS cancelado FROM convites_admin WHERE id = $1',
        [id],
      )
    ).rows[0];

  const contaDoEmail = async (email: string) =>
    (await cliente.query('SELECT 1 FROM contas WHERE email = $1', [email])).rows.length;

  const auditoria = async (grupo: string) =>
    (
      await cliente.query<{ acao: string }>('SELECT acao FROM auditoria WHERE grupo_id = $1 ORDER BY id', [grupo])
    ).rows.map((r) => r.acao);

  return {
    novaConta,
    grupoDe,
    convidar,
    arquivar,
    reativar,
    ler,
    aceitar,
    cadastrar,
    vinculos,
    situacao,
    contaDoEmail,
    auditoria,
  };
}

describe('do zero: convite de grupo arquivado (SEC-004)', () => {
  let banco: BancoTemporario;
  let cliente: pg.Client;
  let a: ReturnType<typeof apoio>;

  beforeAll(async () => {
    banco = await criarBancoTemporario();
    await migrar(banco.url);
    cliente = new pg.Client({ connectionString: banco.url });
    await cliente.connect();
    a = apoio(cliente);
  });

  afterAll(async () => {
    await cliente?.end();
    await banco?.remover();
  });

  it('convite_ler não devolve o convite do grupo arquivado', async () => {
    const criadora = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const { token } = await a.convidar(criadora.id, grupo, novoEmail());
    await a.arquivar(grupo);

    expect(await a.ler(token)).toEqual([]);
  });

  it('convite_aceitar responde link_invalido, não cria vínculo, não usa o convite nem audita', async () => {
    const criadora = await a.novaConta();
    const convidada = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const { token, id } = await a.convidar(criadora.id, grupo, convidada.email);
    await a.arquivar(grupo);

    expect(await a.aceitar(convidada.id, token)).toEqual({ resultado: 'link_invalido', grupo_id: null });
    expect(await a.vinculos(grupo)).toEqual([criadora.id]);
    expect(await a.situacao(id)).toEqual({ usado: false, cancelado: false });
    expect(await a.auditoria(grupo)).not.toContain('aceitar_convite');
  });

  it('convite_cadastrar responde link_invalido e não cria conta nem vínculo', async () => {
    const criadora = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const email = novoEmail();
    const { token, id } = await a.convidar(criadora.id, grupo, email);
    await a.arquivar(grupo);

    expect(await a.cadastrar(token)).toEqual({ resultado: 'link_invalido', conta_id: null, grupo_id: null });
    expect(await a.contaDoEmail(email)).toBe(0);
    expect(await a.vinculos(grupo)).toEqual([criadora.id]);
    expect(await a.situacao(id)).toEqual({ usado: false, cancelado: false });
  });

  it('reativado o grupo, o mesmo convite volta a valer: lê, aceita e cria o vínculo', async () => {
    const criadora = await a.novaConta();
    const convidada = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const { token } = await a.convidar(criadora.id, grupo, convidada.email);
    await a.arquivar(grupo);
    expect(await a.ler(token)).toEqual([]);
    await a.reativar(grupo);

    expect(await a.ler(token)).toEqual([
      { email: convidada.email, grupo_nome: expect.stringMatching(/^Pelada /), conta_existe: true },
    ]);
    expect(await a.aceitar(convidada.id, token)).toEqual({ resultado: 'ok', grupo_id: grupo });
    expect((await a.vinculos(grupo)).sort()).toEqual([criadora.id, convidada.id].sort());
  });

  it('reativado o grupo, o cadastro pelo convite volta a funcionar', async () => {
    const criadora = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const email = novoEmail();
    const { token } = await a.convidar(criadora.id, grupo, email);
    await a.arquivar(grupo);
    await a.reativar(grupo);

    expect(await a.cadastrar(token)).toMatchObject({ resultado: 'ok', grupo_id: grupo });
    expect(await a.contaDoEmail(email)).toBe(1);
  });

  it('grupo ativo continua como antes (o convite de outro grupo arquivado não interfere)', async () => {
    const criadora = await a.novaConta();
    const ativo = await a.grupoDe(criadora.id);
    const arquivado = await a.grupoDe(criadora.id);
    const convidada = await a.novaConta();
    const doAtivo = await a.convidar(criadora.id, ativo, convidada.email);
    await a.convidar(criadora.id, arquivado, convidada.email);
    await a.arquivar(arquivado);

    expect(await a.ler(doAtivo.token)).toHaveLength(1);
    expect(await a.aceitar(convidada.id, doAtivo.token)).toEqual({ resultado: 'ok', grupo_id: ativo });
  });
});

describe('sobre o banco atual: a migration nova fecha o convite que já existia', () => {
  let banco: BancoTemporario;
  let cliente: pg.Client;
  let a: ReturnType<typeof apoio>;

  beforeAll(async () => {
    banco = await criarBancoTemporario();
    const anteriores = readdirSync(PASTA_MIGRACOES)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .indexOf(MIGRACAO);
    expect(anteriores).toBeGreaterThan(0);
    await aplicarMigracoes({ url: banco.url, quantas: anteriores });
    cliente = new pg.Client({ connectionString: banco.url });
    await cliente.connect();
    a = apoio(cliente);
  });

  afterAll(async () => {
    await cliente?.end();
    await banco?.remover();
  });

  it('antes dela o convite do grupo arquivado vale; depois dela não vale mais, e nada se perde', async () => {
    const criadora = await a.novaConta();
    const convidada = await a.novaConta();
    const grupo = await a.grupoDe(criadora.id);
    const { token, id } = await a.convidar(criadora.id, grupo, convidada.email);
    await a.arquivar(grupo);
    // Sem a migration nova, o convite do grupo arquivado ainda é lido (o defeito do SEC-004).
    expect(await a.ler(token)).toHaveLength(1);

    expect(await aplicarMigracoes({ url: banco.url })).toContain(MIGRACAO.replace(/\.sql$/, ''));

    expect(await a.ler(token)).toEqual([]);
    expect(await a.aceitar(convidada.id, token)).toEqual({ resultado: 'link_invalido', grupo_id: null });
    expect(await a.vinculos(grupo)).toEqual([criadora.id]);
    expect(await a.situacao(id)).toEqual({ usado: false, cancelado: false });
  });
});
