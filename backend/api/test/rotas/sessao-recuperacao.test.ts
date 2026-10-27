import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso, cookieDaResposta, REMETENTE_QUE_FALHA } from '../apoio/acesso.ts';
import { capturarLog } from '../apoio/log.ts';
import { RECUPERA_ENVIO, RECUPERA_FALHA, RECUPERA_NOVA_SENHA, SENHA_ANTIGA } from '../apoio/contas-antigas.ts';

// Rotas de recuperação de senha (design C4; ACE-22 a ACE-25, ACE-51, ACE-52).

const MENSAGEM = 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha';
const SENHA_NOVA = 'senha-nova-do-teste-2';

describe('POST /api/sessao/esqueci-senha', () => {
  it('conta existente: 200 com a mensagem, e-mail de recuperação e o link anterior perde a validade (ACE-22, ACE-23)', async () => {
    const { pedir, remetente, tokenDoEmail } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/sessao/esqueci-senha', { email: RECUPERA_ENVIO.email });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ mensagem: MENSAGEM });
    expect(remetente.mensagens).toHaveLength(1);
    expect(remetente.mensagens[0]).toMatchObject({ para: RECUPERA_ENVIO.email, assunto: 'Recupere sua senha' });
    expect(remetente.mensagens[0]?.texto).toContain('/entrar/nova-senha#t=');

    const velho = await pedir('POST', '/api/sessao/nova-senha', {
      token: RECUPERA_ENVIO.tokenAntigo,
      senha: SENHA_NOVA,
    });
    expect(velho.status).toBe(410);
    const novo = await pedir('POST', '/api/sessao/nova-senha', {
      token: tokenDoEmail(RECUPERA_ENVIO.email),
      senha: SENHA_NOVA,
    });
    expect(novo.status).toBe(200);
  });

  it('e-mail sem conta: a mesma resposta e nenhum e-mail (ACE-22)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/sessao/esqueci-senha', {
      email: `sem-conta-${crypto.randomUUID()}@exemplo.com`,
    });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ mensagem: MENSAGEM });
    expect(remetente.mensagens).toHaveLength(0);
  });

  it('dois pedidos em menos de 60 s: um e-mail só (ACE-51)', async () => {
    const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();
    const conta = await contaConfirmada();
    remetente.mensagens.length = 0;
    await pedir('POST', '/api/sessao/esqueci-senha', { email: conta.email });
    const segundo = await pedir('POST', '/api/sessao/esqueci-senha', { email: conta.email });
    expect(segundo.status).toBe(200);
    expect(remetente.mensagens.filter((m) => m.para === conta.email)).toHaveLength(1);
  });

  it('remetente que falha: 503 email_indisponivel, e pedir de novo envia (ACE-52)', async () => {
    const { pedir, remetente } = cenarioDeAcesso();
    const falha = await pedir(
      'POST',
      '/api/sessao/esqueci-senha',
      { email: RECUPERA_FALHA.email },
      { remetente: REMETENTE_QUE_FALHA },
    );
    expect(falha.status).toBe(503);
    expect(falha.corpo).toMatchObject({ erro: { codigo: 'email_indisponivel' } });
    const deNovo = await pedir('POST', '/api/sessao/esqueci-senha', { email: RECUPERA_FALHA.email });
    expect(deNovo.status).toBe(200);
    expect(remetente.mensagens).toHaveLength(1);
  });

  it('e-mail inválido: 422', async () => {
    const { pedir } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/sessao/esqueci-senha', { email: 'x' });
    expect(r.status).toBe(422);
  });
});

describe('POST /api/sessao/nova-senha', () => {
  it('link válido: 200, encerra as sessões e a senha antiga deixa de entrar (ACE-24)', async () => {
    const { pedir } = cenarioDeAcesso();
    const email = RECUPERA_NOVA_SENHA.email;
    const entrou = await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA_ANTIGA });
    expect(entrou.status).toBe(200);
    const cookie = cookieDaResposta(entrou);

    const r = await pedir('POST', '/api/sessao/nova-senha', {
      token: RECUPERA_NOVA_SENHA.tokenAntigo,
      senha: SENHA_NOVA,
    });
    expect(r.status).toBe(200);

    expect((await pedir('GET', '/api/sessao', undefined, { cookie })).status).toBe(401);
    expect((await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA_ANTIGA })).status).toBe(401);
    expect((await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA_NOVA })).status).toBe(200);
  });

  it('link já usado ou que não existe: 410 link_invalido e a senha não muda (ACE-25)', async () => {
    const { pedir } = cenarioDeAcesso();
    for (const token of [RECUPERA_NOVA_SENHA.tokenAntigo, 'y'.repeat(43)]) {
      const r = await pedir('POST', '/api/sessao/nova-senha', { token, senha: 'terceira-senha-3' });
      expect(r.status).toBe(410);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'link_invalido' } });
    }
    const entra = await pedir('POST', '/api/sessao/entrar', {
      email: RECUPERA_NOVA_SENHA.email,
      senha: 'terceira-senha-3',
    });
    expect(entra.status).toBe(401);
  });

  it('senha fora dos limites: 422 dados_invalidos', async () => {
    const { pedir } = cenarioDeAcesso();
    const r = await pedir('POST', '/api/sessao/nova-senha', { token: 'x'.repeat(43), senha: 'curta' });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { senha: expect.any(String) } } });
  });
});

describe('log das rotas de recuperação (ACE-21, G-08)', () => {
  it('esqueci-senha: o log não contém o e-mail do corpo nem o token do link, no sucesso e na falha', async () => {
    const { pedir, remetente, tokenDoEmail, contaConfirmada } = cenarioDeAcesso();
    const { email } = await contaConfirmada();
    remetente.mensagens.length = 0;
    const { log } = await capturarLog(async () => {
      await pedir('POST', '/api/sessao/esqueci-senha', { email }, { remetente: REMETENTE_QUE_FALHA });
      await pedir('POST', '/api/sessao/esqueci-senha', { email });
      await pedir('POST', '/api/sessao/esqueci-senha', { email: 'invalido' });
    });
    const token = tokenDoEmail(email, 'senha');
    expect(remetente.mensagens).toHaveLength(1);
    expect(log).not.toContain(token);
    expect(log).not.toContain(email);
  });

  it('nova-senha: o log não contém a senha, o token nem o corpo, no sucesso e na falha', async () => {
    const { pedir, tokenDoEmail, contaConfirmada } = cenarioDeAcesso();
    const { email } = await contaConfirmada();
    await pedir('POST', '/api/sessao/esqueci-senha', { email });
    const senhaSecreta = 'segredo-de-recuperacao-que-nao-vaza-7';
    const tokenInexistente = 'z'.repeat(43);
    const tokenValido = tokenDoEmail(email, 'senha');
    const { resultado, log } = await capturarLog(async () => {
      const falha = await pedir('POST', '/api/sessao/nova-senha', { token: tokenInexistente, senha: senhaSecreta });
      const invalida = await pedir('POST', '/api/sessao/nova-senha', { token: tokenValido, senha: 'curta' });
      const sucesso = await pedir('POST', '/api/sessao/nova-senha', { token: tokenValido, senha: senhaSecreta });
      return { falha, invalida, sucesso };
    });
    expect(resultado.falha.status).toBe(410);
    expect(resultado.invalida.status).toBe(422);
    expect(resultado.sucesso.status).toBe(200);
    expect(log).not.toContain(senhaSecreta);
    expect(log).not.toContain(tokenInexistente);
    expect(log).not.toContain(tokenValido);
    expect(log).not.toContain(JSON.stringify({ token: tokenValido, senha: senhaSecreta }));
  });
});
