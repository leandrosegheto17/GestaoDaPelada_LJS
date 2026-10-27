import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Funções de cadastro e de links, chamadas como pelada_app, cada chamada numa transação (como numa requisição).
// O relógio é controlado movendo as colunas de tempo como owner (ACE-01, ACE-04 a ACE-08, ACE-23 a ACE-25, ACE-51).
const TERMOS = '2026-10-26';

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
const novoEmail = () => `pessoa${++sequencia}@exemplo.com`;
const novoHash = () => randomBytes(32);

interface Cadastro {
  situacao: string;
  conta_id: string;
  enviar: boolean;
}

const cadastrar = (email: string, token = novoHash(), senha = 'senha-boa-1') =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<Cadastro>('SELECT * FROM conta_cadastrar($1, $2, $3, $4, $5)', [
      email,
      'Pessoa Teste',
      senha,
      TERMOS,
      token,
    ]);
    return rows[0] as Cadastro;
  });

const pedir = (email: string, tipo: string, token = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ enviar: boolean; nome: string | null }>(
      'SELECT * FROM link_pedir($1, $2, $3)',
      [email, tipo, token],
    );
    return rows[0];
  });

const confirmar = (token: Buffer, sessao = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ r: string | null }>('SELECT link_confirmar($1, $2) AS r', [token, sessao]);
    return rows[0]?.r ?? null;
  });

const novaSenha = (token: Buffer, senha: string) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ r: boolean }>('SELECT link_nova_senha($1, $2) AS r', [token, senha]);
    return rows[0]?.r;
  });

/** Linha da conta vista pelo owner. */
async function conta(email: string) {
  const { rows } = await cliente.query(
    `SELECT id, email, nome, termos_versao, termos_aceitos_em, email_confirmado_em, senha_hash, md5(c::text) AS digito
       FROM contas c WHERE email = $1`,
    [email],
  );
  return rows[0];
}

async function senhaConfere(email: string, senha: string): Promise<boolean> {
  const { rows } = await cliente.query<{ ok: boolean }>(
    'SELECT crypt($2, senha_hash) = senha_hash AS ok FROM contas WHERE email = $1',
    [email, senha],
  );
  return rows[0]?.ok === true;
}

/** Prazo do link (expira_em - criado_em), em horas, e se já foi usado. */
async function link(token: Buffer) {
  const { rows } = await cliente.query<{ tipo: string; horas: number; usado: boolean }>(
    `SELECT tipo, (extract(epoch FROM expira_em - criado_em) / 3600)::float8 AS horas, usado_em IS NOT NULL AS usado
       FROM links_conta WHERE token_hash = $1`,
    [token],
  );
  return rows[0];
}

/** Simula a passagem do tempo para os envios do destino (o intervalo de 60 s). */
const passarSegundosDosEnvios = (email: string, segundos: number) =>
  cliente.query(
    "UPDATE envios_email SET enviado_em = enviado_em - make_interval(secs => $2) WHERE destino_hash = digest($1, 'sha256')",
    [email, segundos],
  );

/** Faz o link vencer (ou ficar perto de vencer) movendo os prazos para o passado. */
const passarHorasDoLink = (token: Buffer, horas: number) =>
  cliente.query(
    `UPDATE links_conta SET criado_em = criado_em - make_interval(secs => $2::float8 * 3600),
                            expira_em = expira_em - make_interval(secs => $2::float8 * 3600)
      WHERE token_hash = $1`,
    [token, horas],
  );

const sessoesDe = async (contaId: string) =>
  (
    await cliente.query<{ token_hash: Buffer; horas: number }>(
      'SELECT token_hash, (extract(epoch FROM expira_em - criada_em) / 3600)::float8 AS horas FROM sessoes WHERE conta_id = $1',
      [contaId],
    )
  ).rows;

describe('conta_cadastrar (ACE-01, ACE-04, ACE-05)', () => {
  it('e-mail novo cria a conta não confirmada, com termos, senha bcrypt de custo 12 e link de confirmação de 24 h', async () => {
    const token = novoHash();
    const r = await cadastrar('  Nova.Pessoa@Exemplo.COM ', token);

    expect(r).toEqual({ situacao: 'nova', conta_id: expect.any(String), enviar: true });
    const c = await conta('nova.pessoa@exemplo.com');
    expect(c).toMatchObject({ id: r.conta_id, nome: 'Pessoa Teste', termos_versao: TERMOS, email_confirmado_em: null });
    expect(c?.termos_aceitos_em).toBeInstanceOf(Date);
    expect(c?.senha_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await senhaConfere('nova.pessoa@exemplo.com', 'senha-boa-1')).toBe(true);
    expect(await link(token)).toEqual({ tipo: 'confirmacao', horas: 24, usado: false });
  });

  it('e-mail existente (mesmo com outra caixa e espaços) devolve existente e não altera a conta', async () => {
    const email = novoEmail();
    const primeiro = await cadastrar(email);
    const antes = await conta(email);
    const token = novoHash();

    const r = await cadastrar(` ${email.toUpperCase()} `, token, 'outra-senha-2');

    expect(r).toEqual({ situacao: 'existente', conta_id: primeiro.conta_id, enviar: true });
    expect(await conta(email)).toEqual(antes);
    expect(await senhaConfere(email, 'outra-senha-2')).toBe(false);
    expect(await link(token)).toBeUndefined();
    const { rows } = await cliente.query<{ n: string }>('SELECT count(*) AS n FROM contas WHERE email = $1', [email]);
    expect(Number(rows[0]?.n)).toBe(1);
  });

  it('o aviso de cadastro duplicado respeita os 60 s (ACE-51)', async () => {
    const email = novoEmail();
    await cadastrar(email);
    expect((await cadastrar(email)).enviar).toBe(true);
    expect((await cadastrar(email)).enviar).toBe(false);
    await passarSegundosDosEnvios(email, 61);
    expect((await cadastrar(email)).enviar).toBe(true);
  });
});

describe('link_confirmar (ACE-06, ACE-07)', () => {
  it('dentro das 24 h, confirma o e-mail, consome o link e cria a sessão de 12 h', async () => {
    const email = novoEmail();
    const token = novoHash();
    const { conta_id } = await cadastrar(email, token);
    await passarHorasDoLink(token, 23.9);
    const sessao = novoHash();

    expect(await confirmar(token, sessao)).toBe(conta_id);

    expect((await conta(email))?.email_confirmado_em).toBeInstanceOf(Date);
    expect((await link(token))?.usado).toBe(true);
    expect(await sessoesDe(conta_id)).toEqual([{ token_hash: sessao, horas: 12 }]);
  });

  it('link vencido: nulo, sem sessão e sem confirmar', async () => {
    const email = novoEmail();
    const token = novoHash();
    const { conta_id } = await cadastrar(email, token);
    await passarHorasDoLink(token, 24);

    expect(await confirmar(token)).toBeNull();
    expect((await conta(email))?.email_confirmado_em).toBeNull();
    expect(await sessoesDe(conta_id)).toEqual([]);
  });

  it('link já usado: nulo e nenhuma sessão nova', async () => {
    const token = novoHash();
    const { conta_id } = await cadastrar(novoEmail(), token);
    await confirmar(token);

    expect(await confirmar(token)).toBeNull();
    expect(await sessoesDe(conta_id)).toHaveLength(1);
  });

  it('link inexistente: nulo', async () => {
    expect(await confirmar(novoHash())).toBeNull();
  });
});

describe('link_pedir (ACE-08, ACE-23, ACE-51)', () => {
  it('novo link de confirmação invalida o anterior; dentro de 60 s não envia e o anterior continua valendo', async () => {
    const email = novoEmail();
    const primeiro = novoHash();
    const { conta_id } = await cadastrar(email, primeiro);

    const segundo = novoHash();
    expect(await pedir(email, 'confirmacao', segundo)).toEqual({ enviar: false, nome: 'Pessoa Teste' });
    expect(await link(segundo)).toBeUndefined();

    await passarSegundosDosEnvios(email, 61);
    const terceiro = novoHash();
    expect(await pedir(email, 'confirmacao', terceiro)).toEqual({ enviar: true, nome: 'Pessoa Teste' });
    expect(await link(terceiro)).toEqual({ tipo: 'confirmacao', horas: 24, usado: false });

    expect(await confirmar(primeiro)).toBeNull();
    expect(await confirmar(terceiro)).toBe(conta_id);
  });

  it('dentro dos 60 s, o link pendente segue o mesmo e confirma', async () => {
    const email = novoEmail();
    const primeiro = novoHash();
    const { conta_id } = await cadastrar(email, primeiro);
    await pedir(email, 'confirmacao');
    expect(await confirmar(primeiro)).toBe(conta_id);
  });

  it('recuperação: link de 1 h; o segundo pedido invalida o primeiro; o pedido em menos de 60 s não envia', async () => {
    const email = novoEmail();
    await cadastrar(email);
    const primeiro = novoHash();
    expect(await pedir(email, 'recuperacao', primeiro)).toEqual({ enviar: true, nome: 'Pessoa Teste' });
    expect(await link(primeiro)).toEqual({ tipo: 'recuperacao', horas: 1, usado: false });

    expect((await pedir(email, 'recuperacao'))?.enviar).toBe(false);

    await passarSegundosDosEnvios(email, 61);
    const segundo = novoHash();
    expect((await pedir(` ${email.toUpperCase()}`, 'recuperacao', segundo))?.enviar).toBe(true);
    expect(await novaSenha(primeiro, 'nova-senha-1')).toBe(false);
    expect(await novaSenha(segundo, 'nova-senha-1')).toBe(true);
  });

  it('sem conta, não envia e não cria link', async () => {
    const token = novoHash();
    expect(await pedir('ninguem@exemplo.com', 'recuperacao', token)).toEqual({ enviar: false, nome: null });
    expect(await link(token)).toBeUndefined();
  });

  it('confirmação de conta já confirmada não envia', async () => {
    const email = novoEmail();
    const token = novoHash();
    await cadastrar(email, token);
    await confirmar(token);
    await passarSegundosDosEnvios(email, 61);
    expect((await pedir(email, 'confirmacao'))?.enviar).toBe(false);
  });
});

describe('link_nova_senha (ACE-24, ACE-25)', () => {
  async function contaComDuasSessoes() {
    const email = novoEmail();
    const { conta_id } = await cadastrar(email);
    for (const s of [novoHash(), novoHash()]) {
      await cliente.query(
        `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
         VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
        [s, conta_id],
      );
    }
    return { email, conta_id };
  }

  it('troca a senha, consome o link, confirma o e-mail e apaga todas as sessões', async () => {
    const { email, conta_id } = await contaComDuasSessoes();
    const token = novoHash();
    await pedir(email, 'recuperacao', token);
    await passarHorasDoLink(token, 0.9);

    expect(await novaSenha(token, 'senha-nova-9')).toBe(true);

    expect(await senhaConfere(email, 'senha-nova-9')).toBe(true);
    expect(await senhaConfere(email, 'senha-boa-1')).toBe(false);
    expect((await conta(email))?.senha_hash).toMatch(/^\$2[aby]\$12\$/);
    expect((await conta(email))?.email_confirmado_em).toBeInstanceOf(Date);
    expect((await link(token))?.usado).toBe(true);
    expect(await sessoesDe(conta_id)).toEqual([]);
  });

  it('link de 1 h vencido: false, senha e sessões intactas', async () => {
    const { email, conta_id } = await contaComDuasSessoes();
    const token = novoHash();
    await pedir(email, 'recuperacao', token);
    await passarHorasDoLink(token, 1);

    expect(await novaSenha(token, 'senha-nova-9')).toBe(false);
    expect(await senhaConfere(email, 'senha-boa-1')).toBe(true);
    expect(await sessoesDe(conta_id)).toHaveLength(2);
  });

  it('link já usado ou inexistente: false e a senha não muda', async () => {
    const { email } = await contaComDuasSessoes();
    const token = novoHash();
    await pedir(email, 'recuperacao', token);
    await novaSenha(token, 'senha-nova-9');

    expect(await novaSenha(token, 'terceira-senha')).toBe(false);
    expect(await novaSenha(novoHash(), 'terceira-senha')).toBe(false);
    expect(await senhaConfere(email, 'senha-nova-9')).toBe(true);
  });

  it('o link de confirmação não serve para trocar a senha', async () => {
    const email = novoEmail();
    const token = novoHash();
    await cadastrar(email, token);
    expect(await novaSenha(token, 'senha-nova-9')).toBe(false);
    expect(await senhaConfere(email, 'senha-boa-1')).toBe(true);
  });
});
