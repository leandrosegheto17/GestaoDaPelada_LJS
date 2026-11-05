import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente } from '../apoio/banco.ts';
import { abrirCenarioConta, IP_HASH_1, IP_HASH_2, novoToken, sha256, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização de `conta_entrar` (T5; ACE-09 a ACE-14, ACE-66). Versão vigente:
 * `1792844040000_conta-entrar-teto-conta.sql:21`, com a trava por e-mail de
 * `1792843500000_conta-entrar-e-sessao.sql:15`.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - 4.ª falha do par: ainda `invalida`; a 5.ª grava e a 6.ª tentativa é `bloqueado`.
 * - Bloqueio até 15 min depois da 5.ª: com a 5.ª há 15 min menos 1 s, bloqueado; há 15 min mais 1 s, livre.
 * - Senha certa durante o bloqueio: `bloqueado`, sem sessão e sem gravar sucesso.
 * - E-mail inexistente: `invalida` igual à senha errada, e a falha conta para o par.
 * - Outro IP sem falhas: entra, mesmo com o par do primeiro IP bloqueado (ACE-14).
 * - Falhas concorrentes do mesmo par: as duas contam (ACE-66); com 4 já gravadas, uma das duas
 *   simultâneas vê a 5.ª e é bloqueada (a trava por e-mail serializa as duas).
 * Nenhuma lacuna: a spec define o resultado de todos.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Entrada {
  resultado: string;
  conta_id: string | null;
  nome: string | null;
  bloqueado_ate: Date | null;
}

async function entrar(db: pg.Client, email: string, senha: string, ip: Buffer = IP_HASH_1, sessao = novoToken()): Promise<Entrada> {
  await comoAppAqui(db);
  const r = await umaLinha<Entrada>(db, 'SELECT * FROM conta_entrar($1, $2, $3, $4)', [email, senha, ip, sessao.hash]);
  await comoSuper(db);
  return r;
}

/** Grava `n` falhas do par, todas `atras` (expressão de intervalo) antes de agora, como superusuário. */
async function falhas(db: pg.Client, email: string, ip: Buffer, n: number, atras = "interval '1 minute'"): Promise<void> {
  for (let i = 0; i < n; i++) {
    await db.query(
      `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES ($1, $2, now() - ${atras}, false)`,
      [email, ip],
    );
  }
}

describe('conta_entrar: sucesso e sessão', () => {
  it('ACE-09: senha certa devolve ok, a conta e o nome', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await entrar(db, cenario.emailA, cenario.senhaA);
      expect(r).toEqual({ resultado: 'ok', conta_id: cenario.contaA, nome: 'Conta A', bloqueado_ate: null });
    });
  });

  it('ACE-09: o e-mail é normalizado antes de conferir (maiúsculas e espaços entram)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await entrar(db, `  ${cenario.emailA.toUpperCase()} `, cenario.senhaA);
      expect(r.resultado).toBe('ok');
    });
  });

  it('ACE-10: a sessão criada guarda o SHA-256 recebido, nunca o token, com 12 h e escopo completo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const sessao = novoToken();
      await entrar(db, cenario.emailA, cenario.senhaA, IP_HASH_1, sessao);
      const s = await umaLinha<{ conta_id: string; escopo: string; validade: string }>(
        db,
        'SELECT conta_id, escopo, (expira_em - criada_em)::text AS validade FROM sessoes WHERE token_hash = $1',
        [sessao.hash],
      );
      expect(s).toEqual({ conta_id: cenario.contaA, escopo: 'completo', validade: '12:00:00' });
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE token_hash = $1', [sessao.token])).toBe(0);
      expect(sessao.hash.equals(sha256(sessao.token))).toBe(true);
    });
  });

  it('ACE-10: tentativas_login guarda o hash do IP, nunca a senha', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await entrar(db, cenario.emailA, 'senha errada');
      const r = await db.query<{ linha: string }>('SELECT row_to_json(t)::text AS linha FROM tentativas_login t');
      expect(r.rows.map((l) => l.linha).join()).not.toContain('senha errada');
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE ip_hash = $1', [IP_HASH_1])).toBe(1);
    });
  });
});

describe('conta_entrar: recusas', () => {
  it('ACE-11: senha errada e e-mail inexistente devolvem o mesmo invalida, sem sessão', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const errada = await entrar(db, cenario.emailA, 'senha errada');
      const inexistente = await entrar(db, 'ninguem@exemplo.test', 'qualquer senha');
      const esperado = { resultado: 'invalida', conta_id: null, nome: null, bloqueado_ate: null };
      expect(errada).toEqual(esperado);
      expect(inexistente).toEqual(esperado);
      expect(await contar(db, 'SELECT 1 FROM sessoes')).toBe(0);
    });
  });

  it('ACE-11: conta excluída (anonimizada) não entra nem com a senha antiga', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await db.query('UPDATE contas SET excluida_em = now() WHERE id = $1', [cenario.contaA]);
      expect((await entrar(db, cenario.emailA, cenario.senhaA)).resultado).toBe('invalida');
    });
  });

  it('ACE-12: conta não confirmada com a senha certa devolve nao_confirmado e não cria sessão', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await entrar(db, cenario.emailNaoConfirmada, cenario.senhaNaoConfirmada);
      expect(r).toEqual({ resultado: 'nao_confirmado', conta_id: null, nome: null, bloqueado_ate: null });
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaNaoConfirmada])).toBe(0);
    });
  });

  it('ACE-12: conta não confirmada com a senha errada devolve invalida (não revela a situação)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect((await entrar(db, cenario.emailNaoConfirmada, 'senha errada')).resultado).toBe('invalida');
    });
  });
});

describe('conta_entrar: bloqueio pelo par e-mail e IP', () => {
  it('ACE-13: a 4.ª falha ainda é invalida e a tentativa seguinte (5.ª falha) também', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 3);
      expect((await entrar(db, cenario.emailA, 'errada 4')).resultado).toBe('invalida');
      expect((await entrar(db, cenario.emailA, 'errada 5')).resultado).toBe('invalida');
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE NOT sucesso')).toBe(5);
    });
  });

  it('ACE-13: depois de 5 falhas, a senha certa é bloqueada até 15 min depois da 5.ª', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5, "interval '2 minutes'");
      const r = await entrar(db, cenario.emailA, cenario.senhaA);
      const esperado = await umaLinha<{ ate: Date }>(db, `SELECT now() - interval '2 minutes' + interval '15 minutes' AS ate`);
      expect(r).toEqual({ resultado: 'bloqueado', conta_id: null, nome: null, bloqueado_ate: esperado.ate });
      expect(await contar(db, 'SELECT 1 FROM sessoes')).toBe(0);
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE sucesso')).toBe(0);
    });
  });

  it('ACE-13: tentativa bloqueada não é gravada como falha', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5);
      await entrar(db, cenario.emailA, 'errada de novo');
      expect(await contar(db, 'SELECT 1 FROM tentativas_login')).toBe(5);
    });
  });

  it('ACE-13: com a 5.ª falha há 15 min menos 1 s, ainda bloqueado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5, "(interval '15 minutes' - interval '1 second')");
      expect((await entrar(db, cenario.emailA, cenario.senhaA)).resultado).toBe('bloqueado');
    });
  });

  it('ACE-13: com a 5.ª falha há 15 min mais 1 s, a senha certa entra', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5, "(interval '15 minutes' + interval '1 second')");
      expect((await entrar(db, cenario.emailA, cenario.senhaA)).resultado).toBe('ok');
    });
  });

  it('ACE-13: 5 falhas de e-mail inexistente também bloqueiam o par (resposta igual)', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, 'ninguem@exemplo.test', IP_HASH_1, 5);
      expect((await entrar(db, 'ninguem@exemplo.test', 'qualquer')).resultado).toBe('bloqueado');
    });
  });

  it('ACE-13: um sucesso depois das falhas zera a contagem do par', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 4, "interval '3 minutes'");
      expect((await entrar(db, cenario.emailA, cenario.senhaA)).resultado).toBe('ok');
      expect((await entrar(db, cenario.emailA, 'errada')).resultado).toBe('invalida');
      expect((await entrar(db, cenario.emailA, cenario.senhaA)).resultado).toBe('ok');
    });
  });

  it('ACE-14: com o par do IP 1 bloqueado, o mesmo e-mail entra pelo IP 2', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5);
      expect((await entrar(db, cenario.emailA, cenario.senhaA, IP_HASH_1)).resultado).toBe('bloqueado');
      expect((await entrar(db, cenario.emailA, cenario.senhaA, IP_HASH_2)).resultado).toBe('ok');
    });
  });

  it('ACE-14: o bloqueio do e-mail A no IP 1 não afeta o e-mail B no mesmo IP', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await falhas(db, cenario.emailA, IP_HASH_1, 5);
      expect((await entrar(db, cenario.emailB, cenario.senhaB, IP_HASH_1)).resultado).toBe('ok');
    });
  });
});

describe('conta_entrar: concorrência', () => {
  /** Uma tentativa numa conexão própria, confirmada (COMMIT) ao fim. */
  async function tentativaConfirmada(url: string, email: string, senha: string, ip: Buffer): Promise<string> {
    return comCliente(url, async (c) => {
      await c.query('BEGIN');
      try {
        await c.query('SET LOCAL ROLE pelada_app');
        const r = await umaLinha<{ resultado: string }>(c, 'SELECT resultado FROM conta_entrar($1, $2, $3, $4)', [
          email,
          senha,
          ip,
          novoToken().hash,
        ]);
        await c.query('COMMIT');
        return r.resultado;
      } catch (erro) {
        await c.query('ROLLBACK').catch(() => undefined);
        throw erro;
      }
    });
  }

  /** Apaga, como superusuário, as tentativas que os testes de concorrência confirmaram. */
  async function limpar(email: string): Promise<void> {
    await aberto.db.query('DELETE FROM tentativas_login WHERE email = $1', [email]);
  }

  it('ACE-66: duas falhas simultâneas do mesmo par gravam as duas, e a próxima tentativa é bloqueada', async () => {
    const { db, url } = aberto;
    const email = 'concorrente-1@exemplo.test';
    const ip = sha256('192.0.2.66');
    try {
      await falhas(db, email, ip, 3);
      const resultados = await Promise.all([
        tentativaConfirmada(url, email, 'errada 1', ip),
        tentativaConfirmada(url, email, 'errada 2', ip),
      ]);
      expect(resultados).toEqual(['invalida', 'invalida']);
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE email = $1 AND NOT sucesso', [email])).toBe(5);
      expect(await tentativaConfirmada(url, email, 'errada 3', ip)).toBe('bloqueado');
    } finally {
      await limpar(email);
    }
  });

  it('ACE-66: com 4 falhas gravadas, das duas simultâneas uma vê a 5.ª e é bloqueada (a trava serializa)', async () => {
    const { db, url } = aberto;
    const email = 'concorrente-2@exemplo.test';
    const ip = sha256('192.0.2.67');
    try {
      await falhas(db, email, ip, 4);
      const resultados = await Promise.all([
        tentativaConfirmada(url, email, 'errada 1', ip),
        tentativaConfirmada(url, email, 'errada 2', ip),
      ]);
      expect(resultados.sort()).toEqual(['bloqueado', 'invalida']);
      expect(await contar(db, 'SELECT 1 FROM tentativas_login WHERE email = $1', [email])).toBe(5);
    } finally {
      await limpar(email);
    }
  });
});
