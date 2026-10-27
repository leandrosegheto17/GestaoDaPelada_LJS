import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as contas from '../../src/infraestrutura/db/repositorios/contas.ts';
import * as links from '../../src/infraestrutura/db/repositorios/links.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de links de conta (design C2; ACE-06 a ACE-08, ACE-23 a ACE-25, ACE-51).
const SENHA = 'senha-certa-1';

let b: BancoDeRepositorio;
let sequencia = 0;
const hash = () => randomBytes(32);

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const semConta = <T>(acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, {}, acao);

/** Conta nova (não confirmada) com o link de confirmação do cadastro. */
async function contaNova(): Promise<{ id: string; email: string; linkConfirmacao: Buffer }> {
  const email = `link${++sequencia}@exemplo.com`;
  const linkConfirmacao = hash();
  const { contaId } = await semConta((db) =>
    contas.cadastrar(db, { email, nome: 'Pessoa Link', senha: SENHA, termosVersao: 'v', tokenHash: linkConfirmacao }),
  );
  return { id: contaId, email, linkConfirmacao };
}

describe('links.pedir', () => {
  it('conta existente: enviar e o nome, e o link novo invalida o anterior do tipo (ACE-08, ACE-23)', async () => {
    const { email, linkConfirmacao } = await contaNova();
    // O cadastro acabou de enviar a confirmação: libera o intervalo de 60 s.
    await b.owner.query("UPDATE envios_email SET enviado_em = now() - interval '61 seconds'");
    const novo = hash();
    expect(await semConta((db) => links.pedir(db, email, 'confirmacao', novo))).toEqual({
      enviar: true,
      nome: 'Pessoa Link',
    });
    expect(await semConta((db) => links.confirmar(db, linkConfirmacao))).toBeNull();
  });

  it('segundo pedido em menos de 60 s: enviar falso (ACE-51)', async () => {
    const { email } = await contaNova();
    await semConta((db) => links.pedir(db, email, 'recuperacao', hash()));
    expect(await semConta((db) => links.pedir(db, email, 'recuperacao', hash()))).toEqual({
      enviar: false,
      nome: 'Pessoa Link',
    });
  });

  it('e-mail sem conta: enviar falso e sem nome (ACE-22)', async () => {
    expect(await semConta((db) => links.pedir(db, 'ninguem@exemplo.com', 'recuperacao', hash()))).toEqual({
      enviar: false,
      nome: null,
    });
  });
});

describe('links.confirmar', () => {
  // ACE-06 reescrito na T57 (SEC-CA-01): confirmar não abre sessão. Este caso esperava a sessão criada.
  it('link válido: confirma o e-mail, consome o link, devolve a conta e não cria sessão (ACE-06)', async () => {
    const { id, linkConfirmacao } = await contaNova();
    expect(await semConta((db) => links.confirmar(db, linkConfirmacao))).toBe(id);
    const conta = await b.owner.query('SELECT email_confirmado_em IS NOT NULL AS ok FROM contas WHERE id = $1', [id]);
    expect(conta.rows[0]).toEqual({ ok: true });
    const link = await b.owner.query('SELECT usado_em IS NOT NULL AS usado FROM links_conta WHERE token_hash = $1', [
      linkConfirmacao,
    ]);
    expect(link.rows).toEqual([{ usado: true }]);
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
  });

  it('link inexistente ou já usado: nulo e nenhuma sessão (ACE-07)', async () => {
    const { id, linkConfirmacao } = await contaNova();
    expect(await semConta((db) => links.confirmar(db, hash()))).toBeNull();
    await semConta((db) => links.confirmar(db, linkConfirmacao));
    expect(await semConta((db) => links.confirmar(db, linkConfirmacao))).toBeNull();
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
  });

  it('link vencido: nulo, sem confirmar o e-mail e sem sessão (ACE-07)', async () => {
    const { id, linkConfirmacao } = await contaNova();
    await b.owner.query("UPDATE links_conta SET expira_em = now() - interval '1 second' WHERE token_hash = $1", [
      linkConfirmacao,
    ]);
    expect(await semConta((db) => links.confirmar(db, linkConfirmacao))).toBeNull();
    const conta = await b.owner.query('SELECT email_confirmado_em IS NULL AS pendente FROM contas WHERE id = $1', [id]);
    expect(conta.rows[0]).toEqual({ pendente: true });
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
  });
});

describe('links.novaSenha', () => {
  it('link de recuperação válido: true, a senha nova entra e as sessões caem (ACE-24)', async () => {
    const { id, email } = await contaNova();
    await b.owner.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
    await semConta((db) => contas.entrar(db, { email, senha: SENHA, ipHash: hash(), tokenHash: hash() }));
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(1);
    const link = hash();
    await semConta((db) => links.pedir(db, email, 'recuperacao', link));
    expect(await semConta((db) => links.novaSenha(db, link, 'senha-nova-123'))).toBe(true);
    expect((await b.owner.query('SELECT 1 FROM sessoes WHERE conta_id = $1', [id])).rowCount).toBe(0);
    const entrou = await semConta((db) =>
      contas.entrar(db, { email, senha: 'senha-nova-123', ipHash: hash(), tokenHash: hash() }),
    );
    expect(entrou.resultado).toBe('ok');
  });

  it('link inválido: false e a senha não muda (ACE-25)', async () => {
    const { email, linkConfirmacao } = await contaNova();
    await b.owner.query('UPDATE contas SET email_confirmado_em = now() WHERE email = $1', [email]);
    // O link de confirmação não serve para trocar a senha; um token qualquer também não.
    expect(await semConta((db) => links.novaSenha(db, linkConfirmacao, 'senha-nova-123'))).toBe(false);
    expect(await semConta((db) => links.novaSenha(db, hash(), 'senha-nova-123'))).toBe(false);
    const entrou = await semConta((db) =>
      contas.entrar(db, { email, senha: SENHA, ipHash: hash(), tokenHash: hash() }),
    );
    expect(entrou.resultado).toBe('ok');
  });
});
