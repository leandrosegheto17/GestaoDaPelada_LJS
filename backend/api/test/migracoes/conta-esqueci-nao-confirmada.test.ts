import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// "Esqueci a senha" de conta não confirmada gasta a cota de cadastro (ACE-73; SEC-CA-02, T65). A função nova
// link_pedir_com_confirmacao diz à rota se o e-mail da conta já foi confirmado; link_pedir continua com as mesmas
// colunas, para o Worker da versão anterior (rollback).

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

let sequencia = 0;
const novoEmail = () => `esqueci${++sequencia}@exemplo.com`;
const novoHash = () => randomBytes(32);

const cadastrar = (email: string) =>
  comoApp(cliente, {}, () =>
    cliente.query("SELECT * FROM conta_cadastrar($1, 'Pessoa Teste', 'senha-boa-1', '2026-10-28', $2)", [
      email,
      novoHash(),
    ]),
  );

const pedirComConfirmacao = (email: string, tipo: string) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query('SELECT * FROM link_pedir_com_confirmacao($1, $2, $3)', [
      email,
      tipo,
      novoHash(),
    ]);
    return rows[0];
  });

describe('link_pedir_com_confirmacao (ACE-73)', () => {
  it('conta não confirmada: envia e diz confirmada = false', async () => {
    const email = novoEmail();
    await cadastrar(email);
    expect(await pedirComConfirmacao(email, 'recuperacao')).toEqual({
      enviar: true,
      nome: 'Pessoa Teste',
      confirmada: false,
    });
  });

  it('conta confirmada: envia e diz confirmada = true', async () => {
    const email = novoEmail();
    await cadastrar(email);
    await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE email = $1', [email]);
    expect(await pedirComConfirmacao(email, 'recuperacao')).toEqual({
      enviar: true,
      nome: 'Pessoa Teste',
      confirmada: true,
    });
  });

  it('sem conta: não envia, e confirmada = false (a rota responde igual)', async () => {
    expect(await pedirComConfirmacao('ninguem@exemplo.com', 'recuperacao')).toEqual({
      enviar: false,
      nome: null,
      confirmada: false,
    });
  });

  it('link_pedir mantém as duas colunas e a mesma regra (rollback do Worker)', async () => {
    const email = novoEmail();
    await cadastrar(email);
    const r = await comoApp(cliente, {}, async () => {
      const { rows } = await cliente.query("SELECT * FROM link_pedir($1, 'recuperacao', $2)", [email, novoHash()]);
      return rows[0];
    });
    expect(r).toEqual({ enviar: true, nome: 'Pessoa Teste' });
    // Dentro dos 60 s, a função nova também respeita o intervalo (ACE-51): a regra é uma só.
    expect(await pedirComConfirmacao(email, 'recuperacao')).toEqual({
      enviar: false,
      nome: 'Pessoa Teste',
      confirmada: false,
    });
  });
});
