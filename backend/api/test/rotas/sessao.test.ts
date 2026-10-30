import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import * as contas from '../../src/infraestrutura/db/repositorios/contas.ts';
import { gerarToken, sha256 } from '../../src/infraestrutura/sessao/token.ts';
import { cenarioDeAcesso, cookieDaResposta, SENHA } from '../apoio/acesso.ts';
import { GRUPO_A } from '../apoio/cenario-dois-grupos.ts';
import { capturarLog } from '../apoio/log.ts';
import { criarSessao, noBanco } from '../apoio/sessao-worker.ts';

// Rotas de sessão: entrar, eu e sair (design C4; ACE-09 a ACE-14, ACE-17, ACE-18, ACE-21).

const { pedir } = cenarioDeAcesso();

/** Conta com o e-mail ainda não confirmado, criada pelo cadastro do banco. */
async function contaNaoConfirmada() {
  const email = `sem-confirmar-${crypto.randomUUID()}@exemplo.com`;
  const link = await gerarToken();
  await noBanco(undefined, (db) =>
    contas.cadastrar(db, { email, nome: 'Pessoa Pendente', senha: SENHA, termosVersao: 'teste', tokenHash: link.hash }),
  );
  return email;
}

describe('POST /api/sessao/entrar', () => {
  it('credenciais certas: 200 com nome e e-mail, cookie do G-09 e só o hash do token no banco (ACE-09, ACE-10)', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ nome: 'Pessoa Sessão', email: s.email });
    const cookie = r.headers.get('Set-Cookie') ?? '';
    expect(cookie).toMatch(/^__Host-sessao=[A-Za-z0-9_-]{43};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Domain');

    const token = cookieDaResposta(r).slice('__Host-sessao='.length);
    const linhas = await noBanco(s.contaId, (db) =>
      db.selectFrom('sessoes').select('token_hash').where('conta_id', '=', s.contaId).execute(),
    );
    const hashes = linhas.map((l) => Buffer.from(l.token_hash).toString('hex'));
    expect(hashes).toContain(Buffer.from(await sha256(token)).toString('hex'));
    expect(hashes).not.toContain(Buffer.from(token).toString('hex'));
  });

  it('o e-mail é tratado sem espaços e em minúsculas (ACE-05)', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/sessao/entrar', { email: `  ${s.email.toUpperCase()} `, senha: s.senha });
    expect(r.status).toBe(200);
  });

  it('e-mail que não existe e senha errada: 401 credenciais_invalidas com a mesma mensagem (ACE-11)', async () => {
    const s = await criarSessao();
    const semConta = await pedir('POST', '/api/sessao/entrar', { email: 'nao-existe@exemplo.com', senha: SENHA });
    const errada = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: 'outra-senha-1' });
    expect(semConta.status).toBe(401);
    expect(errada.status).toBe(401);
    expect(semConta.corpo).toMatchObject({ erro: { codigo: 'credenciais_invalidas' } });
    expect(errada.corpo).toEqual(semConta.corpo);
    expect(semConta.headers.get('Set-Cookie')).toBeNull();
  });

  it('senha certa com e-mail não confirmado: 403 email_nao_confirmado, sem sessão (ACE-12)', async () => {
    const email = await contaNaoConfirmada();
    const r = await pedir('POST', '/api/sessao/entrar', { email, senha: SENHA });
    expect(r.status).toBe(403);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'email_nao_confirmado' } });
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });

  it('5 falhas do par e-mail e IP bloqueiam até a senha certa: 429; outro IP é avaliado normalmente (ACE-13, ACE-14)', async () => {
    const s = await criarSessao();
    const ip = '203.0.113.7';
    for (let i = 0; i < 5; i++) {
      const falha = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: 'errada-errada' }, { ip });
      expect(falha.status).toBe(401);
    }
    const bloqueada = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha }, { ip });
    expect(bloqueada.status).toBe(429);
    expect(bloqueada.corpo).toMatchObject({ erro: { codigo: 'bloqueado_temporariamente' } });
    expect(bloqueada.headers.get('Set-Cookie')).toBeNull();

    const outroIp = await pedir(
      'POST',
      '/api/sessao/entrar',
      { email: s.email, senha: s.senha },
      { ip: '203.0.113.8' },
    );
    expect(outroIp.status).toBe(200);
  });

  it('IPv6: falhas de dois endereços do mesmo /64 somam no mesmo bloqueio; outro /64 não (ACE-71)', async () => {
    const s = await criarSessao();
    const enderecos = [
      '2001:db8:1:2::1',
      '2001:db8:1:2:aaaa::2',
      '2001:DB8:1:2::3',
      '2001:db8:1:2::4',
      '2001:db8:1:2::5',
    ];
    for (const ip of enderecos) {
      const falha = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: 'errada-errada' }, { ip });
      expect(falha.status).toBe(401);
    }
    const mesmo64 = await pedir(
      'POST',
      '/api/sessao/entrar',
      { email: s.email, senha: s.senha },
      { ip: '2001:db8:1:2:9::9' },
    );
    expect(mesmo64.status).toBe(429);
    const outro64 = await pedir(
      'POST',
      '/api/sessao/entrar',
      { email: s.email, senha: s.senha },
      { ip: '2001:db8:1:3::1' },
    );
    expect(outro64.status).toBe(200);
  });

  it('corpo fora dos limites: 422 dados_invalidos com o campo', async () => {
    const r = await pedir('POST', '/api/sessao/entrar', { email: 'nao-e-email', senha: SENHA });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { email: expect.any(String) } } });
  });

  it('o log não contém a senha nem o token, no sucesso e na falha (ACE-21, G-08)', async () => {
    const s = await criarSessao();
    const senhaSecreta = 'segredo-que-nao-pode-vazar-9';
    const { resultado, log } = await capturarLog(async () => {
      await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: senhaSecreta });
      return pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha });
    });
    expect(resultado.status).toBe(200);
    const token = cookieDaResposta(resultado).slice('__Host-sessao='.length);
    expect(log).not.toContain(senhaSecreta);
    expect(log).not.toContain(s.senha);
    expect(log).not.toContain(token);
  });
});

describe('GET /api/sessao', () => {
  it('lista a conta e os grupos com vínculo (ACE-18)', async () => {
    const s = await criarSessao(GRUPO_A);
    const r = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      id: s.contaId,
      nome: 'Pessoa Convidada',
      email: s.email,
      grupos: [{ id: GRUPO_A.grupo, nome: 'Grupo grupo-a', slug: 'grupo-a', acessaFinanceiro: false }],
    });
    expect(r.headers.get('Cache-Control')).toBe('no-store');
  });

  it('grupo arquivado que a conta criou não entra na sessão; o ativo continua (GEL-25)', async () => {
    const s = await criarSessao();
    const criar = (nome: string) =>
      noBanco(s.contaId, async (db) => {
        const { rows } = await sql<{ id: string }>`
          SELECT id FROM grupo_criar(${nome}, 'quarta', 'semanal', '20:00', ${`sessao-${crypto.randomUUID()}`},
                                     ARRAY['Passe']::text[])
        `.execute(db);
        return rows[0]?.id as string;
      });
    const ativo = await criar('Sessão Ativo');
    const arquivado = await criar('Sessão Arquivado');
    await noBanco(s.contaId, (db) =>
      db
        .updateTable('grupos')
        .set({ arquivado_em: sql<Date>`now()` })
        .where('id', '=', arquivado)
        .execute(),
    );
    const r = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect((r.corpo as { grupos: { id: string }[] }).grupos.map((g) => g.id)).toEqual([ativo]);
  });

  it('conta sem vínculo: lista vazia', async () => {
    const s = await criarSessao();
    const r = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(r.corpo).toMatchObject({ id: s.contaId, grupos: [] });
  });

  it('sem sessão: 401 sessao_expirada', async () => {
    const r = await pedir('GET', '/api/sessao');
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
  });

  it('a sessão aberta pelo entrar vale para a consulta (ciclo completo)', async () => {
    const s = await criarSessao();
    const entrou = await pedir('POST', '/api/sessao/entrar', { email: s.email, senha: s.senha });
    const r = await pedir('GET', '/api/sessao', undefined, { cookie: cookieDaResposta(entrou) });
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({ id: s.contaId, email: s.email });
  });
});

describe('POST /api/sessao/sair', () => {
  it('apaga a sessão no banco, responde 204 e vence o cookie (ACE-17)', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/sessao/sair', undefined, { cookie: s.cookie });
    expect(r.status).toBe(204);
    const cookie = r.headers.get('Set-Cookie') ?? '';
    expect(cookie.startsWith('__Host-sessao=;')).toBe(true);
    expect(cookie).toContain('Max-Age=0');

    const depois = await pedir('GET', '/api/sessao', undefined, { cookie: s.cookie });
    expect(depois.status).toBe(401);
  });

  it('só encerra a sessão do aparelho: a de outro aparelho continua', async () => {
    const a = await criarSessao();
    const outra = await pedir('POST', '/api/sessao/entrar', { email: a.email, senha: a.senha });
    await pedir('POST', '/api/sessao/sair', undefined, { cookie: a.cookie });
    const r = await pedir('GET', '/api/sessao', undefined, { cookie: cookieDaResposta(outra) });
    expect(r.status).toBe(200);
  });

  it('sem sessão: 401', async () => {
    const r = await pedir('POST', '/api/sessao/sair');
    expect(r.status).toBe(401);
  });
});
