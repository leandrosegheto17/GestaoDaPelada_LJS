import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { limiteEmailsDia, tetoDoEnvio } from '../../src/entrada/enviar-email.ts';
import { cenarioDeAcesso, SENHA } from '../apoio/acesso.ts';
import { GRUPO_A } from '../apoio/cenario-dois-grupos.ts';
import { capturarLog } from '../apoio/log.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao } from '../apoio/sessao-worker.ts';

// Teto global de e-mails por dia (ACE-72, ACE-52; SEC-CA-02, T63). Acima de 80% de LIMITE_EMAILS_DIA, cadastro,
// reenvio de confirmação e convite respondem 503 email_indisponivel sem enviar; "esqueci a senha" envia até 100%.
// O contador do dia (fuso de São Paulo) é ajustado como owner antes de cada pedido; o pedido usa um ambiente com o
// limite do teste (o padrão da suíte é alto, para os outros testes não esbarrarem no teto).

const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();
const comLimite = (valor: string | undefined): Cloudflare.Env => ({ ...env, LIMITE_EMAILS_DIA: valor });
// Limite 10: teto de 8 para cadastro, reenvio e convite; 10 para a recuperação.
const DEZ = comLimite('10');
const ERRO = { erro: { codigo: 'email_indisponivel' } };

const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

async function totalHoje(total: number): Promise<void> {
  await comoOwner(
    `INSERT INTO envios_email_dia (dia, total) VALUES (${HOJE_SP}, $1)
     ON CONFLICT (dia) DO UPDATE SET total = excluded.total`,
    [total],
  );
}

async function lerTotalHoje(): Promise<number> {
  const [linha] = await comoOwner<{ total: number }>(`SELECT total FROM envios_email_dia WHERE dia = ${HOJE_SP}`);
  return linha?.total ?? 0;
}

/** Tira o registro do intervalo de 60 s (ACE-51) do destino, para o pedido seguinte poder enviar. */
async function liberarIntervalo(email: string): Promise<void> {
  await comoOwner("DELETE FROM envios_email WHERE destino_hash = digest($1::text, 'sha256')", [email]);
}

const emailNovo = () => `teto-${crypto.randomUUID()}@exemplo.com`;
const cadastro = (email: string) => ({ nome: 'Maria Teto', email, senha: SENHA, termos: true });
const enviadosPara = (email: string) => remetente.mensagens.filter((m) => m.para === email);

beforeEach(() => {
  remetente.mensagens.length = 0;
});

describe('POST /api/conta com o teto (ACE-72)', () => {
  it('até 80%: envia e conta; acima: 503 email_indisponivel, nada enviado, conta não criada', async () => {
    const enviado = emailNovo();
    await totalHoje(7);
    const r = await pedir('POST', '/api/conta', cadastro(enviado), { env: DEZ });
    expect(r.status).toBe(201);
    expect(enviadosPara(enviado)).toHaveLength(1);
    expect(await lerTotalHoje()).toBe(8);

    const barrado = emailNovo();
    const { resultado: recusado, log } = await capturarLog(() =>
      pedir('POST', '/api/conta', cadastro(barrado), { env: DEZ }),
    );
    expect(recusado.status).toBe(503);
    expect(recusado.corpo).toMatchObject(ERRO);
    expect(remetente.mensagens).toHaveLength(1);
    expect(await lerTotalHoje()).toBe(8);
    expect(await comoOwner('SELECT 1 FROM contas WHERE email = $1', [barrado])).toEqual([]);
    // ACE-52: o log não leva o e-mail.
    expect(log).not.toContain(barrado);

    // Com a cota de volta (outro dia, ou limite maior), pedir de novo funciona.
    await totalHoje(7);
    expect((await pedir('POST', '/api/conta', cadastro(barrado), { env: DEZ })).status).toBe(201);
    expect(enviadosPara(barrado)).toHaveLength(1);
  });

  it('e-mail que já tem conta: acima do teto, o mesmo 503 do cadastro novo e nenhum aviso (ACE-04)', async () => {
    const existente = await contaConfirmada();
    await liberarIntervalo(existente.email);
    remetente.mensagens.length = 0;
    await totalHoje(8);
    const novo = await pedir('POST', '/api/conta', cadastro(emailNovo()), { env: DEZ });
    const duplicado = await pedir('POST', '/api/conta', cadastro(existente.email), { env: DEZ });
    expect(novo.status).toBe(503);
    expect(duplicado.status).toBe(503);
    expect(duplicado.corpo).toEqual(novo.corpo);
    expect(remetente.mensagens).toHaveLength(0);
    expect(await lerTotalHoje()).toBe(8);
  });
});

describe('POST /api/conta/reenviar-confirmacao com o teto (ACE-72)', () => {
  it('acima de 80%: 503 sem enviar; até 80%: envia', async () => {
    const email = emailNovo();
    expect((await pedir('POST', '/api/conta', cadastro(email))).status).toBe(201);
    await liberarIntervalo(email);
    remetente.mensagens.length = 0;

    await totalHoje(8);
    const r = await pedir('POST', '/api/conta/reenviar-confirmacao', { email }, { env: DEZ });
    expect(r.status).toBe(503);
    expect(r.corpo).toMatchObject(ERRO);
    expect(remetente.mensagens).toHaveLength(0);
    expect(await lerTotalHoje()).toBe(8);

    await totalHoje(7);
    const ok = await pedir('POST', '/api/conta/reenviar-confirmacao', { email }, { env: DEZ });
    expect(ok.status).toBe(200);
    expect(enviadosPara(email)).toHaveLength(1);
    expect(await lerTotalHoje()).toBe(8);
  });
});

describe('POST /api/grupos/:grupoId/admins/convites com o teto (ACE-72)', () => {
  it('acima de 80%: 503 sem enviar e o convite não fica; até 80%: convida', async () => {
    const s = await criarSessao(GRUPO_A);
    const email = emailNovo();
    const caminho = `/api/grupos/${GRUPO_A.grupo}/admins/convites`;

    await totalHoje(8);
    const r = await pedir('POST', caminho, { email }, { cookie: s.cookie, env: DEZ });
    expect(r.status).toBe(503);
    expect(r.corpo).toMatchObject(ERRO);
    expect(remetente.mensagens).toHaveLength(0);
    expect(await comoOwner('SELECT 1 FROM convites_admin WHERE email = $1', [email])).toEqual([]);

    await totalHoje(7);
    expect((await pedir('POST', caminho, { email }, { cookie: s.cookie, env: DEZ })).status).toBe(201);
    expect(enviadosPara(email)).toHaveLength(1);
  });
});

describe('POST /api/sessao/esqueci-senha com o teto (ACE-72)', () => {
  it('passa dos 80% e continua enviando até 100%; acima de 100%, 503 sem enviar', async () => {
    const conta = await contaConfirmada();
    remetente.mensagens.length = 0;
    const esqueci = () => pedir('POST', '/api/sessao/esqueci-senha', { email: conta.email }, { env: DEZ });

    await liberarIntervalo(conta.email);
    await totalHoje(8);
    expect((await esqueci()).status).toBe(200);
    expect(enviadosPara(conta.email)).toHaveLength(1);

    await liberarIntervalo(conta.email);
    await totalHoje(9);
    expect((await esqueci()).status).toBe(200);
    expect(enviadosPara(conta.email)).toHaveLength(2);
    expect(await lerTotalHoje()).toBe(10);

    await liberarIntervalo(conta.email);
    const r = await esqueci();
    expect(r.status).toBe(503);
    expect(r.corpo).toMatchObject(ERRO);
    expect(enviadosPara(conta.email)).toHaveLength(2);
    expect(await lerTotalHoje()).toBe(10);
  });
});

describe('LIMITE_EMAILS_DIA (ACE-72)', () => {
  it('valor customizado é respeitado: 50 dá teto 40 no cadastro e 50 na recuperação', async () => {
    const cinquenta = comLimite('50');
    await totalHoje(40);
    expect((await pedir('POST', '/api/conta', cadastro(emailNovo()), { env: cinquenta })).status).toBe(503);
    await totalHoje(39);
    expect((await pedir('POST', '/api/conta', cadastro(emailNovo()), { env: cinquenta })).status).toBe(201);

    const conta = await contaConfirmada();
    await liberarIntervalo(conta.email);
    await totalHoje(49);
    const esqueci = () => pedir('POST', '/api/sessao/esqueci-senha', { email: conta.email }, { env: cinquenta });
    expect((await esqueci()).status).toBe(200);
    await liberarIntervalo(conta.email);
    expect((await esqueci()).status).toBe(503);
  });

  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['texto', 'abc'],
    ['zero', '0'],
    ['negativo', '-5'],
    ['decimal', '1.5'],
  ])('valor %s volta ao padrão 100 (teto 80 no cadastro)', async (_nome, valor) => {
    await totalHoje(80);
    expect((await pedir('POST', '/api/conta', cadastro(emailNovo()), { env: comLimite(valor) })).status).toBe(503);
    await totalHoje(79);
    expect((await pedir('POST', '/api/conta', cadastro(emailNovo()), { env: comLimite(valor) })).status).toBe(201);
  });
});

describe('regras puras do teto (ACE-72)', () => {
  it('limiteEmailsDia: inteiro positivo; senão, 100', () => {
    expect(limiteEmailsDia('250')).toBe(250);
    expect(limiteEmailsDia(' 30 ')).toBe(30);
    for (const v of [undefined, '', 'abc', '0', '-1', '1.5', '1e3', '10abc']) expect(limiteEmailsDia(v)).toBe(100);
  });

  it('tetoDoEnvio: recuperação usa 100%; cadastro, reenvio e convite, 80% arredondado para baixo', () => {
    expect(tetoDoEnvio(100, 'recuperacao')).toBe(100);
    expect(tetoDoEnvio(100, 'cadastro')).toBe(80);
    expect(tetoDoEnvio(100, 'reenvio')).toBe(80);
    expect(tetoDoEnvio(100, 'convite')).toBe(80);
    expect(tetoDoEnvio(7, 'cadastro')).toBe(5);
    expect(tetoDoEnvio(7, 'recuperacao')).toBe(7);
  });
});
