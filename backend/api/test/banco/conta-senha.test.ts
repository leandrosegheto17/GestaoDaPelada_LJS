import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioConta,
  criarLink,
  criarSessao,
  IP_HASH_1,
  novoToken,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização de `link_nova_senha`, `conta_trocar_senha` e do bloqueio da senha atual (T7;
 * ACE-23 a ACE-27, ACE-70, ACE-76). Versões vigentes: `1792844160000_conta-nova-senha-zera-falhas.sql:10`
 * e `1792843800000_conta-senha-bloqueio.sql:27-82`.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - Link de recuperação com 1 h menos 1 s de idade: troca; com 1 h mais 1 s: falso, senha intacta.
 * - Link já usado, de confirmação ou inexistente: falso.
 * - 4 falhas da senha atual e depois a certa: troca e zera as falhas. 5 falhas em 15 min: a 6.ª tentativa
 *   (mesmo com a certa) devolve nulo sem gravar falha. A 5.ª falha há mais de 15 min: livre.
 * - Conta bloqueada por 50 falhas de login: a nova senha pelo link apaga as tentativas e ela volta a entrar.
 * Nenhuma lacuna: a spec define o resultado de todos.
 */

const NOVA = 'senha nova bem longa 1';

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function novaSenha(db: pg.Client, hash: Buffer, senha = NOVA): Promise<boolean> {
  await comoAppAqui(db);
  const r = await umaLinha<{ ok: boolean }>(db, 'SELECT link_nova_senha($1, $2) AS ok', [
    hash,
    senha,
  ]);
  await comoSuper(db);
  return r.ok;
}

async function trocar(
  db: pg.Client,
  conta: string,
  atual: string,
  nova: string,
  sessaoAtual: Buffer,
): Promise<boolean | null> {
  await comoAppAqui(db, conta);
  const r = await umaLinha<{ ok: boolean | null }>(
    db,
    'SELECT conta_trocar_senha($1, $2, $3) AS ok',
    [atual, nova, sessaoAtual],
  );
  await comoSuper(db);
  return r.ok;
}

async function senhaConfere(db: pg.Client, conta: string, senha: string): Promise<boolean> {
  const r = await umaLinha<{ ok: boolean }>(
    db,
    'SELECT senha_hash = crypt($1, senha_hash) AS ok FROM contas WHERE id = $2',
    [senha, conta],
  );
  return r.ok;
}

async function entrar(db: pg.Client, email: string, senha: string): Promise<string> {
  await comoAppAqui(db);
  const r = await umaLinha<{ resultado: string }>(
    db,
    'SELECT resultado FROM conta_entrar($1, $2, $3, $4)',
    [email, senha, IP_HASH_1, novoToken().hash],
  );
  await comoSuper(db);
  return r.resultado;
}

/** Link de recuperação com a idade dada (expressão de intervalo), de validade 1 h. */
function linkComIdade(db: pg.Client, conta: string, idade: string) {
  return criarLink(db, conta, 'recuperacao', {
    criadoEm: `now() - ${idade}`,
    expiraEm: `now() - ${idade} + interval '1 hour'`,
  });
}

describe('link_nova_senha', () => {
  it('ACE-24: link válido (1 h menos 1 s) troca a senha e consome o link', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await linkComIdade(
        db,
        cenario.contaA,
        "(interval '1 hour' - interval '1 second')",
      );
      expect(await novaSenha(db, link.hash)).toBe(true);
      expect(await senhaConfere(db, cenario.contaA, NOVA)).toBe(true);
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(false);
      expect(
        await contar(db, 'SELECT 1 FROM links_conta WHERE token_hash = $1 AND usado_em = now()', [
          link.hash,
        ]),
      ).toBe(1);
    });
  });

  it('ACE-24: a nova senha encerra todas as sessões da conta e não toca as de outra', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await criarSessao(db, cenario.contaA);
      await criarSessao(db, cenario.contaA);
      await criarSessao(db, cenario.contaB);
      const link = await criarLink(db, cenario.contaA, 'recuperacao');
      expect(await novaSenha(db, link.hash)).toBe(true);
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(
        0,
      );
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaB])).toBe(
        1,
      );
    });
  });

  it('ACE-24: a nova senha confirma o e-mail de conta não confirmada', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await criarLink(db, cenario.contaNaoConfirmada, 'recuperacao');
      expect(await novaSenha(db, link.hash)).toBe(true);
      expect(await entrar(db, cenario.emailNaoConfirmada, NOVA)).toBe('ok');
    });
  });

  it('ACE-25: link vencido (1 h mais 1 s) devolve falso e a senha fica intacta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await linkComIdade(
        db,
        cenario.contaA,
        "(interval '1 hour' + interval '1 second')",
      );
      expect(await novaSenha(db, link.hash)).toBe(false);
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(true);
    });
  });

  it('ACE-25: link já usado devolve falso na segunda vez e a segunda senha não vale', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await criarLink(db, cenario.contaA, 'recuperacao');
      expect(await novaSenha(db, link.hash)).toBe(true);
      expect(await novaSenha(db, link.hash, 'outra senha qualquer')).toBe(false);
      expect(await senhaConfere(db, cenario.contaA, NOVA)).toBe(true);
    });
  });

  it('ACE-25: token inexistente ou de confirmação devolve falso, sem mexer nas sessões', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await criarSessao(db, cenario.contaA);
      const confirmacao = await criarLink(db, cenario.contaA, 'confirmacao');
      expect(await novaSenha(db, novoToken().hash)).toBe(false);
      expect(await novaSenha(db, confirmacao.hash)).toBe(false);
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(true);
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(
        1,
      );
    });
  });

  it('ACE-23: só o link mais novo vale (o pedido novo apaga o pendente)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db);
      const primeiro = novoToken();
      const segundo = novoToken();
      await db.query('SELECT * FROM link_pedir($1, $2, $3)', [
        cenario.emailA,
        'recuperacao',
        primeiro.hash,
      ]);
      await comoSuper(db);
      await db.query(`UPDATE envios_email SET enviado_em = now() - interval '61 seconds'`);
      await comoAppAqui(db);
      await db.query('SELECT * FROM link_pedir($1, $2, $3)', [
        cenario.emailA,
        'recuperacao',
        segundo.hash,
      ]);
      await comoSuper(db);
      expect(await novaSenha(db, primeiro.hash)).toBe(false);
      expect(await novaSenha(db, segundo.hash)).toBe(true);
    });
  });

  it('ACE-76: com a conta bloqueada por 50 falhas de login, a nova senha apaga as tentativas e ela entra', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await db.query(
        `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
         SELECT $1, digest('10.8.' || g::text, 'sha256'), now() - interval '1 minute', false FROM generate_series(1, 50) g`,
        [cenario.emailA],
      );
      expect(await entrar(db, cenario.emailA, cenario.senhaA)).toBe('bloqueado');
      const link = await criarLink(db, cenario.contaA, 'recuperacao');
      expect(await novaSenha(db, link.hash)).toBe(true);
      expect(
        await contar(db, 'SELECT 1 FROM tentativas_login WHERE email = $1', [cenario.emailA]),
      ).toBe(0);
      expect(await entrar(db, cenario.emailA, NOVA)).toBe('ok');
    });
  });

  it('ACE-76: a nova senha não apaga as tentativas de outro e-mail', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await db.query(
        `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso) VALUES ($1, $2, now(), false)`,
        [cenario.emailB, IP_HASH_1],
      );
      const link = await criarLink(db, cenario.contaA, 'recuperacao');
      await novaSenha(db, link.hash);
      expect(
        await contar(db, 'SELECT 1 FROM tentativas_login WHERE email = $1', [cenario.emailB]),
      ).toBe(1);
    });
  });
});

describe('conta_trocar_senha', () => {
  it('ACE-26: troca a senha, mantém a sessão do hash recebido e encerra as outras da conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await criarSessao(db, cenario.contaA);
      await criarSessao(db, cenario.contaB);
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBe(true);
      expect(await senhaConfere(db, cenario.contaA, NOVA)).toBe(true);
      const restantes = await db.query<{ token_hash: Buffer }>(
        'SELECT token_hash FROM sessoes WHERE conta_id = $1',
        [cenario.contaA],
      );
      expect(restantes.rows.map((l) => l.token_hash.toString('hex'))).toEqual([
        atual.hash.toString('hex'),
      ]);
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaB])).toBe(
        1,
      );
    });
  });

  it('ACE-27: senha atual errada devolve falso, não troca e não encerra sessões', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await criarSessao(db, cenario.contaA);
      expect(await trocar(db, cenario.contaA, 'senha errada', NOVA, atual.hash)).toBe(false);
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(true);
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaA])).toBe(
        2,
      );
      expect(
        await contar(db, 'SELECT 1 FROM falhas_senha_atual WHERE conta_id = $1', [cenario.contaA]),
      ).toBe(1);
    });
  });

  it('ACE-26: troca usa a conta da sessão (app.conta_id): a senha de A com o contexto de B não troca a de A', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const sessaoB = await criarSessao(db, cenario.contaB);
      expect(await trocar(db, cenario.contaB, cenario.senhaA, NOVA, sessaoB.hash)).toBe(false);
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(true);
      expect(await senhaConfere(db, cenario.contaB, cenario.senhaB)).toBe(true);
    });
  });

  it('ACE-27: sem conta no contexto, devolve falso', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      await comoAppAqui(db);
      const r = await umaLinha<{ ok: boolean | null }>(
        db,
        'SELECT conta_trocar_senha($1, $2, $3) AS ok',
        ['qualquer', NOVA, novoToken().hash],
      );
      expect(r.ok).toBe(false);
    });
  });
});

describe('bloqueio da senha atual', () => {
  async function falhasSenha(
    db: pg.Client,
    conta: string,
    n: number,
    atras = "interval '1 minute'",
  ): Promise<void> {
    await db.query(
      `INSERT INTO falhas_senha_atual (conta_id, momento) SELECT $1, now() - ${atras} FROM generate_series(1, $2)`,
      [conta, n],
    );
  }

  it('ACE-70: 4 falhas e depois a senha certa trocam e zeram a contagem', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await falhasSenha(db, cenario.contaA, 4);
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBe(true);
      expect(
        await contar(db, 'SELECT 1 FROM falhas_senha_atual WHERE conta_id = $1', [cenario.contaA]),
      ).toBe(0);
    });
  });

  it('ACE-70: a 5.ª falha (pela função) bloqueia a 6.ª tentativa', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await falhasSenha(db, cenario.contaA, 4);
      expect(await trocar(db, cenario.contaA, 'errada 5', NOVA, atual.hash)).toBe(false);
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBeNull();
    });
  });

  it('ACE-70: com 5 falhas em 15 min, a senha certa devolve nulo, não troca e não grava falha', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await falhasSenha(db, cenario.contaA, 5);
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBeNull();
      expect(await trocar(db, cenario.contaA, 'errada', NOVA, atual.hash)).toBeNull();
      expect(await senhaConfere(db, cenario.contaA, cenario.senhaA)).toBe(true);
      expect(
        await contar(db, 'SELECT 1 FROM falhas_senha_atual WHERE conta_id = $1', [cenario.contaA]),
      ).toBe(5);
    });
  });

  it('ACE-70: com a 5.ª falha há 15 min mais 1 s, a troca volta a funcionar', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await falhasSenha(db, cenario.contaA, 5, "(interval '15 minutes' + interval '1 second')");
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBe(true);
    });
  });

  it('ACE-70: com a 5.ª falha há 15 min menos 1 s, ainda bloqueado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const atual = await criarSessao(db, cenario.contaA);
      await falhasSenha(db, cenario.contaA, 5, "(interval '15 minutes' - interval '1 second')");
      expect(await trocar(db, cenario.contaA, cenario.senhaA, NOVA, atual.hash)).toBeNull();
    });
  });

  it('ACE-70: o bloqueio da conta A não atinge a conta B', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const sessaoB = await criarSessao(db, cenario.contaB);
      await falhasSenha(db, cenario.contaA, 5);
      expect(await trocar(db, cenario.contaB, cenario.senhaB, NOVA, sessaoB.hash)).toBe(true);
    });
  });

  it('ACE-70: falhas_senha_atual não guarda IP nem senha (só conta e momento)', async () => {
    const { db } = aberto;
    const r = await db.query<{ coluna: string }>(
      `SELECT column_name AS coluna FROM information_schema.columns WHERE table_name = 'falhas_senha_atual' ORDER BY 1`,
    );
    expect(r.rows.map((l) => l.coluna)).toEqual(['conta_id', 'id', 'momento']);
  });
});
