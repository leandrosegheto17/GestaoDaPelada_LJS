import { beforeEach, describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';

// Teto suave por conta no login, pela rota (ACE-74; SEC-CA-04, T67): com 50 senhas erradas em 1 h para o e-mail,
// vindas de muitos /64 e /48, POST /api/sessao/entrar responde 429 bloqueado_temporariamente, mesmo com a senha certa
// e de um IP novo; a resposta é a mesma para e-mail sem conta. As 50 falhas são gravadas como owner (cada uma com o
// hash de uma origem diferente), para o teste não rodar 50 bcrypts.

const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();

async function cinquentaFalhas(email: string): Promise<void> {
  await comoOwner(
    `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
     SELECT $1, digest('3fff:' || $2 || ':' || i, 'sha256'), now() - make_interval(secs => i * 30), false
       FROM generate_series(1, 50) AS i`,
    [email, crypto.randomUUID()],
  );
}

const ipNovo = () => `3fff:${Math.floor(Math.random() * 0x10000).toString(16)}::1`;

beforeEach(() => {
  remetente.mensagens.length = 0;
});

describe('POST /api/sessao/entrar com o teto por conta (ACE-74)', () => {
  it('50 falhas de origens diferentes: 429 bloqueado_temporariamente com a senha certa, sem sessão', async () => {
    const conta = await contaConfirmada();
    await cinquentaFalhas(conta.email);
    const r = await pedir('POST', '/api/sessao/entrar', { email: conta.email, senha: conta.senha }, { ip: ipNovo() });
    expect(r.status).toBe(429);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'bloqueado_temporariamente' } });
    expect(r.headers.get('Set-Cookie')).toBeNull();
  });

  it('e-mail sem conta: a mesma resposta', async () => {
    const conta = await contaConfirmada();
    await cinquentaFalhas(conta.email);
    const ninguem = `ninguem-${crypto.randomUUID()}@exemplo.com`;
    await cinquentaFalhas(ninguem);

    const comConta = await pedir(
      'POST',
      '/api/sessao/entrar',
      { email: conta.email, senha: 'outra-1' },
      { ip: ipNovo() },
    );
    const semConta = await pedir('POST', '/api/sessao/entrar', { email: ninguem, senha: 'outra-1' }, { ip: ipNovo() });
    expect(semConta.status).toBe(comConta.status);
    expect(semConta.corpo).toEqual(comConta.corpo);
    expect(semConta.status).toBe(429);
  });

  it('49 falhas: a senha certa entra', async () => {
    const conta = await contaConfirmada();
    await cinquentaFalhas(conta.email);
    await comoOwner('DELETE FROM tentativas_login WHERE id = (SELECT min(id) FROM tentativas_login WHERE email = $1)', [
      conta.email,
    ]);
    const r = await pedir('POST', '/api/sessao/entrar', { email: conta.email, senha: conta.senha }, { ip: ipNovo() });
    expect(r.status).toBe(200);
  });
});
