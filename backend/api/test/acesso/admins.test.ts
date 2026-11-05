import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { abrirCenarioConta, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { cliente, emailsPara, limparCaixa, tokenDoEmail, URL_PUBLICA_TESTE } from './apoio.ts';

/**
 * Rotas de admins do grupo (T30; ACE-31, ACE-32, ACE-37 a ACE-42). As sessões são gravadas como
 * superusuário (com o hash do token em texto); cada caso que remove admin usa um grupo próprio.
 */

let aberto: CenarioContaAberto;
let pedir: ReturnType<typeof cliente>;
let sessaoA: string;
let sessaoB: string;
let sessaoSemVinculo: string;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  pedir = cliente(aberto.url);
  sessaoA = await sessao(aberto.cenario.contaA);
  sessaoB = await sessao(aberto.cenario.contaB);
  sessaoSemVinculo = await sessao(aberto.cenario.contaSemVinculo);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  limparCaixa();
  await aberto.db.query('DELETE FROM pedidos_email_origem');
  await aberto.db.query(`UPDATE envios_email SET enviado_em = now() - interval '61 seconds'`);
});

let n = 0;
function novoEmail(): string {
  n += 1;
  return `admin-convidada-${n}@exemplo.test`;
}

/** Grupo novo criado por A, com A e B admins. */
async function grupoComDoisAdmins(): Promise<string> {
  const { db, cenario } = aberto;
  n += 1;
  const r = await db.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $2, 'sabado', 'semanal', '09:00', $3, now()) RETURNING id`,
    [`Grupo Admins ${n}`, `grupo-admins-${n}`, cenario.contaA],
  );
  const grupo = r.rows[0]!.id;
  await db.query(
    `INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $3, $1, now()), ($2, $3, $1, now())`,
    [cenario.contaA, cenario.contaB, grupo],
  );
  return grupo;
}

describe('POST /api/grupos/:grupoId/admins/convites', () => {
  it('ACE-31: 201 com id, e-mail e validade de 7 dias, e o e-mail com o nome do grupo e o link na caixa', async () => {
    const { cenario } = aberto;
    const email = novoEmail();
    const r = await pedir(`/grupos/${cenario.grupoA}/admins/convites`, {
      corpo: { email },
      sessao: sessaoA,
    });
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { id: string; email: string; expiraEm: string };
    expect(corpo.email).toBe(email);
    expect(corpo.id).toMatch(/^[0-9a-f-]{36}$/);
    const dias = (new Date(corpo.expiraEm).getTime() - Date.now()) / 86_400_000;
    expect(dias).toBeGreaterThan(6.9);
    expect(dias).toBeLessThanOrEqual(7);
    const [mensagem] = emailsPara(email, 'convite');
    expect(mensagem?.texto).toContain('Grupo A');
    expect(mensagem?.texto).toContain(`${URL_PUBLICA_TESTE}/convite#t=`);
  });

  it('ACE-32: e-mail que já é admin do grupo dá 409 ja_e_admin', async () => {
    const { cenario } = aberto;
    const r = await pedir(`/grupos/${cenario.grupoA}/admins/convites`, {
      corpo: { email: cenario.emailA },
      sessao: sessaoA,
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'ja_e_admin' });
  });

  it('ACE-52: com o envio falhando, 503 email_indisponivel e nenhum convite fica', async () => {
    const { cenario } = aberto;
    const { caixaDev } = await import('../../src/infraestrutura/email/caixa-dev.ts');
    const email = novoEmail();
    caixaDev.falharProximos(1);
    const r = await pedir(`/grupos/${cenario.grupoA}/admins/convites`, {
      corpo: { email },
      sessao: sessaoA,
    });
    expect(r.status).toBe(503);
    const c = await aberto.db.query('SELECT 1 FROM convites_admin WHERE email = $1', [email]);
    expect(c.rowCount).toBe(0);
  });
});

describe('GET e DELETE de convites', () => {
  it('ACE-37: a lista traz os admins e os convites pendentes', async () => {
    const { cenario } = aberto;
    const email = novoEmail();
    await pedir(`/grupos/${cenario.grupoA}/admins/convites`, { corpo: { email }, sessao: sessaoA });
    const r = await pedir(`/grupos/${cenario.grupoA}/admins`, { sessao: sessaoA });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      admins: Array<{ id: string; nome: string; email: string; acessaFinanceiro: boolean }>;
      convites: Array<{ email: string }>;
    };
    expect(corpo.admins).toContainEqual({
      id: cenario.contaA,
      nome: 'Conta A',
      email: cenario.emailA,
      acessaFinanceiro: false,
    });
    expect(corpo.convites.map((c) => c.email)).toContain(email);
  });

  it('ACE-38: cancelar dá 204 e o link do convite passa a dar 410', async () => {
    const { cenario } = aberto;
    const email = novoEmail();
    const criado = await pedir(`/grupos/${cenario.grupoA}/admins/convites`, {
      corpo: { email },
      sessao: sessaoA,
    });
    const { id } = (await criado.json()) as { id: string };
    const token = tokenDoEmail(emailsPara(email, 'convite')[0]);
    expect((await pedir('/convites/ler', { corpo: { token } })).status).toBe(200);

    const r = await pedir(`/grupos/${cenario.grupoA}/admins/convites/${id}`, {
      metodo: 'DELETE',
      sessao: sessaoA,
    });
    expect(r.status).toBe(204);
    expect((await pedir('/convites/ler', { corpo: { token } })).status).toBe(410);
    const lista = (await (
      await pedir(`/grupos/${cenario.grupoA}/admins`, { sessao: sessaoA })
    ).json()) as {
      convites: Array<{ id: string }>;
    };
    expect(lista.convites.map((c) => c.id)).not.toContain(id);
  });

  it('ACE-38: cancelar convite inexistente ou com id que não é uuid dá 404', async () => {
    const { cenario } = aberto;
    const inexistente = '00000000-0000-4000-8000-000000000000';
    expect(
      (
        await pedir(`/grupos/${cenario.grupoA}/admins/convites/${inexistente}`, {
          metodo: 'DELETE',
          sessao: sessaoA,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await pedir(`/grupos/${cenario.grupoA}/admins/convites/abc`, {
          metodo: 'DELETE',
          sessao: sessaoA,
        })
      ).status,
    ).toBe(404);
  });
});

describe('DELETE /api/grupos/:grupoId/admins/:contaId', () => {
  it('ACE-39, ACE-42: remover dá 204, apaga o vínculo e grava a auditoria', async () => {
    const { cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    const r = await pedir(`/grupos/${grupo}/admins/${cenario.contaB}`, {
      metodo: 'DELETE',
      sessao: sessaoA,
    });
    expect(r.status).toBe(204);
    const v = await aberto.db.query('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1', [
      grupo,
    ]);
    expect(v.rows.map((l: { conta_id: string }) => l.conta_id)).toEqual([cenario.contaA]);
    const a = await aberto.db.query<{ acao: string; autor_conta_id: string }>(
      'SELECT acao, autor_conta_id FROM auditoria WHERE grupo_id = $1',
      [grupo],
    );
    expect(a.rows).toEqual([{ acao: 'remover_admin', autor_conta_id: cenario.contaA }]);
  });

  it('ACE-40: remover o último admin dá 409 ultimo_admin', async () => {
    const { cenario } = aberto;
    const r = await pedir(`/grupos/${cenario.grupoA}/admins/${cenario.contaA}`, {
      metodo: 'DELETE',
      sessao: sessaoA,
    });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'ultimo_admin' });
  });

  it('ACE-42: convidar grava a auditoria com autor, ação e grupo', async () => {
    const { cenario } = aberto;
    const grupo = await grupoComDoisAdmins();
    await pedir(`/grupos/${grupo}/admins/convites`, {
      corpo: { email: novoEmail() },
      sessao: sessaoB,
    });
    const a = await aberto.db.query<{ acao: string; autor_conta_id: string }>(
      'SELECT acao, autor_conta_id FROM auditoria WHERE grupo_id = $1',
      [grupo],
    );
    expect(a.rows).toEqual([{ acao: 'convidar_admin', autor_conta_id: cenario.contaB }]);
  });
});

describe('ACE-41: sem vínculo com o grupo', () => {
  it('as 4 rotas dão 404 para conta sem vínculo, e nada muda', async () => {
    const { cenario } = aberto;
    const g = cenario.grupoA;
    const respostas = await Promise.all([
      pedir(`/grupos/${g}/admins`, { sessao: sessaoSemVinculo }),
      pedir(`/grupos/${g}/admins/convites`, {
        corpo: { email: novoEmail() },
        sessao: sessaoSemVinculo,
      }),
      pedir(`/grupos/${g}/admins/convites/00000000-0000-4000-8000-000000000000`, {
        metodo: 'DELETE',
        sessao: sessaoSemVinculo,
      }),
      pedir(`/grupos/${g}/admins/${cenario.contaA}`, {
        metodo: 'DELETE',
        sessao: sessaoSemVinculo,
      }),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    const v = await aberto.db.query(
      'SELECT 1 FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2',
      [g, cenario.contaA],
    );
    expect(v.rowCount).toBe(1);
  });

  it('a conta B, admin de outro grupo, também recebe 404 nas 4 rotas do grupo de A', async () => {
    const { cenario } = aberto;
    const g = cenario.grupoA;
    const respostas = await Promise.all([
      pedir(`/grupos/${g}/admins`, { sessao: sessaoB }),
      pedir(`/grupos/${g}/admins/convites`, { corpo: { email: novoEmail() }, sessao: sessaoB }),
      pedir(`/grupos/${g}/admins/convites/00000000-0000-4000-8000-000000000000`, {
        metodo: 'DELETE',
        sessao: sessaoB,
      }),
      pedir(`/grupos/${g}/admins/${cenario.contaA}`, { metodo: 'DELETE', sessao: sessaoB }),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([404, 404, 404, 404]);
  });
});
