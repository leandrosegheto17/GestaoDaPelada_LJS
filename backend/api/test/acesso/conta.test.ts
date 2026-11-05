import { MENSAGENS, TERMOS_VERSAO } from '@pelada/contrato';
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
 * Rotas de cadastro e confirmação (T25; ACE-01 a ACE-08, ACE-58, ACE-68), contra um banco
 * `teste_*` com o cenário de conta.
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
  // Os testes fazem muitos pedidos da mesma origem: zera o teto por hora (ACE-73 tem teste próprio).
  await aberto.db.query('DELETE FROM pedidos_email_origem');
});

let n = 0;
function cadastro(extra: Record<string, unknown> = {}) {
  n += 1;
  return {
    nome: 'Pessoa Nova',
    email: `nova-${n}@exemplo.test`,
    senha: 'senha segura 123',
    termos: true,
    ...extra,
  };
}

async function contaPorEmail(email: string) {
  const r = await aberto.db.query<{
    id: string;
    nome: string;
    termos_versao: string | null;
    email_confirmado_em: Date | null;
  }>('SELECT id, nome, termos_versao, email_confirmado_em FROM contas WHERE email = $1', [email]);
  return r.rows[0] ?? null;
}

/** Faz o último envio de cada endereço ficar 61 s no passado (o intervalo de 60 s do ACE-51). */
async function passar61s(): Promise<void> {
  await aberto.db.query(`UPDATE envios_email SET enviado_em = now() - interval '61 seconds'`);
}

describe('POST /api/conta', () => {
  it('ACE-01, ACE-58: 201 com a mensagem, e-mail de confirmação na caixa e termos_versao igual a TERMOS_VERSAO', async () => {
    const corpo = cadastro();
    const r = await pedir('/conta', { corpo });
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({
      mensagem: 'Enviamos um link de confirmação para o seu e-mail',
    });
    const [email] = emailsPara(corpo.email, 'confirmacao');
    expect(email?.texto).toContain(`${URL_PUBLICA_TESTE}/confirmar#t=`);
    const conta = await contaPorEmail(corpo.email);
    expect(conta?.termos_versao).toBe(TERMOS_VERSAO);
    expect(conta?.email_confirmado_em).toBeNull();
    expect(r.headers.get('set-cookie')).toBeNull();
  });

  it.each([{ termos: false }, { termos: undefined }, { termos: 'true' }])(
    'ACE-02: sem o aceite dos termos (%o), 422 termos_obrigatorios e nenhuma conta',
    async (extra) => {
      const corpo = cadastro(extra);
      const r = await pedir('/conta', { corpo });
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ codigo: 'termos_obrigatorios' });
      expect(await contaPorEmail(corpo.email)).toBeNull();
    },
  );

  it.each([
    ['nome', { nome: 'A' }],
    ['nome', { nome: 'x'.repeat(61) }],
    ['email', { email: 'nao-e-email' }],
    ['senha', { senha: '1234567' }],
    ['senha', { senha: 'x'.repeat(73) }],
  ])('ACE-03: %s fora dos limites dá 422 com o campo e nenhuma conta', async (campo, extra) => {
    const corpo = cadastro(extra);
    const r = await pedir('/conta', { corpo });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos', campos: [campo] });
    expect(emailsPara(String(corpo.email))).toEqual([]);
  });

  it('ACE-68: senha de 37 caracteres e 74 bytes em UTF-8 dá 422 no campo senha', async () => {
    const corpo = cadastro({ senha: 'é'.repeat(37) });
    const r = await pedir('/conta', { corpo });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['senha'] });
    expect(await contaPorEmail(corpo.email)).toBeNull();
  });

  it('ACE-03: JSON inválido ou campo a mais dá 422 dados_invalidos', async () => {
    expect((await pedir('/conta', { cru: '{nao json' })).status).toBe(422);
    const r = await pedir('/conta', { corpo: cadastro({ e_dono: true }) });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos' });
  });

  it('ACE-04, ACE-05: e-mail existente (com maiúsculas e espaços) recebe resposta idêntica; o dono recebe o aviso e a conta fica intacta', async () => {
    const { cenario } = aberto;
    const nova = await pedir('/conta', { corpo: cadastro() });
    const existente = await pedir('/conta', {
      corpo: cadastro({ email: `  ${cenario.emailA.toUpperCase()} `, nome: 'Invasora' }),
    });
    expect(existente.status).toBe(nova.status);
    expect(await existente.json()).toEqual(await nova.json());
    expect(emailsPara(cenario.emailA, 'aviso_cadastro')).toHaveLength(1);
    expect(emailsPara(cenario.emailA, 'confirmacao')).toEqual([]);
    expect(emailsPara(cenario.emailA, 'aviso_cadastro')[0]?.texto).not.toContain('#t=');
    expect((await contaPorEmail(cenario.emailA))?.nome).toBe('Conta A');
  });

  it('ACE-52: com o envio falhando, 503 email_indisponivel e o cadastro de novo funciona', async () => {
    const { caixaDev } = await import('../../src/infraestrutura/email/caixa-dev.ts');
    const corpo = cadastro();
    caixaDev.falharProximos(1);
    const falhou = await pedir('/conta', { corpo });
    expect(falhou.status).toBe(503);
    expect(await falhou.json()).toMatchObject({ codigo: 'email_indisponivel' });
    const deNovo = await pedir('/conta', { corpo });
    expect(deNovo.status).toBe(201);
    expect(emailsPara(corpo.email, 'confirmacao')).toHaveLength(1);
  });
});

describe('POST /api/conta/confirmar', () => {
  it('ACE-06: link válido confirma o e-mail, responde 200 e não envia Set-Cookie', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    const token = tokenDoEmail(emailsPara(corpo.email, 'confirmacao')[0]);
    const r = await pedir('/conta/confirmar', { corpo: { token } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ mensagem: 'E-mail confirmado. Entre com a sua senha.' });
    expect(r.headers.get('set-cookie')).toBeNull();
    expect(tokenDoCookie(r)).toBeNull();
    expect((await contaPorEmail(corpo.email))?.email_confirmado_em).not.toBeNull();
  });

  it('ACE-07: link já usado, inexistente ou malformado dá 410 link_invalido', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    const token = tokenDoEmail(emailsPara(corpo.email, 'confirmacao')[0]);
    await pedir('/conta/confirmar', { corpo: { token } });
    for (const t of [token, 'A'.repeat(43), 'curto']) {
      const r = await pedir('/conta/confirmar', { corpo: { token: t } });
      expect(r.status).toBe(410);
      expect(await r.json()).toMatchObject({ codigo: 'link_invalido' });
    }
  });

  it('ACE-07: link vencido (mais de 24 h) dá 410', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    const token = tokenDoEmail(emailsPara(corpo.email, 'confirmacao')[0]);
    await aberto.db.query(
      `UPDATE links_conta SET expira_em = now() - interval '1 second' WHERE tipo = 'confirmacao'`,
    );
    const r = await pedir('/conta/confirmar', { corpo: { token } });
    expect(r.status).toBe(410);
  });
});

describe('POST /api/conta/reenviar-confirmacao', () => {
  it('ACE-08: novo link invalida o anterior', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    const primeiro = tokenDoEmail(emailsPara(corpo.email, 'confirmacao')[0]);
    await passar61s();
    const r = await pedir('/conta/reenviar-confirmacao', { corpo: { email: corpo.email } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ mensagem: MENSAGENS.reenvio });
    const segundo = tokenDoEmail(emailsPara(corpo.email, 'confirmacao')[1]);
    expect((await pedir('/conta/confirmar', { corpo: { token: primeiro } })).status).toBe(410);
    expect((await pedir('/conta/confirmar', { corpo: { token: segundo } })).status).toBe(200);
  });

  it('ACE-08: responde igual para e-mail sem conta, sem enviar nada', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    await passar61s();
    const comConta = await pedir('/conta/reenviar-confirmacao', { corpo: { email: corpo.email } });
    const semConta = await pedir('/conta/reenviar-confirmacao', {
      corpo: { email: 'ninguem@exemplo.test' },
    });
    expect(semConta.status).toBe(comConta.status);
    expect(await semConta.json()).toEqual(await comConta.json());
    expect(emailsPara('ninguem@exemplo.test')).toEqual([]);
  });

  it('ACE-51: reenviar em menos de 60 s responde igual e não envia outro e-mail', async () => {
    const corpo = cadastro();
    await pedir('/conta', { corpo });
    const r = await pedir('/conta/reenviar-confirmacao', { corpo: { email: corpo.email } });
    expect(r.status).toBe(200);
    expect(emailsPara(corpo.email, 'confirmacao')).toHaveLength(1);
  });
});
