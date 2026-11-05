import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente } from '../apoio/banco.ts';
import {
  abrirCenarioConta,
  criarConvite,
  EMAIL_SEM_VINCULO,
  novoToken,
  sha256,
  type CenarioContaAberto,
} from '../isolamento/cenario-conta.ts';
import { comoAppAqui, comoSuper, contar, numaTransacao, umaLinha } from './apoio-conta.ts';

/**
 * Caracterização dos convites de admin e da lista de admins (T9; ACE-31 a ACE-37, ACE-67).
 * Versões vigentes: `convite_criar` em `1792843620000_conta-convites.sql:13`; `convite_ler`,
 * `convite_aceitar` e `convite_cadastrar` em `1792844460000_convites-grupo-arquivado.sql:11,25,61`;
 * `admins_listar` em `1792843680000_conta-admins-listar.sql:8`.
 *
 * Casos limite (Domínio: sim), listados antes dos testes:
 * - Convite com 7 dias menos 1 s de idade: vale; com 7 dias mais 1 s: `link_invalido`.
 * - Convite usado, cancelado, inexistente ou de grupo arquivado: `link_invalido` (ler não devolve linha).
 * - Aceite por conta de outro e-mail: `convite_de_outro_email`, convite intacto. Sem sessão: `link_invalido`.
 * - Cadastro pelo convite com e-mail que já tem conta: `conta_existente`, nada criado.
 * - Conta sem vínculo (ou sem sessão) chamando `convite_criar`: `sem_vinculo`.
 * - Dois aceites simultâneos do mesmo convite: um vínculo; o segundo, `link_invalido`.
 * Nenhuma lacuna: a spec define o resultado de todos.
 */

let aberto: CenarioContaAberto;

beforeAll(async () => {
  aberto = await abrirCenarioConta();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Criado {
  resultado: string;
  convite_id: string | null;
  expira_em: Date | null;
  enviar: boolean;
}

async function criar(
  db: pg.Client,
  conta: string | null,
  grupo: string,
  email: string,
  token = novoToken(),
): Promise<Criado> {
  await comoAppAqui(db, conta);
  const r = await umaLinha<Criado>(db, 'SELECT * FROM convite_criar($1, $2, $3)', [
    grupo,
    email,
    token.hash,
  ]);
  await comoSuper(db);
  return r;
}

async function ler(db: pg.Client, hash: Buffer) {
  await comoAppAqui(db);
  const r = await db.query<{ email: string; grupo_nome: string; conta_existe: boolean }>(
    'SELECT * FROM convite_ler($1)',
    [hash],
  );
  await comoSuper(db);
  return r.rows;
}

async function aceitar(db: pg.Client, conta: string | null, hash: Buffer) {
  await comoAppAqui(db, conta);
  const r = await umaLinha<{ resultado: string; grupo_id: string | null }>(
    db,
    'SELECT * FROM convite_aceitar($1)',
    [hash],
  );
  await comoSuper(db);
  return r;
}

async function cadastrarPeloConvite(db: pg.Client, hash: Buffer, sessao = novoToken()) {
  await comoAppAqui(db);
  const r = await umaLinha<{ resultado: string; conta_id: string | null; grupo_id: string | null }>(
    db,
    'SELECT * FROM convite_cadastrar($1, $2, $3, $4, $5)',
    [hash, 'Pessoa Convidada', 'senha convidada 123', '2026-11-01', sessao.hash],
  );
  await comoSuper(db);
  return { ...r, sessao };
}

async function listar(db: pg.Client, conta: string | null, grupo: string) {
  await comoAppAqui(db, conta);
  const r = await db.query<{ id: string; nome: string; email: string; acessa_financeiro: boolean }>(
    'SELECT * FROM admins_listar($1)',
    [grupo],
  );
  await comoSuper(db);
  return r.rows;
}

/** Convite gravado com a idade dada (expressão de intervalo) e validade de 7 dias. */
function conviteComIdade(
  db: pg.Client,
  grupo: string,
  email: string,
  criadoPor: string,
  idade: string,
) {
  return criarConvite(db, grupo, email, criadoPor, {
    expiraEm: `now() - ${idade} + interval '7 days'`,
  });
}

describe('convite_criar', () => {
  it('ACE-31: admin do grupo cria convite de 7 dias, com envio e auditoria', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const token = novoToken();
      const r = await criar(
        db,
        cenario.contaA,
        cenario.grupoA,
        '  Nova.Pessoa@Exemplo.TEST ',
        token,
      );
      expect(r.resultado).toBe('ok');
      expect(r.enviar).toBe(true);
      const c = await umaLinha<{ email: string; validade: string; criado_por: string }>(
        db,
        'SELECT email, (expira_em - criado_em)::text AS validade, criado_por FROM convites_admin WHERE id = $1',
        [r.convite_id],
      );
      expect(c).toEqual({
        email: 'nova.pessoa@exemplo.test',
        validade: '7 days',
        criado_por: cenario.contaA,
      });
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE token_hash = $1', [token.hash]),
      ).toBe(1);
      expect(
        await contar(
          db,
          `SELECT 1 FROM auditoria WHERE acao = 'convidar_admin' AND entidade_id = $1 AND grupo_id = $2`,
          [r.convite_id, cenario.grupoA],
        ),
      ).toBe(1);
    });
  });

  it('ACE-31: dentro dos 60 s, o mesmo convite pendente volta sem envio e sem convite novo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const primeiro = await criar(db, cenario.contaA, cenario.grupoA, 'nova@exemplo.test');
      const segundo = await criar(db, cenario.contaA, cenario.grupoA, 'nova@exemplo.test');
      expect(segundo).toMatchObject({
        resultado: 'ok',
        convite_id: primeiro.convite_id,
        enviar: false,
      });
      expect(
        await contar(db, `SELECT 1 FROM convites_admin WHERE email = 'nova@exemplo.test'`),
      ).toBe(1);
    });
  });

  it('ACE-31: depois dos 60 s, o convite novo cancela o pendente anterior', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const primeiro = await criar(db, cenario.contaA, cenario.grupoA, 'nova@exemplo.test');
      await db.query(
        `UPDATE envios_email SET enviado_em = now() - interval '61 seconds' WHERE destino_hash = $1`,
        [sha256('nova@exemplo.test')],
      );
      const segundo = await criar(db, cenario.contaA, cenario.grupoA, 'nova@exemplo.test');
      expect(segundo.convite_id).not.toBe(primeiro.convite_id);
      expect(
        await contar(
          db,
          'SELECT 1 FROM convites_admin WHERE id = $1 AND cancelado_em IS NOT NULL',
          [primeiro.convite_id],
        ),
      ).toBe(1);
    });
  });

  it('ACE-32: e-mail de quem já é admin do grupo devolve ja_e_admin, sem convite', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const r = await criar(db, cenario.contaA, cenario.grupoA, cenario.emailA.toUpperCase());
      expect(r).toEqual({
        resultado: 'ja_e_admin',
        convite_id: null,
        expira_em: null,
        enviar: false,
      });
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE email = $1', [cenario.emailA]),
      ).toBe(0);
    });
  });

  it('ACE-32: o e-mail de admin de outro grupo pode ser convidado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect((await criar(db, cenario.contaA, cenario.grupoA, cenario.emailB)).resultado).toBe(
        'ok',
      );
    });
  });

  it('ACE-31: conta sem vínculo com o grupo, ou sem sessão, recebe sem_vinculo', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      for (const conta of [cenario.contaB, cenario.contaSemVinculo, null]) {
        expect((await criar(db, conta, cenario.grupoA, 'nova@exemplo.test')).resultado).toBe(
          'sem_vinculo',
        );
      }
      expect(
        await contar(db, `SELECT 1 FROM convites_admin WHERE email = 'nova@exemplo.test'`),
      ).toBe(0);
    });
  });
});

describe('convite_ler', () => {
  it('ACE-33: convite válido (7 dias menos 1 s) devolve e-mail, nome do grupo e se a conta existe', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const c = await conviteComIdade(
        db,
        cenario.grupoA,
        EMAIL_SEM_VINCULO,
        cenario.contaA,
        "(interval '7 days' - interval '1 second')",
      );
      expect(await ler(db, c.hash)).toEqual([
        { email: EMAIL_SEM_VINCULO, grupo_nome: 'Grupo A', conta_existe: true },
      ]);
      const novo = await criarConvite(db, cenario.grupoA, 'sem-conta@exemplo.test', cenario.contaA);
      expect((await ler(db, novo.hash))[0]?.conta_existe).toBe(false);
    });
  });

  it('ACE-36: convite vencido (7 dias mais 1 s), usado, cancelado, de grupo arquivado ou inexistente não é lido', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const vencido = await conviteComIdade(
        db,
        cenario.grupoA,
        'v@exemplo.test',
        cenario.contaA,
        "(interval '7 days' + interval '1 second')",
      );
      const usado = await criarConvite(db, cenario.grupoA, 'u@exemplo.test', cenario.contaA, {
        usadoEm: 'now()',
      });
      const cancelado = await criarConvite(db, cenario.grupoA, 'c@exemplo.test', cenario.contaA, {
        canceladoEm: 'now()',
      });
      const arquivado = await criarConvite(db, cenario.grupoB, 'a@exemplo.test', cenario.contaB);
      await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoB]);
      for (const hash of [
        vencido.hash,
        usado.hash,
        cancelado.hash,
        arquivado.hash,
        novoToken().hash,
      ]) {
        expect(await ler(db, hash)).toEqual([]);
      }
    });
  });
});

describe('convite_aceitar', () => {
  it('ACE-33: logada com o e-mail do convite, ganha o vínculo sem financeiro e o convite é usado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const c = await criarConvite(db, cenario.grupoA, EMAIL_SEM_VINCULO, cenario.contaA);
      expect(await aceitar(db, cenario.contaSemVinculo, c.hash)).toEqual({
        resultado: 'ok',
        grupo_id: cenario.grupoA,
      });
      const v = await umaLinha<{ acessa_financeiro: boolean; criado_por: string }>(
        db,
        'SELECT acessa_financeiro, criado_por FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2',
        [cenario.contaSemVinculo, cenario.grupoA],
      );
      expect(v).toEqual({ acessa_financeiro: false, criado_por: cenario.contaA });
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE id = $1 AND usado_em IS NOT NULL', [
          c.id,
        ]),
      ).toBe(1);
      expect(
        await contar(
          db,
          `SELECT 1 FROM auditoria WHERE acao = 'aceitar_convite' AND autor_conta_id = $1`,
          [cenario.contaSemVinculo],
        ),
      ).toBe(1);
    });
  });

  it('ACE-35: convite de outro e-mail devolve convite_de_outro_email e fica intacto', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const c = await criarConvite(db, cenario.grupoA, 'outra@exemplo.test', cenario.contaA);
      expect(await aceitar(db, cenario.contaSemVinculo, c.hash)).toEqual({
        resultado: 'convite_de_outro_email',
        grupo_id: null,
      });
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE id = $1 AND usado_em IS NULL', [c.id]),
      ).toBe(1);
      expect(
        await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [
          cenario.contaSemVinculo,
        ]),
      ).toBe(0);
    });
  });

  it('ACE-36: vencido, usado, cancelado, de grupo arquivado, inexistente ou sem sessão dão link_invalido', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const email = EMAIL_SEM_VINCULO;
      const vencido = await conviteComIdade(
        db,
        cenario.grupoA,
        email,
        cenario.contaA,
        "(interval '7 days' + interval '1 second')",
      );
      const usado = await criarConvite(db, cenario.grupoB, email, cenario.contaB, {
        usadoEm: 'now()',
      });
      const cancelado = await criarConvite(db, cenario.grupoB, email, cenario.contaB, {
        canceladoEm: 'now()',
      });
      for (const hash of [vencido.hash, usado.hash, cancelado.hash, novoToken().hash]) {
        expect(await aceitar(db, cenario.contaSemVinculo, hash)).toEqual({
          resultado: 'link_invalido',
          grupo_id: null,
        });
      }
      const valido = await criarConvite(db, cenario.grupoB, email, cenario.contaB);
      expect((await aceitar(db, null, valido.hash)).resultado).toBe('link_invalido');
      await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoB]);
      expect((await aceitar(db, cenario.contaSemVinculo, valido.hash)).resultado).toBe(
        'link_invalido',
      );
      expect(
        await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [
          cenario.contaSemVinculo,
        ]),
      ).toBe(0);
    });
  });
});

describe('convite_cadastrar', () => {
  it('ACE-34: sem conta, o cadastro pelo convite nasce confirmado, com termos, vínculo e sessão', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const c = await criarConvite(db, cenario.grupoA, 'convidada@exemplo.test', cenario.contaA);
      const r = await cadastrarPeloConvite(db, c.hash);
      expect(r.resultado).toBe('ok');
      expect(r.grupo_id).toBe(cenario.grupoA);
      const conta = await umaLinha<{ email: string; confirmada: boolean; termos_versao: string }>(
        db,
        'SELECT email, email_confirmado_em IS NOT NULL AS confirmada, termos_versao FROM contas WHERE id = $1',
        [r.conta_id],
      );
      expect(conta).toEqual({
        email: 'convidada@exemplo.test',
        confirmada: true,
        termos_versao: '2026-11-01',
      });
      expect(
        await contar(
          db,
          'SELECT 1 FROM vinculos_admin WHERE conta_id = $1 AND grupo_id = $2 AND NOT acessa_financeiro',
          [r.conta_id, cenario.grupoA],
        ),
      ).toBe(1);
      expect(
        await contar(db, 'SELECT 1 FROM sessoes WHERE conta_id = $1 AND token_hash = $2', [
          r.conta_id,
          r.sessao.hash,
        ]),
      ).toBe(1);
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE id = $1 AND usado_em IS NOT NULL', [
          c.id,
        ]),
      ).toBe(1);
    });
  });

  it('ACE-34: e-mail do convite que já tem conta devolve conta_existente e nada é criado', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const c = await criarConvite(db, cenario.grupoA, EMAIL_SEM_VINCULO, cenario.contaA);
      const r = await cadastrarPeloConvite(db, c.hash);
      expect(r.resultado).toBe('conta_existente');
      expect(
        await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [
          cenario.contaSemVinculo,
        ]),
      ).toBe(0);
      expect(
        await contar(db, 'SELECT 1 FROM convites_admin WHERE id = $1 AND usado_em IS NULL', [c.id]),
      ).toBe(1);
    });
  });

  it('ACE-36: cadastro por convite vencido, usado, cancelado ou inexistente dá link_invalido', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      const vencido = await conviteComIdade(
        db,
        cenario.grupoA,
        'x1@exemplo.test',
        cenario.contaA,
        "(interval '7 days' + interval '1 second')",
      );
      const usado = await criarConvite(db, cenario.grupoA, 'x2@exemplo.test', cenario.contaA, {
        usadoEm: 'now()',
      });
      const cancelado = await criarConvite(db, cenario.grupoA, 'x3@exemplo.test', cenario.contaA, {
        canceladoEm: 'now()',
      });
      for (const hash of [vencido.hash, usado.hash, cancelado.hash, novoToken().hash]) {
        expect((await cadastrarPeloConvite(db, hash)).resultado).toBe('link_invalido');
      }
      expect(await contar(db, `SELECT 1 FROM contas WHERE email LIKE 'x_@exemplo.test'`)).toBe(0);
    });
  });
});

describe('admins_listar', () => {
  it('ACE-37: a admin do grupo vê os admins com nome, e-mail e acesso ao financeiro', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect(await listar(db, cenario.contaA, cenario.grupoA)).toEqual([
        { id: cenario.contaA, nome: 'Conta A', email: cenario.emailA, acessa_financeiro: false },
      ]);
    });
  });

  it('ACE-37: sem vínculo com o grupo, ou sem sessão, a lista vem vazia', async () => {
    const { db, cenario } = aberto;
    await numaTransacao(db, async () => {
      expect(await listar(db, cenario.contaB, cenario.grupoA)).toEqual([]);
      expect(await listar(db, cenario.contaSemVinculo, cenario.grupoA)).toEqual([]);
      expect(await listar(db, null, cenario.grupoA)).toEqual([]);
    });
  });
});

describe('convite_aceitar: concorrência', () => {
  it('ACE-67: dois aceites simultâneos do mesmo convite criam um vínculo e o segundo dá link_invalido', async () => {
    const { db, url, cenario } = aberto;
    const email = 'concorrente@exemplo.test';
    const conta = await umaLinha<{ id: string }>(
      db,
      `INSERT INTO contas (email, nome, senha_hash, criada_em, email_confirmado_em) VALUES ($1, 'Concorrente', 'x', now(), now()) RETURNING id`,
      [email],
    );
    const convite = await criarConvite(db, cenario.grupoB, email, cenario.contaB);
    const aceiteConfirmado = () =>
      comCliente(url, async (c) => {
        await c.query('BEGIN');
        try {
          await c.query('SET LOCAL ROLE pelada_app');
          await c.query(`SELECT set_config('app.conta_id', $1, true)`, [conta.id]);
          const r = await umaLinha<{ resultado: string }>(
            c,
            'SELECT resultado FROM convite_aceitar($1)',
            [convite.hash],
          );
          await c.query('COMMIT');
          return r.resultado;
        } catch (erro) {
          await c.query('ROLLBACK').catch(() => undefined);
          throw erro;
        }
      });
    try {
      const resultados = await Promise.all([aceiteConfirmado(), aceiteConfirmado()]);
      expect(resultados.sort()).toEqual(['link_invalido', 'ok']);
      expect(await contar(db, 'SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [conta.id])).toBe(
        1,
      );
      expect(
        await contar(
          db,
          `SELECT 1 FROM auditoria WHERE autor_conta_id = $1 AND acao = 'aceitar_convite'`,
          [conta.id],
        ),
      ).toBe(1);
    } finally {
      await db.query('DELETE FROM auditoria WHERE autor_conta_id = $1', [conta.id]);
      await db.query('DELETE FROM vinculos_admin WHERE conta_id = $1', [conta.id]);
      await db.query('DELETE FROM convites_admin WHERE id = $1', [convite.id]);
      await db.query('DELETE FROM contas WHERE id = $1', [conta.id]);
    }
  });
});
