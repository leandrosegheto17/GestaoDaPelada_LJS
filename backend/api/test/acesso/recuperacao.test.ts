import { MENSAGENS } from '@pelada/contrato';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import {
  cliente,
  emailsPara,
  limparCaixa,
  tokenDoCookie,
  tokenDoEmail,
  URL_PUBLICA_TESTE,
} from './apoio.ts';

/**
 * Rotas de recuperação de senha (T27; ACE-22 a ACE-25, ACE-76). Cada caso usa uma conta própria
 * (a troca de senha e as sessões ficam gravadas).
 */

let aberto: CenarioContaAberto;
let pedir: ReturnType<typeof cliente>;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  pedir = cliente(aberto.url);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  limparCaixa();
  await aberto.db.query('DELETE FROM pedidos_email_origem');
});

let n = 0;
const SENHA = 'senha antiga 123';
const NOVA = 'senha nova 456789';

async function novaConta(confirmada = true): Promise<string> {
  n += 1;
  const email = `recuperacao-${n}@exemplo.test`;
  await aberto.db.query(
    `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, 'Pessoa Rec', 'x', now())`,
    [email],
  );
  if (confirmada) {
    await aberto.db.query('SELECT conta_definir_senha($1, $2, false)', [email, SENHA]);
  } else {
    await aberto.db.query(
      `UPDATE contas SET senha_hash = crypt($2, gen_salt('bf', 4)) WHERE email = $1`,
      [email, SENHA],
    );
  }
  return email;
}

async function entrar(email: string, senha: string, ip = '203.0.113.90'): Promise<Response> {
  return pedir('/sessao/entrar', { corpo: { email, senha }, ip });
}

async function pedirLink(email: string): Promise<string> {
  const r = await pedir('/sessao/esqueci-senha', { corpo: { email } });
  expect(r.status).toBe(200);
  return tokenDoEmail(emailsPara(email, 'recuperacao').at(-1));
}

describe('POST /api/sessao/esqueci-senha', () => {
  it('ACE-22, ACE-23: 200 com a mesma mensagem nos dois casos; só a conta existente recebe o e-mail', async () => {
    const email = await novaConta();
    const comConta = await pedir('/sessao/esqueci-senha', { corpo: { email } });
    const semConta = await pedir('/sessao/esqueci-senha', {
      corpo: { email: 'ninguem@exemplo.test' },
    });
    expect(comConta.status).toBe(200);
    expect(semConta.status).toBe(200);
    expect(await comConta.json()).toEqual({
      mensagem: 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha',
    });
    expect(await semConta.json()).toEqual({ mensagem: MENSAGENS.esqueci });
    const [mensagem] = emailsPara(email, 'recuperacao');
    expect(mensagem?.texto).toContain(`${URL_PUBLICA_TESTE}/entrar/nova-senha#t=`);
    expect(emailsPara('ninguem@exemplo.test')).toEqual([]);
  });

  it('ACE-23: o link novo invalida o anterior', async () => {
    const email = await novaConta();
    const primeiro = await pedirLink(email);
    await aberto.db.query(`UPDATE envios_email SET enviado_em = now() - interval '61 seconds'`);
    const segundo = await pedirLink(email);
    expect(
      (await pedir('/sessao/nova-senha', { corpo: { token: primeiro, senha: NOVA } })).status,
    ).toBe(410);
    expect(
      (await pedir('/sessao/nova-senha', { corpo: { token: segundo, senha: NOVA } })).status,
    ).toBe(200);
  });

  it('ACE-23: o link vale por 1 h', async () => {
    const email = await novaConta();
    const token = await pedirLink(email);
    await aberto.db.query(
      `UPDATE links_conta SET expira_em = now() - interval '1 second' WHERE tipo = 'recuperacao'`,
    );
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(410);
  });
});

describe('POST /api/sessao/nova-senha', () => {
  it('ACE-24: link válido: 200, a senha antiga dá 401, as sessões antigas dão 401 e a nova entra', async () => {
    const email = await novaConta();
    const antiga = tokenDoCookie(await entrar(email, SENHA));
    expect((await pedir('/sessao', { sessao: antiga })).status).toBe(200);

    const token = await pedirLink(email);
    const r = await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ mensagem: 'Senha alterada. Entre com a nova senha.' });

    expect((await entrar(email, SENHA)).status).toBe(401);
    expect((await pedir('/sessao', { sessao: antiga })).status).toBe(401);
    expect((await entrar(email, NOVA)).status).toBe(200);
  });

  it('ACE-24: a troca pela recuperação confirma o e-mail da conta não confirmada', async () => {
    const email = await novaConta(false);
    const token = await pedirLink(email);
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(200);
    expect((await entrar(email, NOVA)).status).toBe(200);
  });

  it('ACE-76: a conta bloqueada pelo par entra com a senha nova depois da recuperação', async () => {
    const email = await novaConta();
    for (let i = 0; i < 5; i += 1) await entrar(email, 'errada', '203.0.113.91');
    expect((await entrar(email, SENHA, '203.0.113.91')).status).toBe(429);
    const token = await pedirLink(email);
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(200);
    expect((await entrar(email, NOVA, '203.0.113.91')).status).toBe(200);
  });

  it('ACE-76: a conta no teto de 50 falhas entra com a senha nova depois da recuperação', async () => {
    const email = await novaConta();
    await aberto.db.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
       SELECT $1, digest(i::text, 'sha256'), now() - interval '1 minute', false FROM generate_series(1, 50) AS i`,
      [email],
    );
    expect((await entrar(email, SENHA, '203.0.113.92')).status).toBe(429);
    const token = await pedirLink(email);
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(200);
    expect((await entrar(email, NOVA, '203.0.113.92')).status).toBe(200);
  });

  it('ACE-25: link inexistente, usado ou malformado dá 410 link_invalido e a senha não muda', async () => {
    const email = await novaConta();
    const token = await pedirLink(email);
    for (const t of ['B'.repeat(43), 'curto']) {
      const r = await pedir('/sessao/nova-senha', { corpo: { token: t, senha: NOVA } });
      expect(r.status).toBe(410);
      expect(await r.json()).toMatchObject({ codigo: 'link_invalido' });
    }
    expect((await entrar(email, SENHA)).status).toBe(200);
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(200);
    expect(
      (await pedir('/sessao/nova-senha', { corpo: { token, senha: 'outra senha 999' } })).status,
    ).toBe(410);
    expect((await entrar(email, NOVA)).status).toBe(200);
  });

  it('ACE-03: senha nova fora dos limites dá 422 e não usa o link', async () => {
    const email = await novaConta();
    const token = await pedirLink(email);
    const r = await pedir('/sessao/nova-senha', { corpo: { token, senha: 'curta' } });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos', campos: ['senha'] });
    expect((await pedir('/sessao/nova-senha', { corpo: { token, senha: NOVA } })).status).toBe(200);
  });
});
