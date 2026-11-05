import { TERMOS_VERSAO } from '@pelada/contrato';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { cliente, conviteDeTeste, limparCaixa, tokenDoCookie } from './apoio.ts';

/**
 * Rotas de convite: ler, aceitar e cadastrar (T29; ACE-33 a ACE-36, ACE-58, ACE-67). Os convites
 * são gravados como superusuário no grupo A, criados pela conta A.
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
function novoEmail(): string {
  n += 1;
  return `convidada-${n}@exemplo.test`;
}

async function convite(email: string, opcoes: Parameters<typeof conviteDeTeste>[4] = {}): Promise<string> {
  const { db, cenario } = aberto;
  return conviteDeTeste(db, cenario.grupoA, email, cenario.contaA, opcoes);
}

/** Conta confirmada nova com o e-mail dado, e a sessão dela. */
async function contaComSessao(email: string): Promise<string> {
  await aberto.db.query(`INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, 'Convidada', 'x', now())`, [email]);
  await aberto.db.query('SELECT conta_definir_senha($1, $2, false)', [email, 'senha convidada 123']);
  const r = await pedir('/sessao/entrar', { corpo: { email, senha: 'senha convidada 123' }, ip: '203.0.113.80' });
  const token = tokenDoCookie(r);
  if (!token) throw new Error(`entrar falhou: ${r.status}`);
  return token;
}

async function vinculado(email: string): Promise<boolean> {
  const r = await aberto.db.query(
    `SELECT 1 FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id WHERE c.email = $1 AND v.grupo_id = $2`,
    [email, aberto.cenario.grupoA],
  );
  return (r.rowCount ?? 0) > 0;
}

describe('POST /api/convites/ler', () => {
  it('ACE-34: mostra o e-mail, o nome do grupo e se o e-mail já tem conta', async () => {
    const email = novoEmail();
    const token = await convite(email);
    const r = await pedir('/convites/ler', { corpo: { token } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ email, grupoNome: 'Grupo A', contaExiste: false });
  });

  it('ACE-36: convite vencido, usado, cancelado, inexistente ou malformado dá 410', async () => {
    const vencido = await convite(novoEmail(), { expiraEm: "now() - interval '1 second'" });
    const usado = await convite(novoEmail(), { usadoEm: 'now()' });
    const cancelado = await convite(novoEmail(), { canceladoEm: 'now()' });
    for (const token of [vencido, usado, cancelado, 'C'.repeat(43), 'curto']) {
      const r = await pedir('/convites/ler', { corpo: { token } });
      expect(r.status).toBe(410);
      expect(await r.json()).toMatchObject({ codigo: 'link_invalido' });
    }
  });
});

describe('POST /api/convites/aceitar', () => {
  it('ACE-33: logado com o e-mail do convite, cria o vínculo e devolve o grupoId', async () => {
    const email = novoEmail();
    const sessao = await contaComSessao(email);
    const token = await convite(email);
    const r = await pedir('/convites/aceitar', { corpo: { token }, sessao });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ grupoId: aberto.cenario.grupoA });
    expect(await vinculado(email)).toBe(true);
    const permissao = await aberto.db.query(
      `SELECT v.acessa_financeiro FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id WHERE c.email = $1`,
      [email],
    );
    expect(permissao.rows[0]?.acessa_financeiro).toBe(false);
  });

  it('ACE-35: convite de outro e-mail dá 403 convite_de_outro_email e nenhum vínculo', async () => {
    const { cenario } = aberto;
    const sessao = await pedir('/sessao/entrar', { corpo: { email: cenario.emailB, senha: cenario.senhaB }, ip: '203.0.113.81' });
    const email = novoEmail();
    const token = await convite(email);
    const r = await pedir('/convites/aceitar', { corpo: { token }, sessao: tokenDoCookie(sessao) });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'convite_de_outro_email' });
    const b = await aberto.db.query('SELECT 1 FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2', [
      cenario.contaB,
      cenario.grupoA,
    ]);
    expect(b.rowCount).toBe(0);
  });

  it('ACE-67: dois aceites simultâneos do mesmo convite dão um 200 e um 410, com um vínculo só', async () => {
    const email = novoEmail();
    const sessao = await contaComSessao(email);
    const token = await convite(email);
    const [a, b] = await Promise.all([
      pedir('/convites/aceitar', { corpo: { token }, sessao }),
      pedir('/convites/aceitar', { corpo: { token }, sessao }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 410]);
    const r = await aberto.db.query(
      `SELECT count(*)::int AS n FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id WHERE c.email = $1`,
      [email],
    );
    expect(r.rows[0]?.n).toBe(1);
  });

  it('ACE-36: convite de grupo arquivado dá 410', async () => {
    const { db, cenario } = aberto;
    const g = await db.query<{ id: string }>(
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
       VALUES ('Arquivado', 'arquivado-convite', 'sabado', 'semanal', '09:00', $1, now(), now()) RETURNING id`,
      [cenario.contaA],
    );
    const email = novoEmail();
    const sessao = await contaComSessao(email);
    const token = await conviteDeTeste(db, g.rows[0]!.id, email, cenario.contaA);
    expect((await pedir('/convites/aceitar', { corpo: { token }, sessao })).status).toBe(410);
    expect((await pedir('/convites/ler', { corpo: { token } })).status).toBe(410);
  });

  it('sem sessão, 401', async () => {
    const token = await convite(novoEmail());
    expect((await pedir('/convites/aceitar', { corpo: { token } })).status).toBe(401);
  });
});

describe('POST /api/convites/cadastrar', () => {
  it('ACE-34, ACE-58: cria a conta confirmada com o e-mail do convite, abre sessão e o grupo aparece em GET /api/sessao', async () => {
    const email = novoEmail();
    const token = await convite(email);
    const r = await pedir('/convites/cadastrar', {
      corpo: { token, nome: 'Convidada Nova', senha: 'senha convidada 123', termos: true },
    });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ grupoId: aberto.cenario.grupoA });
    const sessao = tokenDoCookie(r);
    expect(sessao).not.toBeNull();
    const eu = await pedir('/sessao', { sessao });
    expect(eu.status).toBe(200);
    const corpo = (await eu.json()) as { email: string; grupos: Array<{ id: string }> };
    expect(corpo.email).toBe(email);
    expect(corpo.grupos.map((g) => g.id)).toContain(aberto.cenario.grupoA);
    const conta = await aberto.db.query<{ termos_versao: string; email_confirmado_em: Date | null }>(
      'SELECT termos_versao, email_confirmado_em FROM contas WHERE email = $1',
      [email],
    );
    expect(conta.rows[0]?.termos_versao).toBe(TERMOS_VERSAO);
    expect(conta.rows[0]?.email_confirmado_em).not.toBeNull();
  });

  it('ACE-34: o e-mail fica travado: campo email no corpo é recusado (422)', async () => {
    const token = await convite(novoEmail());
    const r = await pedir('/convites/cadastrar', {
      corpo: { token, nome: 'Outra', senha: 'senha convidada 123', termos: true, email: 'outra@exemplo.test' },
    });
    expect(r.status).toBe(422);
  });

  it('ACE-02: sem o aceite dos termos dá 422 termos_obrigatorios e o convite segue válido', async () => {
    const token = await convite(novoEmail());
    const r = await pedir('/convites/cadastrar', { corpo: { token, nome: 'Nova', senha: 'senha convidada 123', termos: false } });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'termos_obrigatorios' });
    expect((await pedir('/convites/ler', { corpo: { token } })).status).toBe(200);
  });

  it('ACE-36: convite inválido dá 410 e nenhuma conta', async () => {
    const email = novoEmail();
    const token = await convite(email, { canceladoEm: 'now()' });
    const r = await pedir('/convites/cadastrar', { corpo: { token, nome: 'Nova', senha: 'senha convidada 123', termos: true } });
    expect(r.status).toBe(410);
    const conta = await aberto.db.query('SELECT 1 FROM contas WHERE email = $1', [email]);
    expect(conta.rowCount).toBe(0);
  });

  it('e-mail que ganhou conta depois do convite: 409 e nada muda', async () => {
    const email = novoEmail();
    const token = await convite(email);
    await contaComSessao(email);
    const r = await pedir('/convites/cadastrar', { corpo: { token, nome: 'Nova', senha: 'senha convidada 123', termos: true } });
    expect(r.status).toBe(409);
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(await vinculado(email)).toBe(false);
  });
});
