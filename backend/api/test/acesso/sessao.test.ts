import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { cliente, cookieVencido, hashDoTexto, limparCaixa, tokenDoCookie } from './apoio.ts';

/**
 * Rotas de sessão: entrar, consultar e sair (T26; ACE-09, ACE-11 a ACE-14, ACE-17, ACE-18,
 * ACE-74). Cada caso de bloqueio usa uma conta própria (criada pela `conta_definir_senha`, como
 * superusuário) e IPs próprios, porque as falhas ficam gravadas.
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

beforeEach(() => {
  limparCaixa();
});

let n = 0;
const SENHA = 'senha certa 123';

/** Conta confirmada nova, com a senha conhecida. */
async function novaConta(): Promise<{ id: string; email: string }> {
  n += 1;
  const email = `sessao-${n}@exemplo.test`;
  await aberto.db.query(
    `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, 'Pessoa Sessão', 'x', now())`,
    [email],
  );
  const r = await aberto.db.query<{ id: string }>('SELECT conta_definir_senha($1, $2, false) AS id', [email, SENHA]);
  return { id: r.rows[0]!.id, email };
}

function ip(i: number): string {
  return `198.51.100.${i}`;
}

const BLOQUEIO = { codigo: 'bloqueado_temporariamente', erro: 'Muitas tentativas. Tente de novo em 15 minutos.' };

describe('POST /api/sessao/entrar', () => {
  it('ACE-09: 200 com nome e e-mail e o cookie __Host-sessao; o banco guarda só o SHA-256 do token (ACE-10)', async () => {
    const { cenario } = aberto;
    const r = await pedir('/sessao/entrar', { corpo: { email: cenario.emailA, senha: cenario.senhaA }, ip: ip(1) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ nome: 'Conta A', email: cenario.emailA });
    const token = tokenDoCookie(r);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const cabecalho = r.headers.get('set-cookie') ?? '';
    for (const atributo of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) expect(cabecalho).toContain(atributo);
    const s = await aberto.db.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [hashDoTexto(token!)]);
    expect(s.rowCount).toBe(1);
  });

  it('ACE-11: e-mail inexistente e senha errada dão o mesmo 401 credenciais_invalidas', async () => {
    const { cenario } = aberto;
    const errada = await pedir('/sessao/entrar', { corpo: { email: cenario.emailB, senha: 'errada' }, ip: ip(2) });
    const inexistente = await pedir('/sessao/entrar', { corpo: { email: 'ninguem@exemplo.test', senha: 'errada' }, ip: ip(2) });
    expect(errada.status).toBe(401);
    expect(inexistente.status).toBe(401);
    const corpo = await errada.json();
    expect(corpo).toMatchObject({ codigo: 'credenciais_invalidas' });
    expect(await inexistente.json()).toEqual(corpo);
    expect(errada.headers.get('set-cookie')).toBeNull();
  });

  it('ACE-12: senha certa de conta não confirmada dá 403 email_nao_confirmado, sem cookie', async () => {
    const { cenario } = aberto;
    const r = await pedir('/sessao/entrar', {
      corpo: { email: cenario.emailNaoConfirmada, senha: cenario.senhaNaoConfirmada },
      ip: ip(3),
    });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'email_nao_confirmado' });
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it('ACE-13: 5 falhas do par em 15 min bloqueiam o par, mesmo com a senha certa, com o texto único', async () => {
    const conta = await novaConta();
    for (let i = 0; i < 5; i += 1) {
      const r = await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: 'errada' }, ip: ip(10) });
      expect(r.status).toBe(401);
    }
    const certa = await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: ip(10) });
    expect(certa.status).toBe(429);
    expect(await certa.json()).toEqual(BLOQUEIO);
    expect(certa.headers.get('set-cookie')).toBeNull();
  });

  it('ACE-13: 4 falhas ainda não bloqueiam', async () => {
    const conta = await novaConta();
    for (let i = 0; i < 4; i += 1) await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: 'errada' }, ip: ip(11) });
    const certa = await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: ip(11) });
    expect(certa.status).toBe(200);
  });

  it('ACE-14: o bloqueio de um IP não afeta outro IP sem falhas', async () => {
    const conta = await novaConta();
    for (let i = 0; i < 5; i += 1) await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: 'errada' }, ip: ip(12) });
    expect((await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: ip(12) })).status).toBe(429);
    const outro = await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: ip(13) });
    expect(outro.status).toBe(200);
  });

  it('ACE-74: 50 senhas erradas em 1 h para a conta, de vários IPs, dão 429 com o mesmo texto, mesmo de IP novo e com a senha certa', async () => {
    const conta = await novaConta();
    // 50 falhas de 50 IPs (nenhum par chega a 5), gravadas há 1 min.
    await aberto.db.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
       SELECT $1, digest(i::text, 'sha256'), now() - interval '1 minute', false FROM generate_series(1, 50) AS i`,
      [conta.email],
    );
    const r = await pedir('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: ip(14) });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual(BLOQUEIO);
  });

  it('ACE-74: e-mail sem conta no teto recebe a mesma resposta', async () => {
    const email = 'teto-sem-conta@exemplo.test';
    await aberto.db.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
       SELECT $1, digest(i::text, 'sha256'), now() - interval '1 minute', false FROM generate_series(1, 50) AS i`,
      [email],
    );
    const r = await pedir('/sessao/entrar', { corpo: { email, senha: 'qualquer' }, ip: ip(15) });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual(BLOQUEIO);
  });

  it('IP sem cabeçalho: as falhas contam para o par (e-mail, sem-ip)', async () => {
    const conta = await novaConta();
    const semIp = cliente(aberto.url);
    for (let i = 0; i < 5; i += 1) {
      await semIp('/sessao/entrar', { corpo: { email: conta.email, senha: 'errada' }, ip: '' });
    }
    expect((await semIp('/sessao/entrar', { corpo: { email: conta.email, senha: SENHA }, ip: '' })).status).toBe(429);
  });

  it('ACE-03: corpo inválido dá 422', async () => {
    const r = await pedir('/sessao/entrar', { corpo: { email: 'x', senha: '' } });
    expect(r.status).toBe(422);
  });
});

describe('GET /api/sessao e POST /api/sessao/sair', () => {
  it('ACE-18: com sessão, id, nome, e-mail e a lista de grupos', async () => {
    const { cenario } = aberto;
    const entrar = await pedir('/sessao/entrar', { corpo: { email: cenario.emailA, senha: cenario.senhaA }, ip: ip(20) });
    const token = tokenDoCookie(entrar);
    const r = await pedir('/sessao', { sessao: token });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      id: cenario.contaA,
      nome: 'Conta A',
      email: cenario.emailA,
      grupos: [{ id: cenario.grupoA, nome: 'Grupo A', slug: cenario.slugA, acessaFinanceiro: false }],
    });
  });

  it('ACE-18: sem sessão, 401', async () => {
    const r = await pedir('/sessao');
    expect(r.status).toBe(401);
  });

  it('ACE-17: sair dá 204 com o cookie vencido, apaga a sessão, e depois GET /api/sessao dá 401', async () => {
    const { cenario } = aberto;
    const entrar = await pedir('/sessao/entrar', { corpo: { email: cenario.emailB, senha: cenario.senhaB }, ip: ip(21) });
    const token = tokenDoCookie(entrar)!;
    const sair = await pedir('/sessao/sair', { metodo: 'POST', sessao: token });
    expect(sair.status).toBe(204);
    expect(cookieVencido(sair)).toBe(true);
    const s = await aberto.db.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [hashDoTexto(token)]);
    expect(s.rowCount).toBe(0);
    expect((await pedir('/sessao', { sessao: token })).status).toBe(401);
  });

  it('sair sem sessão também dá 204 com o cookie vencido', async () => {
    const r = await pedir('/sessao/sair', { metodo: 'POST' });
    expect(r.status).toBe(204);
    expect(cookieVencido(r)).toBe(true);
  });
});
