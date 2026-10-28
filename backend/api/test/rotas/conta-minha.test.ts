import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso, cookieDaResposta } from '../apoio/acesso.ts';
import { GRUPO_A } from '../apoio/cenario-dois-grupos.ts';
import { ADMIN_UNICO } from '../apoio/grupo-isolado.ts';
import { capturarLog } from '../apoio/log.ts';
import { criarSessao, noBanco } from '../apoio/sessao-worker.ts';

// Rotas de minha conta: trocar a senha e excluir (design C4; ACE-26 a ACE-30, ACE-69).

const { pedir } = cenarioDeAcesso();
const SENHA_NOVA = 'senha-nova-do-teste-2';

describe('POST /api/conta/senha', () => {
  it('troca a senha: 204, a sessão atual fica, a de outro aparelho passa a 401 (ACE-26)', async () => {
    const s = await criarSessao();
    const outro = cookieDaResposta(await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha }));

    const r = await pedir(
      'POST',
      '/api/conta/senha',
      { senhaAtual: s.senha, novaSenha: SENHA_NOVA },
      { cookie: s.cookie },
    );
    expect(r.status).toBe(204);

    expect((await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie })).status).toBe(200);
    expect((await pedir('GET', '/api/sessao', undefined, { cookie: outro })).status).toBe(401);
    expect((await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha })).status).toBe(401);
    expect((await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: SENHA_NOVA })).status).toBe(200);
  });

  it('senha atual errada: 401 senha_atual_incorreta e nada muda (ACE-27)', async () => {
    const s = await criarSessao();
    const r = await pedir(
      'POST',
      '/api/conta/senha',
      { senhaAtual: 'errada-errada-1', novaSenha: SENHA_NOVA },
      { cookie: s.cookie },
    );
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'senha_atual_incorreta' } });
    expect((await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha })).status).toBe(200);
  });

  it('senha nova fora dos limites: 422', async () => {
    const s = await criarSessao();
    const r = await pedir(
      'POST',
      '/api/conta/senha',
      { senhaAtual: s.senha, novaSenha: 'curta' },
      { cookie: s.cookie },
    );
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { campos: { novaSenha: expect.any(String) } } });
  });

  it('sem sessão: 401 sessao_expirada', async () => {
    const r = await pedir('POST', '/api/conta/senha', { senhaAtual: 'x', novaSenha: SENHA_NOVA });
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
  });

  it('o log não contém as senhas (ACE-21)', async () => {
    const s = await criarSessao();
    const { log } = await capturarLog(() =>
      pedir(
        'POST',
        '/api/conta/senha',
        { senhaAtual: 'senha-errada-vazada', novaSenha: SENHA_NOVA },
        { cookie: s.cookie },
      ),
    );
    expect(log).not.toContain('senha-errada-vazada');
    expect(log).not.toContain(SENHA_NOVA);
  });
});

describe('POST /api/conta/excluir', () => {
  it('senha certa, sem ser a única admin: 204, o login seguinte dá 401 e a sessão de outro aparelho cai (ACE-28, ACE-69)', async () => {
    const s = await criarSessao(GRUPO_A);
    const outro = cookieDaResposta(await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha }));

    const r = await pedir('POST', '/api/conta/excluir', { senha: s.senha }, { cookie: s.cookie });
    expect(r.status).toBe(204);
    expect(r.headers.get('Set-Cookie') ?? '').toContain('Max-Age=0');

    expect((await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha })).status).toBe(401);
    const aparelho = await pedir('GET', '/api/sessao', undefined, { cookie: outro });
    expect(aparelho.status).toBe(401);
    expect(aparelho.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
    // O vínculo sumiu junto: a conta do grupo A não perde o dela.
    const vinculos = await noBanco(GRUPO_A.conta, (db) =>
      db.selectFrom('vinculos_admin').select('conta_id').where('grupo_id', '=', GRUPO_A.grupo).execute(),
    );
    expect(vinculos.map((v) => v.conta_id)).not.toContain(s.contaId);
  });

  it('senha errada: 401 senha_atual_incorreta e nada é apagado (ACE-30)', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/conta/excluir', { senha: 'errada-errada-1' }, { cookie: s.cookie });
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'senha_atual_incorreta' } });
    expect((await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie })).status).toBe(200);
  });

  it('única admin de um grupo: 409 unico_admin com os grupos, sem apagar nada (ACE-29)', async () => {
    const entrou = await pedir('POST', '/api/sessao/entrar', { email: ADMIN_UNICO.email, senha: ADMIN_UNICO.senha });
    expect(entrou.status).toBe(200);
    const cookie = cookieDaResposta(entrou);

    const r = await pedir('POST', '/api/conta/excluir', { senha: ADMIN_UNICO.senha }, { cookie });
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({
      erro: { codigo: 'unico_admin', grupos: [{ id: ADMIN_UNICO.grupo, nome: ADMIN_UNICO.nome }] },
    });
    expect((await pedir('GET', '/api/sessao', undefined, { cookie })).status).toBe(200);
    expect(
      (await pedir('POST', '/api/sessao/entrar', { email: ADMIN_UNICO.email, senha: ADMIN_UNICO.senha })).status,
    ).toBe(200);
  });

  it('sem sessão: 401', async () => {
    const r = await pedir('POST', '/api/conta/excluir', { senha: 'qualquer-senha-1' });
    expect(r.status).toBe(401);
  });
});

describe('bloqueio por conta após 5 falhas da senha atual (ACE-70)', () => {
  // Cada pedido sai de um IP diferente: o bloqueio é por conta, e o limitador por IP não interfere.
  let octeto = 0;
  const ipNovo = () => `10.70.${Math.floor(++octeto / 250)}.${(octeto % 250) + 1}`;
  const trocar = (cookie: string, senhaAtual: string) =>
    pedir('POST', '/api/conta/senha', { senhaAtual, novaSenha: SENHA_NOVA }, { cookie, ip: ipNovo() });
  const excluir = (cookie: string, senha: string) =>
    pedir('POST', '/api/conta/excluir', { senha }, { cookie, ip: ipNovo() });
  const BLOQUEIO = { erro: { codigo: 'bloqueado_temporariamente' } };

  it('5 falhas na troca: a troca e a exclusão com a senha certa respondem 429 e nada muda', async () => {
    const s = await criarSessao();
    for (let i = 0; i < 5; i++) expect((await trocar(s.cookie, 'errada-errada-1')).status).toBe(401);

    const troca = await trocar(s.cookie, s.senha);
    expect(troca.status).toBe(429);
    expect(troca.corpo).toMatchObject(BLOQUEIO);
    const exclusao = await excluir(s.cookie, s.senha);
    expect(exclusao.status).toBe(429);
    expect(exclusao.corpo).toMatchObject(BLOQUEIO);
    expect(exclusao.headers.get('Set-Cookie')).toBeNull();

    // A senha não mudou e a conta não foi excluída: a sessão segue válida e a senha antiga entra.
    expect((await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie })).status).toBe(200);
    expect((await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha })).status).toBe(200);
  });

  it('5 falhas na exclusão bloqueiam a exclusão e a troca da mesma conta, e não outra conta', async () => {
    const s = await criarSessao();
    const outra = await criarSessao();
    for (let i = 0; i < 5; i++) expect((await excluir(s.cookie, 'errada-errada-1')).status).toBe(401);

    expect((await excluir(s.cookie, s.senha)).corpo).toMatchObject(BLOQUEIO);
    expect((await trocar(s.cookie, s.senha)).corpo).toMatchObject(BLOQUEIO);

    expect((await trocar(outra.cookie, outra.senha)).status).toBe(204);
  });
});
