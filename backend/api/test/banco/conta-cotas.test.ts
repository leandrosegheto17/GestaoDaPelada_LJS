import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente } from '../apoio/banco.ts';
import {
  abrirCenarioConta,
  novoToken,
  sha256,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização das cotas de e-mail (T10; ACE-72, ACE-73, ACE-75). Versões vigentes:
 * `1792843860000_conta-teto-emails.sql:26,43`, `1792844100000_conta-cota-trava.sql:7`,
 * `1792843980000_conta-teto-emails-origem.sql:27,50` e `1792843920000_conta-esqueci-nao-confirmada.sql:9`.
 * O teto de cada categoria (80% ou 100% de `LIMITE_EMAILS_DIA`) é escolhido pela API (T24); aqui,
 * com `LIMITE_EMAILS_DIA` = 100, o teto 80 é o de cadastro, reenvio e convite e o 100 o de recuperação.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - Teto 80: o 80.º e-mail do dia sai, o 81.º não. Teto 100: o 100.º sai, o 101.º não; o contador é um só.
 * - Virada do dia em São Paulo: 23:59:59 conta no dia; 00:00:00 começa outro contador.
 * - Teto 0 (ou nulo, na origem): nada sai.
 * - Origem: o 20.º pedido da mesma chave em 1 h passa, o 21.º não; pedido de exatamente 1 h atrás não conta;
 *   outra chave segue livre.
 * - Trava do contador segurada por 2,5 s por outra transação: a reserva falha com 55P03 em cerca de 2 s.
 * - "Esqueci a senha" de conta não confirmada: `confirmada` falso (a API usa a cota de cadastro); sem conta: não envia.
 * Nenhuma lacuna: a spec define o resultado de todos.
 */

const DIA = '2026-11-05';

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function reservarEm(db: pg.Client, momento: string, teto: number): Promise<boolean> {
  const r = await umaLinha<{ ok: boolean }>(
    db,
    'SELECT email_cota_reservar_em($1::timestamptz, $2) AS ok',
    [momento, teto],
  );
  return r.ok;
}

async function totalDoDia(db: pg.Client, dia: string): Promise<number | null> {
  const r = await db.query<{ total: number }>('SELECT total FROM envios_email_dia WHERE dia = $1', [
    dia,
  ]);
  return r.rows[0]?.total ?? null;
}

async function registrarEm(
  db: pg.Client,
  momento: string,
  chave: Buffer,
  teto: number | null,
): Promise<boolean> {
  const r = await umaLinha<{ ok: boolean }>(
    db,
    'SELECT email_origem_registrar_em($1::timestamptz, $2, $3) AS ok',
    [momento, chave, teto],
  );
  return r.ok;
}

describe('cota diária de e-mails', () => {
  const MEIO_DIA = `${DIA} 12:00:00-03`;

  it('ACE-72: com teto 80, o 80.º e-mail do dia sai e o 81.º não', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await db.query('INSERT INTO envios_email_dia (dia, total) VALUES ($1, 79)', [DIA]);
      expect(await reservarEm(db, MEIO_DIA, 80)).toBe(true);
      expect(await totalDoDia(db, DIA)).toBe(80);
      expect(await reservarEm(db, MEIO_DIA, 80)).toBe(false);
      expect(await totalDoDia(db, DIA)).toBe(80);
    });
  });

  it('ACE-72: com a cota de cadastro (80) esgotada, a recuperação (100) segue até o 100.º', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await db.query('INSERT INTO envios_email_dia (dia, total) VALUES ($1, 80)', [DIA]);
      expect(await reservarEm(db, MEIO_DIA, 80)).toBe(false);
      for (let i = 81; i <= 100; i++) expect(await reservarEm(db, MEIO_DIA, 100)).toBe(true);
      expect(await totalDoDia(db, DIA)).toBe(100);
      expect(await reservarEm(db, MEIO_DIA, 100)).toBe(false);
    });
  });

  it('ACE-72: o primeiro e-mail do dia cria o contador com 1', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await reservarEm(db, MEIO_DIA, 80)).toBe(true);
      expect(await totalDoDia(db, DIA)).toBe(1);
    });
  });

  it('ACE-72: 23:59:59 em São Paulo conta no dia; 00:00:00 começa o contador do dia seguinte', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await db.query('INSERT INTO envios_email_dia (dia, total) VALUES ($1, 80)', [DIA]);
      expect(await reservarEm(db, `${DIA} 23:59:59-03`, 80)).toBe(false);
      expect(await reservarEm(db, '2026-11-06 00:00:00-03', 80)).toBe(true);
      expect(await totalDoDia(db, '2026-11-06')).toBe(1);
      expect(await totalDoDia(db, DIA)).toBe(80);
    });
  });

  it('ACE-72: o dia é o de São Paulo, não o UTC (02:00 UTC ainda é o dia anterior)', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await reservarEm(db, '2026-11-06 02:00:00+00', 80)).toBe(true);
      expect(await totalDoDia(db, DIA)).toBe(1);
      expect(await totalDoDia(db, '2026-11-06')).toBeNull();
    });
  });

  it('ACE-72: teto 0 não deixa sair nenhum e-mail', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await reservarEm(db, MEIO_DIA, 0)).toBe(false);
      expect(await totalDoDia(db, DIA)).toBeNull();
    });
  });

  it('ACE-72: pelada_app reserva pela função com now() e não pela de momento explícito', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db);
      const r = await umaLinha<{ ok: boolean }>(db, 'SELECT email_cota_reservar(80) AS ok');
      expect(r.ok).toBe(true);
      await expect(db.query(`SELECT email_cota_reservar_em(now(), 80)`)).rejects.toMatchObject({
        code: '42501',
      });
    });
  });
});

describe('cota de pedidos por origem', () => {
  const AGORA = `${DIA} 12:00:00-03`;
  const CHAVE = sha256('203.0.113.0');

  async function pedidosAtras(
    db: pg.Client,
    chave: Buffer,
    n: number,
    atras: string,
  ): Promise<void> {
    await db.query(
      `INSERT INTO pedidos_email_origem (chave_hash, momento) SELECT $1, $2::timestamptz - ${atras} FROM generate_series(1, $3)`,
      [chave, AGORA, n],
    );
  }

  it('ACE-73: o 20.º pedido da mesma chave em 1 h passa e o 21.º é recusado', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await pedidosAtras(db, CHAVE, 19, "interval '30 minutes'");
      expect(await registrarEm(db, AGORA, CHAVE, 20)).toBe(true);
      expect(await registrarEm(db, AGORA, CHAVE, 20)).toBe(false);
      const r = await umaLinha<{ n: number }>(
        db,
        'SELECT count(*)::int AS n FROM pedidos_email_origem WHERE chave_hash = $1',
        [CHAVE],
      );
      expect(r.n).toBe(20);
    });
  });

  it('ACE-73: pedidos de exatamente 1 h atrás não contam (e são apagados)', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await pedidosAtras(db, CHAVE, 20, "interval '1 hour'");
      expect(await registrarEm(db, AGORA, CHAVE, 20)).toBe(true);
      const r = await umaLinha<{ n: number }>(
        db,
        'SELECT count(*)::int AS n FROM pedidos_email_origem WHERE chave_hash = $1',
        [CHAVE],
      );
      expect(r.n).toBe(1);
    });
  });

  it('ACE-73: pedidos de 59 min atrás ainda contam', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await pedidosAtras(db, CHAVE, 20, "interval '59 minutes'");
      expect(await registrarEm(db, AGORA, CHAVE, 20)).toBe(false);
    });
  });

  it('ACE-73: com uma chave no teto, outra chave segue livre', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await pedidosAtras(db, CHAVE, 20, "interval '1 minute'");
      expect(await registrarEm(db, AGORA, sha256('198.51.100.0'), 20)).toBe(true);
    });
  });

  it('ACE-73: teto nulo recusa sem gravar', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await registrarEm(db, AGORA, CHAVE, null)).toBe(false);
    });
  });

  it('ACE-73: pelada_app registra pela função com now()', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db);
      const r = await umaLinha<{ ok: boolean }>(db, 'SELECT email_origem_registrar($1, 20) AS ok', [
        CHAVE,
      ]);
      expect(r.ok).toBe(true);
    });
  });
});

describe('esqueci a senha de conta não confirmada', () => {
  async function pedir(db: pg.Client, email: string) {
    await comoAppAqui(db);
    const r = await umaLinha<{ enviar: boolean; nome: string | null; confirmada: boolean }>(
      db,
      'SELECT * FROM link_pedir_com_confirmacao($1, $2, $3)',
      [email, 'recuperacao', novoToken().hash],
    );
    await comoSuper(db);
    return r;
  }

  it('ACE-73: conta não confirmada envia a recuperação com confirmada falso (a API gasta a cota de cadastro)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect(await pedir(db, cenario.emailNaoConfirmada)).toEqual({
        enviar: true,
        nome: 'Não Confirmada',
        confirmada: false,
      });
    });
  });

  it('ACE-73: conta confirmada envia com confirmada verdadeiro (cota de recuperação)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect(await pedir(db, cenario.emailA)).toEqual({
        enviar: true,
        nome: 'Conta A',
        confirmada: true,
      });
    });
  });

  it('ACE-73: sem conta, não envia e responde confirmada falso', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await pedir(db, 'ninguem@exemplo.test')).toEqual({
        enviar: false,
        nome: null,
        confirmada: false,
      });
    });
  });
});

describe('trava do contador do dia', () => {
  it('ACE-75: com a linha do dia travada por 2,5 s, a reserva falha com 55P03 em cerca de 2 s e não conta', async () => {
    const { db, url } = aberto;
    const hoje = await umaLinha<{ dia: string }>(
      db,
      `SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date)::text AS dia`,
    );
    await db.query('INSERT INTO envios_email_dia (dia, total) VALUES ($1, 5)', [hoje.dia]);
    try {
      await comCliente(url, async (dono) => {
        await dono.query('BEGIN');
        try {
          await dono.query('UPDATE envios_email_dia SET total = total + 1 WHERE dia = $1', [
            hoje.dia,
          ]);
          const segurar = new Promise((r) => setTimeout(r, 2500));
          const inicio = Date.now();
          const tentativa = comCliente(url, async (c) => {
            await c.query('BEGIN');
            try {
              await c.query('SET LOCAL ROLE pelada_app');
              await c.query('SELECT email_cota_reservar(100)');
            } finally {
              await c.query('ROLLBACK').catch(() => undefined);
            }
          });
          await expect(tentativa).rejects.toMatchObject({ code: '55P03' });
          const decorrido = Date.now() - inicio;
          expect(decorrido).toBeGreaterThanOrEqual(1800);
          expect(decorrido).toBeLessThan(2500);
          await segurar;
        } finally {
          await dono.query('ROLLBACK');
        }
      });
      expect(await totalDoDia(db, hoje.dia)).toBe(5);
    } finally {
      await db.query('DELETE FROM envios_email_dia WHERE dia = $1', [hoje.dia]);
    }
  });

  it('ACE-75: o lock_timeout vale só dentro da função (a conexão segue sem ele)', async () => {
    const { db } = aberto;
    const r = await umaLinha<{ config: string[] }>(
      db,
      `SELECT proconfig AS config FROM pg_proc WHERE oid = 'email_cota_reservar(integer)'::regprocedure`,
    );
    expect(r.config).toContain('lock_timeout=2s');
    const conexao = await umaLinha<{ v: string }>(
      db,
      `SELECT current_setting('lock_timeout') AS v`,
    );
    expect(conexao.v).toBe('0');
  });
});
