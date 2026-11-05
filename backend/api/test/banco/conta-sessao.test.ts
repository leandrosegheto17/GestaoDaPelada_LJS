import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioConta,
  criarSessao,
  novoToken,
  sha256,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização de `sessao_tocar` e do teto por conta em `conta_entrar` (T6; ACE-15, ACE-16,
 * ACE-74). Versões vigentes: `1792843500000_conta-entrar-e-sessao.sql:78` e
 * `1792844040000_conta-entrar-teto-conta.sql:21`.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - Inatividade de 14:59: válida e renovada; de 15:00 exatos: vencida, apagada e nula.
 * - Uso contínuo há 11:59 h: válida; 12 h desde a criação (`expira_em` = agora): vencida, mesmo com uso recente.
 * - Sessão de escopo antigo (`troca_de_senha`) ou token inexistente: nula.
 * - 49.ª falha da conta (de 49 IPs): a 50.ª ainda é `invalida`; a tentativa seguinte é `bloqueado` por 10 min.
 * - Bloqueio da conta com a 50.ª há 10 min menos 1 s: bloqueado; há 10 min mais 1 s: livre.
 * - Conta inexistente com 50 falhas: o mesmo `bloqueado`. Senha certa dentro do bloqueio: não zera.
 * Nenhuma lacuna: a spec define o resultado de todos.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function tocar(db: pg.Client, hash: Buffer): Promise<string | null> {
  await comoAppAqui(db);
  const r = await umaLinha<{ conta: string | null }>(db, 'SELECT sessao_tocar($1) AS conta', [
    hash,
  ]);
  await comoSuper(db);
  return r.conta;
}

interface Entrada {
  resultado: string;
  conta_id: string | null;
  nome: string | null;
  bloqueado_ate: Date | null;
}

async function entrar(db: pg.Client, email: string, senha: string, ip: Buffer): Promise<Entrada> {
  await comoAppAqui(db);
  const r = await umaLinha<Entrada>(db, 'SELECT * FROM conta_entrar($1, $2, $3, $4)', [
    email,
    senha,
    ip,
    novoToken().hash,
  ]);
  await comoSuper(db);
  return r;
}

/** Hash de um IP diferente por índice, para as falhas não somarem no mesmo par. */
function ip(i: number): Buffer {
  return sha256(`10.0.${Math.floor(i / 250)}.${i % 250}`);
}

/** Grava `n` falhas do e-mail, cada uma de um IP diferente, todas `atras` antes de agora. */
async function falhasDaConta(
  db: pg.Client,
  email: string,
  n: number,
  atras = "interval '1 minute'",
): Promise<void> {
  await db.query(
    `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
     SELECT $1, digest('10.9.' || g::text, 'sha256'), now() - ${atras}, false FROM generate_series(1, $2) g`,
    [email, n],
  );
}

describe('sessao_tocar', () => {
  it('ACE-15: sessão parada há 14:59 é válida, devolve a conta e renova ultimo_uso_em', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, {
        criadaEm: "now() - interval '1 hour'",
        ultimoUsoEm: "now() - interval '14 minutes 59 seconds'",
        expiraEm: "now() + interval '11 hours'",
      });
      expect(await tocar(db, s.hash)).toBe(cenario.contaA);
      const r = await umaLinha<{ renovada: boolean }>(
        db,
        'SELECT ultimo_uso_em = now() AS renovada FROM sessoes WHERE token_hash = $1',
        [s.hash],
      );
      expect(r.renovada).toBe(true);
    });
  });

  it('ACE-15: sessão parada há 15:00 exatos devolve nulo e é apagada', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, {
        criadaEm: "now() - interval '1 hour'",
        ultimoUsoEm: "now() - interval '15 minutes'",
        expiraEm: "now() + interval '11 hours'",
      });
      expect(await tocar(db, s.hash)).toBeNull();
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE token_hash = $1', [s.hash])).toBe(0);
    });
  });

  it('ACE-16: sessão em uso contínuo há 11:59 h é válida', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, {
        criadaEm: "now() - interval '11 hours 59 minutes'",
        ultimoUsoEm: "now() - interval '1 minute'",
        expiraEm: "now() + interval '1 minute'",
      });
      expect(await tocar(db, s.hash)).toBe(cenario.contaA);
    });
  });

  it('ACE-16: sessão com 12 h desde a criação devolve nulo e é apagada, mesmo usada há 1 min', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, {
        criadaEm: "now() - interval '12 hours'",
        ultimoUsoEm: "now() - interval '1 minute'",
        expiraEm: 'now()',
      });
      expect(await tocar(db, s.hash)).toBeNull();
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE token_hash = $1', [s.hash])).toBe(0);
    });
  });

  it('ACE-15: a renovação não estica as 12 h (expira_em não muda)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, {
        expiraEm: "now() + interval '30 minutes'",
      });
      await tocar(db, s.hash);
      const r = await umaLinha<{ igual: boolean }>(
        db,
        `SELECT expira_em = now() + interval '30 minutes' AS igual FROM sessoes WHERE token_hash = $1`,
        [s.hash],
      );
      expect(r.igual).toBe(true);
    });
  });

  it('ACE-15: sessão de escopo troca_de_senha (legado) não vale', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const s = await criarSessao(db, cenario.contaA, { escopo: 'troca_de_senha' });
      expect(await tocar(db, s.hash)).toBeNull();
    });
  });

  it('ACE-15: token inexistente devolve nulo', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await tocar(db, novoToken().hash)).toBeNull();
    });
  });

  it('ACE-15: apagar a sessão vencida não toca as outras sessões da conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const vencida = await criarSessao(db, cenario.contaA, {
        ultimoUsoEm: "now() - interval '20 minutes'",
      });
      await criarSessao(db, cenario.contaA);
      expect(await tocar(db, vencida.hash)).toBeNull();
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(
        1,
      );
    });
  });
});

describe('conta_entrar: teto de 50 falhas por hora por conta', () => {
  it('ACE-74: com 49 falhas de 49 IPs, a 50.ª ainda é invalida e a seguinte (outro IP) é bloqueada por 10 min', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 49, "interval '5 minutes'");
      expect((await entrar(db, cenario.emailA, 'errada 50', ip(1))).resultado).toBe('invalida');
      const r = await entrar(db, cenario.emailA, 'errada 51', ip(2));
      const ate = await umaLinha<{ ate: Date }>(db, `SELECT now() + interval '10 minutes' AS ate`);
      expect(r).toEqual({
        resultado: 'bloqueado',
        conta_id: null,
        nome: null,
        bloqueado_ate: ate.ate,
      });
    });
  });

  it('ACE-74: o bloqueio da conta responde igual ao do par (mesmas colunas e resultado)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50);
      const r = await entrar(db, cenario.emailA, 'qualquer', ip(3));
      expect(Object.keys(r).sort()).toEqual(['bloqueado_ate', 'conta_id', 'nome', 'resultado']);
      expect(r.resultado).toBe('bloqueado');
      expect(r.conta_id).toBeNull();
    });
  });

  it('ACE-74: com a 50.ª falha há 10 min menos 1 s, ainda bloqueado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50, "(interval '10 minutes' - interval '1 second')");
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(4))).resultado).toBe('bloqueado');
    });
  });

  it('ACE-74: com a 50.ª falha há 10 min mais 1 s, a senha certa entra', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50, "(interval '10 minutes' + interval '1 second')");
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(5))).resultado).toBe('ok');
    });
  });

  it('ACE-74: passados os 10 min, uma nova falha bloqueia de novo (as da última hora continuam contando)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50, "interval '11 minutes'");
      expect((await entrar(db, cenario.emailA, 'errada', ip(6))).resultado).toBe('invalida');
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(7))).resultado).toBe('bloqueado');
    });
  });

  it('ACE-74: falhas de mais de 1 h não contam para o teto', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 49, "interval '61 minutes'");
      await falhasDaConta(db, cenario.emailA, 1, "interval '1 minute'");
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(8))).resultado).toBe('ok');
    });
  });

  it('ACE-74: conta inexistente com 50 falhas responde o mesmo bloqueado', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, 'ninguem@exemplo.test', 50);
      expect((await entrar(db, 'ninguem@exemplo.test', 'qualquer', ip(9))).resultado).toBe(
        'bloqueado',
      );
    });
  });

  it('ACE-74: a senha certa dentro do bloqueio não zera a contagem nem cria sessão', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50);
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(10))).resultado).toBe(
        'bloqueado',
      );
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE sucesso')).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM sessoes')).toBe(0);
      expect((await entrar(db, cenario.emailA, cenario.senhaA, ip(11))).resultado).toBe(
        'bloqueado',
      );
    });
  });

  it('ACE-74: o bloqueio da conta A não atinge a conta B', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhasDaConta(db, cenario.emailA, 50);
      expect((await entrar(db, cenario.emailB, cenario.senhaB, ip(12))).resultado).toBe('ok');
    });
  });
});
