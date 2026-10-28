import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// Teto suave por conta no login (ACE-74; SEC-CA-04, AD-013, T67): 50 senhas erradas em 1 h para o mesmo e-mail,
// vindas de quaisquer IPs, bloqueiam o login dele por 10 min, sem rodar o bcrypt; a resposta é a mesma para e-mail
// sem conta; a senha certa zera a contagem só fora do bloqueio. As falhas de outros IPs são gravadas como owner, cada
// uma com o hash da chave de um /64 ou de um /48 diferente (o que o Worker grava), e o relógio é controlado movendo os
// momentos, como nos testes do bloqueio por par (ACE-13, ACE-14).
const SENHA = 'senha-certa-1';
// Passa no teste de formato bcrypt ('$2_$%'), mas o crypt recusa (custo 99): se a função rodar o bcrypt com este
// hash, a chamada falha. Prova que a tentativa bloqueada não roda o bcrypt.
const HASH_QUE_QUEBRA_O_CRYPT = '$2a$99$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01234';

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
const novoHash = () => randomBytes(32);

interface Entrada {
  resultado: string;
  conta_id: string | null;
  nome: string | null;
  bloqueado_ate: Date | null;
}

async function novaConta(): Promise<{ email: string; id: string }> {
  const email = `teto-conta${++sequencia}@exemplo.com`;
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Teto', $2, '2026-10-28', $3)",
      [email, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { email, id };
}

const entrar = (email: string, senha: string, ip = novoHash()) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<Entrada>('SELECT * FROM conta_entrar($1, $2, $3, $4)', [
      email,
      senha,
      ip,
      novoHash(),
    ]);
    return rows[0] as Entrada;
  });

/**
 * Grava `n` falhas do e-mail, uma por origem diferente (metade com a chave de um /64, metade com a de um /48, cada
 * uma num prefixo próprio), a i-ésima `minutos(i)` minutos atrás.
 */
async function falhasDeOrigensDiferentes(email: string, n: number, minutos: (i: number) => number): Promise<void> {
  for (let i = 0; i < n; i++) {
    const chave = i % 2 === 0 ? `3fff:${sequencia}:${i}:1` : `3fff:${sequencia}:${i}`;
    await cliente.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
       VALUES ($1, digest($2::text, 'sha256'), now() - make_interval(secs => $3::float8 * 60), false)`,
      [email, chave, minutos(i)],
    );
  }
}

const BLOQUEADO = { resultado: 'bloqueado', conta_id: null, nome: null };

describe('conta_entrar: teto por conta somando os IPs (ACE-74)', () => {
  it('50 falhas de /64 e /48 diferentes em 1 h bloqueiam a conta, mesmo com a senha certa de outro IP', async () => {
    const { email } = await novaConta();
    await falhasDeOrigensDiferentes(email, 50, (i) => 50 - i);
    expect(await entrar(email, SENHA)).toMatchObject(BLOQUEADO);
  });

  it('49 falhas não bloqueiam: a 50ª tentativa é avaliada (senha errada dá invalida) e a 51ª é bloqueada', async () => {
    const { email } = await novaConta();
    await falhasDeOrigensDiferentes(email, 49, (i) => 50 - i);
    expect((await entrar(email, 'senha-errada')).resultado).toBe('invalida');
    expect(await entrar(email, SENHA)).toMatchObject(BLOQUEADO);
  });

  it('49 falhas e a senha certa: entra', async () => {
    const { email, id } = await novaConta();
    await falhasDeOrigensDiferentes(email, 49, (i) => 50 - i);
    expect(await entrar(email, SENHA)).toMatchObject({ resultado: 'ok', conta_id: id });
  });

  it('o bloqueio dura 10 min depois da 50ª falha', async () => {
    const { email: ainda } = await novaConta();
    // A 50ª falha foi há 9 min 50 s: ainda bloqueado, até 10 min depois dela.
    await falhasDeOrigensDiferentes(ainda, 50, (i) => (i === 49 ? 9 + 50 / 60 : 59 - i));
    const r = await entrar(ainda, SENHA);
    expect(r).toMatchObject(BLOQUEADO);
    const { rows } = await cliente.query<{ s: number }>(
      'SELECT extract(epoch FROM $1::timestamptz - now())::float8 AS s',
      [r.bloqueado_ate],
    );
    expect(rows[0]?.s).toBeGreaterThan(0);
    expect(rows[0]?.s).toBeLessThanOrEqual(10);

    const { email: liberado, id } = await novaConta();
    // A 50ª falha foi há 10 min 10 s: liberado.
    await falhasDeOrigensDiferentes(liberado, 50, (i) => (i === 49 ? 10 + 10 / 60 : 59 - i));
    expect(await entrar(liberado, SENHA)).toMatchObject({ resultado: 'ok', conta_id: id });
  });

  it('falhas com mais de 1 h não contam: 50 falhas espalhadas por mais de 1 h não bloqueiam', async () => {
    const { email, id } = await novaConta();
    // A primeira há 70 min, as outras 49 nos últimos 49 min: na hora anterior à última, só 49.
    await falhasDeOrigensDiferentes(email, 50, (i) => (i === 0 ? 70 : 49 - i));
    expect(await entrar(email, SENHA)).toMatchObject({ resultado: 'ok', conta_id: id });
  });

  it('e-mail sem conta: a mesma resposta de bloqueio', async () => {
    const email = `ninguem-teto${++sequencia}@exemplo.com`;
    await falhasDeOrigensDiferentes(email, 50, (i) => 50 - i);
    expect(await entrar(email, 'qualquer-senha')).toMatchObject(BLOQUEADO);
  });

  it('a tentativa bloqueada não roda o bcrypt e não é gravada', async () => {
    const { email, id } = await novaConta();
    await falhasDeOrigensDiferentes(email, 50, (i) => 50 - i);
    await cliente.query('UPDATE contas SET senha_hash = $2 WHERE id = $1', [id, HASH_QUE_QUEBRA_O_CRYPT]);
    const antes = await cliente.query('SELECT count(*) AS n FROM tentativas_login WHERE email = $1', [email]);
    expect(await entrar(email, SENHA)).toMatchObject(BLOQUEADO);
    const depois = await cliente.query('SELECT count(*) AS n FROM tentativas_login WHERE email = $1', [email]);
    expect(depois.rows).toEqual(antes.rows);
  });

  it('a senha certa zera a contagem fora do bloqueio, mas não durante ele', async () => {
    const { email, id } = await novaConta();
    // 40 falhas e um acerto: as 40 deixam de contar; com mais 10, ainda não há 50 depois do acerto.
    await falhasDeOrigensDiferentes(email, 40, (i) => 50 - i);
    expect(await entrar(email, SENHA)).toMatchObject({ resultado: 'ok', conta_id: id });
    await falhasDeOrigensDiferentes(email, 10, () => 0);
    expect(await entrar(email, SENHA)).toMatchObject({ resultado: 'ok', conta_id: id });

    // Durante o bloqueio, a senha certa não entra e não zera: passados os 10 min, uma nova falha bloqueia de novo.
    const { email: outro } = await novaConta();
    // 50 falhas de 44 min atrás até agora; depois de recuar 11 min, todas seguem dentro da última hora.
    await falhasDeOrigensDiferentes(outro, 50, (i) => (49 - i) * 0.9);
    expect(await entrar(outro, SENHA)).toMatchObject(BLOQUEADO);
    await cliente.query("UPDATE tentativas_login SET momento = momento - interval '11 minutes' WHERE email = $1", [
      outro,
    ]);
    expect((await entrar(outro, 'senha-errada')).resultado).toBe('invalida');
    expect(await entrar(outro, SENHA)).toMatchObject(BLOQUEADO);
  });
});
