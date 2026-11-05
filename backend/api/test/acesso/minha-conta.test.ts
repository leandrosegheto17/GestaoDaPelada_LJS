import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { cliente, cookieVencido, limparCaixa, tokenDoCookie } from './apoio.ts';

/**
 * Rotas de minha conta: trocar senha e excluir (T28; ACE-26 a ACE-30, ACE-70). Cada caso usa
 * uma conta própria, com duas sessões abertas pelo próprio entrar.
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
const SENHA = 'senha atual 123';
const NOVA = 'senha nova 456789';

async function novaConta(): Promise<string> {
  n += 1;
  const email = `minha-conta-${n}@exemplo.test`;
  await aberto.db.query(
    `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, 'Pessoa Conta', 'x', now())`,
    [email],
  );
  await aberto.db.query('SELECT conta_definir_senha($1, $2, false)', [email, SENHA]);
  return email;
}

async function sessao(email: string, senha = SENHA, ip = '203.0.113.70'): Promise<string> {
  const r = await pedir('/sessao/entrar', { corpo: { email, senha }, ip });
  const token = tokenDoCookie(r);
  if (!token) throw new Error(`entrar falhou: ${r.status}`);
  return token;
}

describe('POST /api/conta/senha', () => {
  it('ACE-26: 204; a outra sessão da conta dá 401 e a atual segue', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    const outra = await sessao(email, SENHA, '203.0.113.71');
    const r = await pedir('/conta/senha', {
      corpo: { senhaAtual: SENHA, senhaNova: NOVA },
      sessao: atual,
    });
    expect(r.status).toBe(204);
    expect((await pedir('/sessao', { sessao: atual })).status).toBe(200);
    expect((await pedir('/sessao', { sessao: outra })).status).toBe(401);
    expect(
      (await pedir('/sessao/entrar', { corpo: { email, senha: NOVA }, ip: '203.0.113.72' })).status,
    ).toBe(200);
  });

  it('ACE-27: senha atual errada dá 401 senha_atual_incorreta e a senha não muda', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    const r = await pedir('/conta/senha', {
      corpo: { senhaAtual: 'errada', senhaNova: NOVA },
      sessao: atual,
    });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'senha_atual_incorreta' });
    expect(
      (await pedir('/sessao/entrar', { corpo: { email, senha: SENHA }, ip: '203.0.113.73' }))
        .status,
    ).toBe(200);
  });

  it('ACE-70: a 6.ª tentativa com senha errada recebe o bloqueio, com a mesma resposta para a senha certa', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    for (let i = 0; i < 5; i += 1) {
      const r = await pedir('/conta/senha', {
        corpo: { senhaAtual: 'errada', senhaNova: NOVA },
        sessao: atual,
      });
      expect(r.status).toBe(401);
    }
    const sexta = await pedir('/conta/senha', {
      corpo: { senhaAtual: 'errada', senhaNova: NOVA },
      sessao: atual,
    });
    const certa = await pedir('/conta/senha', {
      corpo: { senhaAtual: SENHA, senhaNova: NOVA },
      sessao: atual,
    });
    expect(sexta.status).toBe(429);
    expect(certa.status).toBe(429);
    const corpo = await sexta.json();
    expect(corpo).toMatchObject({ codigo: 'bloqueado_temporariamente' });
    expect(await certa.json()).toEqual(corpo);
  });

  it('ACE-70: o bloqueio da troca vale também para a exclusão', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    for (let i = 0; i < 5; i += 1) {
      await pedir('/conta/senha', {
        corpo: { senhaAtual: 'errada', senhaNova: NOVA },
        sessao: atual,
      });
    }
    const r = await pedir('/conta/excluir', { corpo: { senha: SENHA }, sessao: atual });
    expect(r.status).toBe(429);
    expect((await pedir('/sessao', { sessao: atual })).status).toBe(200);
  });

  it('sem sessão, 401 sessao_expirada', async () => {
    const r = await pedir('/conta/senha', { corpo: { senhaAtual: SENHA, senhaNova: NOVA } });
    expect(r.status).toBe(401);
    expect(await r.json()).toMatchObject({ codigo: 'sessao_expirada' });
  });
});

describe('POST /api/conta/excluir', () => {
  it('ACE-28: 204 com o cookie vencido; o login seguinte dá 401 e a outra sessão também', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    const outra = await sessao(email, SENHA, '203.0.113.74');
    const r = await pedir('/conta/excluir', { corpo: { senha: SENHA }, sessao: atual });
    expect(r.status).toBe(204);
    expect(cookieVencido(r)).toBe(true);
    expect((await pedir('/sessao', { sessao: outra })).status).toBe(401);
    expect(
      (await pedir('/sessao/entrar', { corpo: { email, senha: SENHA }, ip: '203.0.113.75' }))
        .status,
    ).toBe(401);
  });

  it('ACE-29: a única admin de grupo não arquivado recebe 409 unico_admin com a lista', async () => {
    const { cenario } = aberto;
    const atual = await sessao(cenario.emailA, cenario.senhaA, '203.0.113.76');
    const r = await pedir('/conta/excluir', { corpo: { senha: cenario.senhaA }, sessao: atual });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({
      codigo: 'unico_admin',
      grupos: [{ id: cenario.grupoA, nome: 'Grupo A' }],
    });
    expect((await pedir('/sessao', { sessao: atual })).status).toBe(200);
  });

  it('ACE-30: senha errada dá 401 e nada é apagado', async () => {
    const email = await novaConta();
    const atual = await sessao(email);
    const r = await pedir('/conta/excluir', { corpo: { senha: 'errada' }, sessao: atual });
    expect(r.status).toBe(401);
    expect((await pedir('/sessao', { sessao: atual })).status).toBe(200);
    const conta = await aberto.db.query('SELECT excluida_em FROM contas WHERE email = $1', [email]);
    expect(conta.rows[0]?.excluida_em).toBeNull();
  });
});
