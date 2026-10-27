import { TERMOS_VERSAO } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso, cookieDaResposta, REMETENTE_QUE_FALHA, SENHA } from '../apoio/acesso.ts';
import { PENDENTE_FALHA, PENDENTE_REENVIO } from '../apoio/contas-antigas.ts';
import { capturarLog } from '../apoio/log.ts';
import { comoOwner } from '../apoio/owner-worker.ts';

// Rotas de cadastro e confirmação (design C4; ACE-01 a ACE-08, ACE-21, ACE-51, ACE-52).

const MENSAGEM = 'Enviamos um link de confirmação para o seu e-mail';
const emailNovo = () => `cadastro-${crypto.randomUUID()}@exemplo.com`;
const cadastro = (email: string, extra: Record<string, unknown> = {}) => ({
  nome: 'Maria Souza',
  email,
  senha: SENHA,
  termos: true,
  ...extra,
});

describe('POST /api/conta', () => {
  it('cadastro novo: 201 com a mensagem e o e-mail de confirmação com o link no fragmento (ACE-01)', async () => {
    const { pedir, remetente, tokenDoEmail } = cenarioDeAcesso();
    const email = emailNovo();
    const r = await pedir('POST', '/api/conta', cadastro(email));
    expect(r.status).toBe(201);
    expect(r.corpo).toEqual({ mensagem: MENSAGEM });
    expect(remetente.mensagens).toHaveLength(1);
    expect(remetente.mensagens[0]).toMatchObject({ para: email, assunto: 'Confirme seu e-mail' });
    expect(remetente.mensagens[0]?.texto).toContain('http://localhost:8787/confirmar#t=');
    expect(tokenDoEmail(email)).toHaveLength(43);
  });

  it('grava a versão dos termos vigente e a hora do aceite (ACE-01, ACE-58)', async () => {
    const { pedir } = cenarioDeAcesso();
    const email = emailNovo();
    expect((await pedir('POST', '/api/conta', cadastro(email))).status).toBe(201);
    const [conta] = await comoOwner<{ termos_versao: string; termos_aceitos_em: Date | null }>(
      'select termos_versao, termos_aceitos_em from contas where email = $1',
      [email],
    );
    expect(conta?.termos_versao).toBe(TERMOS_VERSAO);
    expect(conta?.termos_aceitos_em).not.toBeNull();
  });

  it('a conta nasce sem e-mail confirmado: entrar responde 403 até confirmar (ACE-01)', async () => {
    const { pedir } = cenarioDeAcesso();
    const email = emailNovo();
    await pedir('POST', '/api/conta', cadastro(email));
    const r = await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA });
    expect(r.status).toBe(403);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'email_nao_confirmado' } });
  });

  it('e-mail que já tem conta: a mesma resposta 201, a conta fica como está e o dono recebe o aviso (ACE-04)', async () => {
    const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();
    const existente = await contaConfirmada();
    remetente.mensagens.length = 0;
    const novo = await pedir('POST', '/api/conta', cadastro(emailNovo()));
    const r = await pedir(
      'POST',
      '/api/conta',
      cadastro(existente.email, { nome: 'Impostor', senha: 'outra-senha-9' }),
    );
    expect(r.status).toBe(201);
    expect(r.corpo).toEqual(novo.corpo);
    const aviso = remetente.mensagens.find((m) => m.para === existente.email);
    expect(aviso?.assunto).toBe('Tentativa de cadastro com o seu e-mail');
    expect(aviso?.texto).not.toContain('#t=');
    // Nada mudou: a senha antiga continua entrando, a nova não.
    const entra = await pedir('POST', '/api/sessao/entrar', { email: existente.email, senha: existente.senha });
    expect(entra.status).toBe(200);
    expect(entra.corpo).toMatchObject({ nome: existente.nome });
    const nao = await pedir('POST', '/api/sessao/entrar', { email: existente.email, senha: 'outra-senha-9' });
    expect(nao.status).toBe(401);
  });

  it('pedidos repetidos do mesmo e-mail em menos de 60 s: a mesma resposta e um e-mail de cada tipo só (ACE-51)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const email = emailNovo();
    const a = await pedir('POST', '/api/conta', cadastro(email));
    // O 2º e o 3º pedido são de e-mail que já tem conta: o aviso é de outro tipo que a confirmação e sai uma vez.
    const b = await pedir('POST', '/api/conta', cadastro(email));
    const c = await pedir('POST', '/api/conta', cadastro(email));
    for (const r of [b, c]) {
      expect(r.status).toBe(201);
      expect(r.corpo).toEqual(a.corpo);
    }
    expect(remetente.mensagens.map((m) => m.assunto)).toEqual([
      'Confirme seu e-mail',
      'Tentativa de cadastro com o seu e-mail',
    ]);
  });

  it('e-mail com maiúsculas e espaços é o mesmo e-mail (ACE-05)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const email = emailNovo();
    await pedir('POST', '/api/conta', cadastro(`  ${email.toUpperCase()}  `));
    expect(remetente.mensagens[0]?.para).toBe(email);
  });

  it('sem o aceite dos termos: 422 termos_obrigatorios e a conta não é criada (ACE-02)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    for (const termos of [false, undefined]) {
      const email = emailNovo();
      const corpo: Record<string, unknown> = cadastro(email);
      if (termos === undefined) delete corpo['termos'];
      else corpo['termos'] = termos;
      const r = await pedir('POST', '/api/conta', corpo);
      expect(r.status).toBe(422);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'termos_obrigatorios' } });
      expect(remetente.mensagens).toHaveLength(0);
      // Sem conta: o login é "credenciais inválidas", não "e-mail não confirmado".
      const entra = await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA });
      expect(entra.status).toBe(401);
    }
  });

  it.each([
    ['nome curto', { nome: 'A' }, 'nome'],
    ['nome longo', { nome: 'x'.repeat(61) }, 'nome'],
    ['e-mail inválido', { email: 'sem-arroba' }, 'email'],
    ['e-mail longo', { email: `${'a'.repeat(250)}@e.com` }, 'email'],
    ['senha curta', { senha: '1234567' }, 'senha'],
    ['senha longa', { senha: 'x'.repeat(73) }, 'senha'],
    ['senha com mais de 72 bytes', { senha: 'é'.repeat(37) }, 'senha'],
  ])('%s: 422 dados_invalidos com o campo e nada é criado (ACE-03)', async (_nome, extra, campo) => {
    const { pedir, remetente } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/conta', cadastro(emailNovo(), extra));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { [campo]: expect.any(String) } } });
    expect(remetente.mensagens).toHaveLength(0);
  });

  it('campo a mais no corpo: 422 (schema estrito)', async () => {
    const { pedir } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/conta', cadastro(emailNovo(), { admin: true }));
    expect(r.status).toBe(422);
  });

  it('remetente que falha: 503 email_indisponivel, e pedir de novo cadastra e envia (ACE-52)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const email = emailNovo();
    const falha = await pedir('POST', '/api/conta', cadastro(email), { remetente: REMETENTE_QUE_FALHA });
    expect(falha.status).toBe(503);
    expect(falha.corpo).toMatchObject({ erro: { codigo: 'email_indisponivel' } });
    const de_novo = await pedir('POST', '/api/conta', cadastro(email));
    expect(de_novo.status).toBe(201);
    expect(remetente.mensagens.filter((m) => m.para === email)).toHaveLength(1);
  });

  it('o log não contém a senha nem o token do link (ACE-21)', async () => {
    const { pedir, tokenDoEmail } = cenarioDeAcesso();
    const email = emailNovo();
    const senha = 'senha-secreta-do-cadastro';
    const { log } = await capturarLog(async () => {
      await pedir('POST', '/api/conta', cadastro(email, { senha }), { remetente: REMETENTE_QUE_FALHA });
      await pedir('POST', '/api/conta', cadastro(email, { senha }));
    });
    expect(log).not.toContain(senha);
    expect(log).not.toContain(tokenDoEmail(email));
  });
});

describe('POST /api/conta/confirmar', () => {
  it('o link confirma o e-mail e abre a sessão (ACE-06)', async () => {
    const { pedir, tokenDoEmail } = cenarioDeAcesso();
    const email = emailNovo();
    await pedir('POST', '/api/conta', cadastro(email));
    const r = await pedir('POST', '/api/conta/confirmar', { token: tokenDoEmail(email) });
    expect(r.status).toBe(204);
    const eu = await pedir('GET', '/api/sessao', undefined, { cookie: cookieDaResposta(r) });
    expect(eu.status).toBe(200);
    expect(eu.corpo).toMatchObject({ email, nome: 'Maria Souza' });
    const entra = await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA });
    expect(entra.status).toBe(200);
  });

  it('link já usado ou que não existe: 410 link_invalido, sem sessão (ACE-07)', async () => {
    const { pedir, tokenDoEmail } = cenarioDeAcesso();
    const email = emailNovo();
    await pedir('POST', '/api/conta', cadastro(email));
    const token = tokenDoEmail(email);
    await pedir('POST', '/api/conta/confirmar', { token });
    for (const t of [token, 'z'.repeat(43)]) {
      const r = await pedir('POST', '/api/conta/confirmar', { token: t });
      expect(r.status).toBe(410);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });
      expect(r.headers.get('Set-Cookie')).toBeNull();
    }
  });

  it('token fora do formato: 422', async () => {
    const { pedir } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/conta/confirmar', { token: 'curto' });
    expect(r.status).toBe(422);
  });
});

describe('POST /api/conta/reenviar-confirmacao', () => {
  it('novo link: envia o e-mail e invalida o anterior, com a mesma resposta (ACE-08)', async () => {
    const { pedir, remetente, tokenDoEmail } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/conta/reenviar-confirmacao', { email: PENDENTE_REENVIO.email });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ mensagem: MENSAGEM });
    expect(remetente.mensagens).toHaveLength(1);
    const novo = tokenDoEmail(PENDENTE_REENVIO.email);
    expect(novo).not.toBe(PENDENTE_REENVIO.tokenAntigo);

    const velho = await pedir('POST', '/api/conta/confirmar', { token: PENDENTE_REENVIO.tokenAntigo });
    expect(velho.status).toBe(410);
    const confirma = await pedir('POST', '/api/conta/confirmar', { token: novo });
    expect(confirma.status).toBe(204);
  });

  it('e-mail sem conta: a mesma resposta e nenhum e-mail (ACE-08)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/conta/reenviar-confirmacao', { email: emailNovo() });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ mensagem: MENSAGEM });
    expect(remetente.mensagens).toHaveLength(0);
  });

  it('dois pedidos em menos de 60 s: um e-mail só (ACE-51)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const email = emailNovo();
    await pedir('POST', '/api/conta', cadastro(email));
    const r = await pedir('POST', '/api/conta/reenviar-confirmacao', { email });
    expect(r.status).toBe(200);
    expect(remetente.mensagens.filter((m) => m.para === email)).toHaveLength(1);
  });

  it('remetente que falha: 503, o link anterior segue valendo e pedir de novo envia (ACE-52)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const falha = await pedir(
      'POST',
      '/api/conta/reenviar-confirmacao',
      { email: PENDENTE_FALHA.email },
      { remetente: REMETENTE_QUE_FALHA },
    );
    expect(falha.status).toBe(503);
    expect(falha.corpo).toMatchObject({ erro: { codigo: 'email_indisponivel' } });
    const de_novo = await pedir('POST', '/api/conta/reenviar-confirmacao', { email: PENDENTE_FALHA.email });
    expect(de_novo.status).toBe(200);
    expect(remetente.mensagens.filter((m) => m.para === PENDENTE_FALHA.email)).toHaveLength(1);
  });
});
