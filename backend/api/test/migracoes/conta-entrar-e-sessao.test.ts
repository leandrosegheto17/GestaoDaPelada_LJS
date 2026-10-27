import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp } from '../apoio/como-role.ts';

// conta_entrar e sessao_tocar como pelada_app, uma transação por chamada. O relógio é controlado movendo as colunas
// de tempo como owner (ACE-11 a ACE-16, ACE-66).
const SENHA = 'senha-certa-1';

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

/** Cria a conta pelo cadastro e, se pedido, confirma o e-mail (como owner). */
async function novaConta(confirmada = true): Promise<{ email: string; id: string }> {
  const email = `entrar${++sequencia}@exemplo.com`;
  const id = await comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ conta_id: string }>(
      "SELECT conta_id FROM conta_cadastrar($1, 'Pessoa Entrar', $2, '2026-10-26', $3)",
      [email, SENHA, novoHash()],
    );
    return rows[0]?.conta_id as string;
  });
  if (confirmada) await cliente.query('UPDATE contas SET email_confirmado_em = now() WHERE id = $1', [id]);
  return { email, id };
}

async function entrar(
  email: string,
  senha: string,
  ip: Buffer,
  token = novoHash(),
  c: pg.ClientBase = cliente,
): Promise<Entrada> {
  return comoApp(c, {}, async () => {
    const { rows } = await c.query<Entrada>('SELECT * FROM conta_entrar($1, $2, $3, $4)', [email, senha, ip, token]);
    return rows[0] as Entrada;
  });
}

const tocar = (token: Buffer) =>
  comoApp(cliente, {}, async () => {
    const { rows } = await cliente.query<{ r: string | null }>('SELECT sessao_tocar($1) AS r', [token]);
    return rows[0]?.r ?? null;
  });

const sessoesDe = async (contaId: string) =>
  (
    await cliente.query<{ token_hash: Buffer; horas: number }>(
      'SELECT token_hash, (extract(epoch FROM expira_em - criada_em) / 3600)::float8 AS horas FROM sessoes WHERE conta_id = $1',
      [contaId],
    )
  ).rows;

const falhasDoPar = async (email: string, ip: Buffer) =>
  Number(
    (
      await cliente.query<{ n: string }>(
        'SELECT count(*) AS n FROM tentativas_login WHERE email = $1 AND ip_hash = $2 AND NOT sucesso',
        [email, ip],
      )
    ).rows[0]?.n,
  );

/** Move as falhas do par para o passado: a i-ésima (em ordem de gravação) recua `minutos[i]` minutos. */
async function recuarFalhas(email: string, ip: Buffer, minutos: number[]): Promise<void> {
  const { rows } = await cliente.query<{ id: string }>(
    'SELECT id FROM tentativas_login WHERE email = $1 AND ip_hash = $2 AND NOT sucesso ORDER BY id',
    [email, ip],
  );
  for (const [i, { id }] of rows.entries()) {
    await cliente.query(
      'UPDATE tentativas_login SET momento = now() - make_interval(secs => $2::float8 * 60) WHERE id = $1',
      [id, minutos[i] ?? 0],
    );
  }
}

async function errarVezes(email: string, ip: Buffer, n: number): Promise<void> {
  for (let i = 0; i < n; i++) expect((await entrar(email, 'senha-errada', ip)).resultado).toBe('invalida');
}

const INVALIDA = { resultado: 'invalida', conta_id: null, nome: null, bloqueado_ate: null };

describe('conta_entrar: credenciais (ACE-09 a ACE-12)', () => {
  it('senha certa de conta confirmada: ok, com a conta e o nome, e cria a sessão de 12 h com o hash do token', async () => {
    const { email, id } = await novaConta();
    const token = novoHash();
    expect(await entrar(` ${email.toUpperCase()}`, SENHA, novoHash(), token)).toEqual({
      resultado: 'ok',
      conta_id: id,
      nome: 'Pessoa Entrar',
      bloqueado_ate: null,
    });
    expect(await sessoesDe(id)).toEqual([{ token_hash: token, horas: 12 }]);
  });

  it('e-mail inexistente e senha errada devolvem o mesmo resultado invalida, sem sessão', async () => {
    const { email, id } = await novaConta();
    const ip = novoHash();
    expect(await entrar('nao-existe@exemplo.com', SENHA, ip)).toEqual(INVALIDA);
    expect(await entrar(email, 'senha-errada', ip)).toEqual(INVALIDA);
    expect(await sessoesDe(id)).toEqual([]);
  });

  it('conta não confirmada com a senha certa: nao_confirmado, sem sessão; com a senha errada: invalida', async () => {
    const { email, id } = await novaConta(false);
    expect(await entrar(email, SENHA, novoHash())).toEqual({
      resultado: 'nao_confirmado',
      conta_id: null,
      nome: null,
      bloqueado_ate: null,
    });
    expect(await entrar(email, 'senha-errada', novoHash())).toEqual(INVALIDA);
    expect(await sessoesDe(id)).toEqual([]);
  });

  it('conta sem hash bcrypt válido (seed antigo) responde invalida, sem erro', async () => {
    const { email } = await novaConta();
    await cliente.query("UPDATE contas SET senha_hash = '!' WHERE email = $1", [email]);
    expect(await entrar(email, '!', novoHash())).toEqual(INVALIDA);
  });
});

describe('conta_entrar: bloqueio por e-mail e IP (ACE-13, ACE-14)', () => {
  it('5 falhas do par bloqueiam esse par, mesmo com a senha certa, até 15 min depois da quinta', async () => {
    const { email, id } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 5);
    const { rows } = await cliente.query<{ ate: Date }>(
      "SELECT max(momento) + interval '15 minutes' AS ate FROM tentativas_login WHERE email = $1 AND ip_hash = $2",
      [email, ip],
    );

    const r = await entrar(email, SENHA, ip);

    expect(r).toEqual({ resultado: 'bloqueado', conta_id: null, nome: null, bloqueado_ate: rows[0]?.ate });
    expect(await sessoesDe(id)).toEqual([]);
    expect(await falhasDoPar(email, ip)).toBe(5);
  });

  it('outro IP sem falhas entra normalmente enquanto o primeiro está bloqueado', async () => {
    const { email, id } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 5);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('bloqueado');

    expect((await entrar(email, SENHA, novoHash())).resultado).toBe('ok');
    expect(await sessoesDe(id)).toHaveLength(1);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('bloqueado');
  });

  it('4 falhas não bloqueiam', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 4);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('ok');
  });

  it('ainda bloqueado 14 min depois da quinta falha; liberado 15 min depois', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 5);
    await recuarFalhas(email, ip, [14, 14, 14, 14, 14]);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('bloqueado');
    await recuarFalhas(email, ip, [15, 15, 15, 15, 15]);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('ok');
  });

  it('o prazo conta da quinta falha, mesmo quando a primeira já passou dos 15 min', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 5);
    // Primeira falha há 16 min, as outras há 12 min: as 5 couberam em 15 min e a quinta foi há 12.
    await recuarFalhas(email, ip, [16, 12, 12, 12, 12]);
    const r = await entrar(email, SENHA, ip);
    expect(r.resultado).toBe('bloqueado');
    const { rows } = await cliente.query<{ ate: Date }>(
      "SELECT max(momento) + interval '15 minutes' AS ate FROM tentativas_login WHERE email = $1 AND ip_hash = $2",
      [email, ip],
    );
    expect(r.bloqueado_ate).toEqual(rows[0]?.ate);
  });

  it('5 falhas espalhadas por mais de 15 min não bloqueiam', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 5);
    await recuarFalhas(email, ip, [40, 30, 20, 10, 1]);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('ok');
  });

  it('o sucesso do par zera a contagem', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 4);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('ok');
    await errarVezes(email, ip, 4);
    expect((await entrar(email, SENHA, ip)).resultado).toBe('ok');
  });

  it('o bloqueio vale também para e-mail sem conta (tentativa de adivinhar)', async () => {
    const ip = novoHash();
    await errarVezes('fantasma@exemplo.com', ip, 5);
    expect((await entrar('fantasma@exemplo.com', SENHA, ip)).resultado).toBe('bloqueado');
  });
});

describe('conta_entrar: concorrência (ACE-66)', () => {
  async function outraConexao(): Promise<pg.Client> {
    const c = new pg.Client({ connectionString: banco.url });
    await c.connect();
    return c;
  }

  it('duas falhas simultâneas do mesmo par contam 2', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      const rs = await Promise.all([
        entrar(email, 'errada-1', ip, novoHash(), c1),
        entrar(email, 'errada-2', ip, novoHash(), c2),
      ]);
      expect(rs.map((r) => r.resultado)).toEqual(['invalida', 'invalida']);
      expect(await falhasDoPar(email, ip)).toBe(2);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });

  it('com 4 falhas, duas tentativas erradas simultâneas: uma grava a quinta e a outra já encontra o bloqueio', async () => {
    const { email } = await novaConta();
    const ip = novoHash();
    await errarVezes(email, ip, 4);
    const [c1, c2] = [await outraConexao(), await outraConexao()];
    try {
      // A primeira fica com a transação aberta depois de errar; a segunda precisa esperar a trava do par.
      await c1.query('BEGIN');
      await c1.query('SET LOCAL ROLE pelada_app');
      const primeira = (
        await c1.query<Entrada>('SELECT * FROM conta_entrar($1, $2, $3, $4)', [email, 'errada', ip, novoHash()])
      ).rows[0];
      const segunda = entrar(email, 'errada', ip, novoHash(), c2);
      const resolvida = await Promise.race([
        segunda.then(() => true),
        new Promise((r) => setTimeout(() => r(false), 300)),
      ]);
      expect(resolvida).toBe(false);
      await c1.query('COMMIT');

      expect(primeira?.resultado).toBe('invalida');
      expect((await segunda).resultado).toBe('bloqueado');
      expect(await falhasDoPar(email, ip)).toBe(5);
    } finally {
      await Promise.all([c1.end(), c2.end()]);
    }
  });
});

describe('conta_entrar: retenção das tentativas', () => {
  it('apaga as tentativas com mais de 24 h (o hash do IP não fica guardado)', async () => {
    const ip = novoHash();
    await errarVezes('antiga@exemplo.com', ip, 1);
    await cliente.query("UPDATE tentativas_login SET momento = now() - interval '25 hours' WHERE ip_hash = $1", [ip]);
    await entrar('qualquer@exemplo.com', SENHA, novoHash());
    expect(await falhasDoPar('antiga@exemplo.com', ip)).toBe(0);
  });
});

describe('sessao_tocar (ACE-15, ACE-16)', () => {
  async function sessaoValida(): Promise<{ id: string; token: Buffer }> {
    const { email, id } = await novaConta();
    const token = novoHash();
    expect((await entrar(email, SENHA, novoHash(), token)).resultado).toBe('ok');
    return { id, token };
  }

  const existe = async (token: Buffer) =>
    (await cliente.query('SELECT 1 FROM sessoes WHERE token_hash = $1', [token])).rowCount === 1;

  it('sessão válida: devolve a conta e renova o último uso', async () => {
    const { id, token } = await sessaoValida();
    await cliente.query("UPDATE sessoes SET ultimo_uso_em = now() - interval '14 minutes' WHERE token_hash = $1", [
      token,
    ]);

    expect(await tocar(token)).toBe(id);

    const { rows } = await cliente.query<{ parada: number }>(
      'SELECT extract(epoch FROM now() - ultimo_uso_em)::float8 AS parada FROM sessoes WHERE token_hash = $1',
      [token],
    );
    expect(rows[0]?.parada).toBeLessThan(5);
  });

  it('parada há 15 min: nulo e a sessão é apagada', async () => {
    const { token } = await sessaoValida();
    await cliente.query("UPDATE sessoes SET ultimo_uso_em = now() - interval '15 minutes' WHERE token_hash = $1", [
      token,
    ]);

    expect(await tocar(token)).toBeNull();
    expect(await existe(token)).toBe(false);
  });

  it('criada há 12 h, mesmo em uso: nulo e a sessão é apagada', async () => {
    const { token } = await sessaoValida();
    await cliente.query(
      `UPDATE sessoes SET criada_em = criada_em - interval '12 hours', expira_em = expira_em - interval '12 hours',
                          ultimo_uso_em = now() - interval '1 minute'
        WHERE token_hash = $1`,
      [token],
    );

    expect(await tocar(token)).toBeNull();
    expect(await existe(token)).toBe(false);
  });

  it('criada há 11 h 59 min e em uso: ainda vale', async () => {
    const { id, token } = await sessaoValida();
    await cliente.query(
      `UPDATE sessoes SET criada_em = criada_em - interval '11 hours 59 minutes',
                          expira_em = expira_em - interval '11 hours 59 minutes'
        WHERE token_hash = $1`,
      [token],
    );
    expect(await tocar(token)).toBe(id);
  });

  it('token inexistente: nulo', async () => {
    expect(await tocar(novoHash())).toBeNull();
  });
});
