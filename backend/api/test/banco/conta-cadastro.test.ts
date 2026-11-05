import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioConta, criarLink, novoToken, sha256, type CenarioContaAberto } from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização de `conta_cadastrar`, `link_pedir` e `link_confirmar` como `pelada_app` (T4;
 * ACE-01, ACE-04 a ACE-08, ACE-23, ACE-51). Versões vigentes:
 * `1792843440000_conta-cadastro-e-links.sql:11,29`, `1792843920000_conta-esqueci-nao-confirmada.sql:47`
 * e `1792843740000_conta-confirmar-sem-sessao.sql:9`.
 */

const VERSAO_TERMOS = '2026-11-01';

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Cadastro {
  situacao: string;
  conta_id: string;
  enviar: boolean;
}

async function cadastrar(db: pg.Client, email: string, nome = 'Pessoa Nova', senha = 'senha nova 12345'): Promise<Cadastro> {
  await comoAppAqui(db);
  const token = novoToken();
  const r = await umaLinha<Cadastro>(db, 'SELECT * FROM conta_cadastrar($1, $2, $3, $4, $5)', [
    email,
    nome,
    senha,
    VERSAO_TERMOS,
    token.hash,
  ]);
  await comoSuper(db);
  return r;
}

async function pedirLink(db: pg.Client, email: string, tipo: 'confirmacao' | 'recuperacao') {
  await comoAppAqui(db);
  const token = novoToken();
  const r = await umaLinha<{ enviar: boolean; nome: string | null }>(db, 'SELECT * FROM link_pedir($1, $2, $3)', [
    email,
    tipo,
    token.hash,
  ]);
  await comoSuper(db);
  return { ...r, token };
}

async function confirmar(db: pg.Client, hash: Buffer): Promise<string | null> {
  await comoAppAqui(db);
  const r = await umaLinha<{ conta: string | null }>(db, 'SELECT link_confirmar($1, $2) AS conta', [hash, novoToken().hash]);
  await comoSuper(db);
  return r.conta;
}

/** Recua o último envio do tipo para o e-mail, simulando que `segundos` se passaram. */
async function recuarEnvio(db: pg.Client, email: string, tipo: string, segundos: number): Promise<void> {
  await db.query(
    `UPDATE envios_email SET enviado_em = now() - make_interval(secs => $3) WHERE destino_hash = $1 AND tipo = $2`,
    [sha256(email), tipo, segundos],
  );
}

describe('conta_cadastrar', () => {
  it('ACE-01: e-mail novo cria conta não confirmada, com termos e link de confirmação de 24 h', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      const r = await cadastrar(db, 'nova@exemplo.test');
      expect(r).toMatchObject({ situacao: 'nova', enviar: true });
      const conta = await umaLinha<{ email_confirmado_em: Date | null; termos_versao: string; termos_ok: boolean; bcrypt: boolean }>(
        db,
        `SELECT email_confirmado_em, termos_versao, termos_aceitos_em = now() AS termos_ok,
                senha_hash LIKE '$2_$12$%' AS bcrypt
           FROM contas WHERE id = $1`,
        [r.conta_id],
      );
      expect(conta).toEqual({ email_confirmado_em: null, termos_versao: VERSAO_TERMOS, termos_ok: true, bcrypt: true });
      const link = await umaLinha<{ tipo: string; validade: string }>(
        db,
        `SELECT tipo, (expira_em - criado_em)::text AS validade FROM links_conta WHERE conta_id = $1`,
        [r.conta_id],
      );
      expect(link).toEqual({ tipo: 'confirmacao', validade: '1 day' });
    });
  });

  it('ACE-01: o cadastro não cria sessão', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      const r = await cadastrar(db, 'sem-sessao@exemplo.test');
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [r.conta_id])).toBe(0);
    });
  });

  it('ACE-04: e-mail já existente devolve existente e não altera a conta', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const antes = await umaLinha(db, 'SELECT nome, senha_hash, termos_versao FROM contas WHERE id = $1', [cenario.contaA]);
      const r = await cadastrar(db, cenario.emailA, 'Outro Nome', 'outra senha 999');
      expect(r).toMatchObject({ situacao: 'existente', conta_id: cenario.contaA, enviar: true });
      const depois = await umaLinha(db, 'SELECT nome, senha_hash, termos_versao FROM contas WHERE id = $1', [cenario.contaA]);
      expect(depois).toEqual(antes);
      expect(await contar(db, `SELECT 1 FROM links_conta WHERE conta_id = $1`, [cenario.contaA])).toBe(0);
    });
  });

  it('ACE-04: o aviso ao dono do e-mail existente respeita os 60 s (segundo cadastro não envia)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect((await cadastrar(db, cenario.emailB)).enviar).toBe(true);
      expect((await cadastrar(db, cenario.emailB)).enviar).toBe(false);
    });
  });

  it('ACE-05: e-mail com maiúsculas e espaços é gravado em minúsculas e sem espaços', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      const r = await cadastrar(db, '  Pessoa.Nova@Exemplo.TEST ');
      const conta = await umaLinha<{ email: string }>(db, 'SELECT email FROM contas WHERE id = $1', [r.conta_id]);
      expect(conta.email).toBe('pessoa.nova@exemplo.test');
    });
  });

  it('ACE-05: e-mail que só difere em caixa e espaços do de uma conta é o mesmo (existente)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await cadastrar(db, `  ${cenario.emailA.toUpperCase()}  `);
      expect(r).toMatchObject({ situacao: 'existente', conta_id: cenario.contaA });
      expect(await contar(db, 'SELECT 1 FROM contas WHERE lower(email) = $1', [cenario.emailA])).toBe(1);
    });
  });
});

describe('link_confirmar', () => {
  /** Cria um link de confirmação para a conta não confirmada, com a validade restante em segundos. */
  async function linkComRestante(db: pg.Client, conta: string, segundos: number) {
    return criarLink(db, conta, 'confirmacao', {
      criadoEm: `now() - interval '24 hours' + make_interval(secs => ${segundos})`,
      expiraEm: `now() + make_interval(secs => ${segundos})`,
    });
  }

  it('ACE-06: link dentro das 24 h (falta 1 s) confirma o e-mail e não cria sessão', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await linkComRestante(db, cenario.contaNaoConfirmada, 1);
      expect(await confirmar(db, link.hash)).toBe(cenario.contaNaoConfirmada);
      const conta = await umaLinha<{ ok: boolean }>(db, 'SELECT email_confirmado_em = now() AS ok FROM contas WHERE id = $1', [
        cenario.contaNaoConfirmada,
      ]);
      expect(conta.ok).toBe(true);
      expect(await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1', [cenario.contaNaoConfirmada])).toBe(0);
      expect(
        await contar(db, 'SELECT 1 FROM links_conta WHERE token_hash = $1 AND usado_em IS NOT NULL', [link.hash]),
      ).toBe(1);
    });
  });

  it('ACE-07: link vencido há 1 s (24 h + 1 s) devolve nulo e não confirma', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await linkComRestante(db, cenario.contaNaoConfirmada, -1);
      expect(await confirmar(db, link.hash)).toBeNull();
      expect(await contar(db, 'SELECT 1 FROM contas WHERE id = $1 AND email_confirmado_em IS NULL', [cenario.contaNaoConfirmada])).toBe(1);
    });
  });

  it('ACE-07: link na borda exata das 24 h (expira_em = now()) devolve nulo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await linkComRestante(db, cenario.contaNaoConfirmada, 0);
      expect(await confirmar(db, link.hash)).toBeNull();
    });
  });

  it('ACE-07: link já usado devolve nulo na segunda vez', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await criarLink(db, cenario.contaNaoConfirmada, 'confirmacao', { expiraEm: "now() + interval '24 hours'" });
      expect(await confirmar(db, link.hash)).toBe(cenario.contaNaoConfirmada);
      expect(await confirmar(db, link.hash)).toBeNull();
    });
  });

  it('ACE-07: token inexistente devolve nulo', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      expect(await confirmar(db, novoToken().hash)).toBeNull();
    });
  });

  it('ACE-07: link de recuperação não serve para confirmar', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const link = await criarLink(db, cenario.contaNaoConfirmada, 'recuperacao');
      expect(await confirmar(db, link.hash)).toBeNull();
    });
  });
});

describe('link_pedir e o intervalo de 60 s', () => {
  it('ACE-08: novo link de confirmação invalida o anterior', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const primeiro = await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      expect(primeiro.enviar).toBe(true);
      await recuarEnvio(db, cenario.emailNaoConfirmada, 'confirmacao', 61);
      const segundo = await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      expect(segundo.enviar).toBe(true);
      expect(await confirmar(db, primeiro.token.hash)).toBeNull();
      expect(await confirmar(db, segundo.token.hash)).toBe(cenario.contaNaoConfirmada);
    });
  });

  it('ACE-08: e-mail sem conta responde enviar falso, sem nome e sem gravar link', async () => {
    const { db } = aberto;
    await numaTransacao(db, async () => {
      const r = await pedirLink(db, 'ninguem@exemplo.test', 'confirmacao');
      expect({ enviar: r.enviar, nome: r.nome }).toEqual({ enviar: false, nome: null });
      expect(await contar(db, 'SELECT 1 FROM links_conta WHERE token_hash = $1', [r.token.hash])).toBe(0);
    });
  });

  it('ACE-08: confirmação de conta já confirmada não envia', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await pedirLink(db, cenario.emailA, 'confirmacao');
      expect(r.enviar).toBe(false);
    });
  });

  it('ACE-23: novo link de recuperação vale 1 h e invalida o anterior do mesmo tipo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const primeiro = await pedirLink(db, cenario.emailA, 'recuperacao');
      expect(primeiro.enviar).toBe(true);
      const validade = await umaLinha<{ v: string }>(
        db,
        'SELECT (expira_em - criado_em)::text AS v FROM links_conta WHERE token_hash = $1',
        [primeiro.token.hash],
      );
      expect(validade.v).toBe('01:00:00');
      await recuarEnvio(db, cenario.emailA, 'recuperacao', 60);
      const segundo = await pedirLink(db, cenario.emailA, 'recuperacao');
      expect(segundo.enviar).toBe(true);
      expect(await contar(db, 'SELECT 1 FROM links_conta WHERE token_hash = $1', [primeiro.token.hash])).toBe(0);
      expect(
        await contar(db, `SELECT 1 FROM links_conta WHERE conta_id = $1 AND tipo = 'recuperacao' AND usado_em IS NULL`, [
          cenario.contaA,
        ]),
      ).toBe(1);
    });
  });

  it('ACE-51: aos 59 s do envio anterior não envia e o link anterior continua valendo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const primeiro = await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      await recuarEnvio(db, cenario.emailNaoConfirmada, 'confirmacao', 59);
      const segundo = await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      expect(segundo.enviar).toBe(false);
      expect(await contar(db, 'SELECT 1 FROM links_conta WHERE token_hash = $1', [segundo.token.hash])).toBe(0);
      expect(await confirmar(db, primeiro.token.hash)).toBe(cenario.contaNaoConfirmada);
    });
  });

  it('ACE-51: aos 60 s exatos do envio anterior envia (borda do LJS)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      await recuarEnvio(db, cenario.emailNaoConfirmada, 'confirmacao', 60);
      expect((await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao')).enviar).toBe(true);
    });
  });

  it('ACE-51: aos 61 s do envio anterior envia', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      await recuarEnvio(db, cenario.emailNaoConfirmada, 'confirmacao', 61);
      expect((await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao')).enviar).toBe(true);
    });
  });

  it('ACE-51: o intervalo é por tipo (recuperação logo depois da confirmação envia)', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect((await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao')).enviar).toBe(true);
      expect((await pedirLink(db, cenario.emailNaoConfirmada, 'recuperacao')).enviar).toBe(true);
    });
  });

  it('ACE-51: envios_email guarda só o hash do destino, nunca o e-mail', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      await pedirLink(db, cenario.emailNaoConfirmada, 'confirmacao');
      const r = await umaLinha<{ destino_hash: Buffer }>(db, `SELECT destino_hash FROM envios_email WHERE tipo = 'confirmacao'`);
      expect(r.destino_hash.equals(sha256(cenario.emailNaoConfirmada))).toBe(true);
    });
  });
});
