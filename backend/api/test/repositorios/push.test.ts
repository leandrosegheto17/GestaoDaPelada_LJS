import { sql } from 'kysely';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { push } from '../../src/infraestrutura/db/repositorios/push.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de push (notificacoes T14; NOT-05, NOT-17, NOT-45; AD-101): cada método chama a função SQL certa pelo `Db`
 * da transação (`comDb`, como `pelada_app`) e mapeia o retorno. Os contextos seguem o das rotas: slug de G sem conta
 * (rota pública), conta C (criadora de G, rota da conta) e sessão sem conta e sem slug (consumidor da fila e Cron).
 *
 * Casos limite (Domínio: não, sobre o padrão dos outros repositórios): cada retorno possível das funções
 * (`criada`, `atualizada`, `limite`, `nao_encontrado`; `ativa`, `ausente`); cancelar com e sem linha; ids de bigint como
 * texto; a criadora sem assinatura (lista vazia) e a sem criadora (`null`).
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  // Os casos que precisam de linhas confirmadas (limite) as semeiam como superusuário; aqui saem todas.
  await aberto.db.query(`DELETE FROM push_ranking WHERE endpoint LIKE '%t14-%'`);
  await aberto.db.query(`DELETE FROM push_conta WHERE endpoint LIKE '%t14-%'`);
  await aberto.db.query(`DELETE FROM avisos_cobranca WHERE id_externo LIKE 'pay_t14_%'`);
});

const EP = (n: number | string) => `https://fcm.googleapis.com/fcm/send/t14-${n}`;
const CHAVES = { p256dh: 'chave', auth: 'segredo' };

/** Roda `fn` no contexto público do slug de G (sem conta), numa transação desfeita. */
const publico = <T>(fn: (db: Db) => Promise<T>) =>
  comDb(aberto.url, null, async (db) => {
    await sql`SELECT set_config('app.slug_publico', ${aberto.cenario.slugG}, true)`.execute(db);
    return fn(db);
  });

/** Roda `fn` com a conta C (criadora de G) no contexto. */
const daConta = <T>(fn: (db: Db) => Promise<T>) => comDb(aberto.url, aberto.cenario.contaC, fn);

/** Roda `fn` sem conta e sem slug (o consumidor da fila). */
const semContexto = <T>(fn: (db: Db) => Promise<T>) => comDb(aberto.url, null, fn);

async function semear(
  tabela: 'push_ranking' | 'push_conta',
  dono: string,
  n: number,
): Promise<void> {
  const coluna = tabela === 'push_ranking' ? 'grupo_id' : 'conta_id';
  await aberto.db.query(
    `INSERT INTO ${tabela} (${coluna}, endpoint, p256dh, auth)
     SELECT $1, 'https://fcm.googleapis.com/fcm/send/t14-fixo-' || g, 'chave', 'segredo' FROM generate_series(1, $2) g`,
    [dono, n],
  );
}

describe('push do ranking (rota pública)', () => {
  it('NOT-05, NOT-07: assinarRanking devolve criada e depois atualizada', async () => {
    const r = await publico(async (db) => [
      await push.assinarRanking(db, aberto.cenario.slugG, { endpoint: EP('a'), ...CHAVES }),
      await push.assinarRanking(db, aberto.cenario.slugG, {
        endpoint: EP('a'),
        p256dh: 'outra',
        auth: 'outro',
      }),
    ]);
    expect(r).toEqual(['criada', 'atualizada']);
  });

  it('NOT-08: slug que não é o do contexto devolve nao_encontrado', async () => {
    const r = await publico((db) =>
      push.assinarRanking(db, aberto.cenario.slugB, { endpoint: EP('b'), ...CHAVES }),
    );
    expect(r).toBe('nao_encontrado');
  });

  it('NOT-10: com 200 assinaturas, a nova devolve limite', async () => {
    // A semente de G já tem 1; mais 199 chegam a 200.
    await semear('push_ranking', aberto.cenario.grupoG, 199);
    const r = await publico((db) =>
      push.assinarRanking(db, aberto.cenario.slugG, { endpoint: EP('nova'), ...CHAVES }),
    );
    expect(r).toBe('limite');
  });

  it('NOT-17: cancelarRanking devolve o mesmo resultado com ou sem linha, e o estado acompanha', async () => {
    const { slugG } = aberto.cenario;
    const r = await publico(async (db) => {
      const sem = await push.cancelarRanking(db, slugG, EP('c'), 'segredo');
      await push.assinarRanking(db, slugG, { endpoint: EP('c'), ...CHAVES });
      const antes = await push.estadoRanking(db, slugG, EP('c'), 'segredo');
      const errado = await push.estadoRanking(db, slugG, EP('c'), 'errado');
      const com = await push.cancelarRanking(db, slugG, EP('c'), 'segredo');
      const depois = await push.estadoRanking(db, slugG, EP('c'), 'segredo');
      return { sem, com, antes, errado, depois };
    });
    expect(r).toEqual({
      sem: undefined,
      com: undefined,
      antes: 'ativa',
      errado: 'ausente',
      depois: 'ausente',
    });
  });

  it('NOT-71: estadoRanking com slug de outro grupo devolve nao_encontrado', async () => {
    const r = await publico((db) =>
      push.estadoRanking(db, aberto.cenario.slugB, EP('d'), 'segredo'),
    );
    expect(r).toBe('nao_encontrado');
  });

  it('NOT-54: nenhum retorno dos métodos das rotas contém endpoint nem chaves', async () => {
    const { slugG } = aberto.cenario;
    const r = await publico(async (db) => [
      await push.assinarRanking(db, slugG, { endpoint: EP('e'), ...CHAVES }),
      await push.estadoRanking(db, slugG, EP('e'), 'segredo'),
    ]);
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('t14-');
    expect(texto).not.toContain('segredo');
    expect(texto).not.toContain('chave');
  });
});

describe('push da conta (rota da conta)', () => {
  it('NOT-45: assinarConta devolve criada e depois atualizada; estado e cancelar acompanham', async () => {
    const r = await daConta(async (db) => {
      const primeira = await push.assinarConta(db, { endpoint: EP('conta'), ...CHAVES });
      const segunda = await push.assinarConta(db, {
        endpoint: EP('conta'),
        p256dh: 'outra',
        auth: 'outro',
      });
      const estado = await push.estadoConta(db, EP('conta'), 'outro');
      const cancelou = await push.cancelarConta(db, EP('conta'), 'outro');
      const depois = await push.estadoConta(db, EP('conta'), 'outro');
      return { primeira, segunda, estado, cancelou, depois };
    });
    expect(r).toEqual({
      primeira: 'criada',
      segunda: 'atualizada',
      estado: 'ativa',
      cancelou: undefined,
      depois: 'ausente',
    });
  });

  it('NOT-17, NOT-45: cancelarConta sem linha devolve o mesmo resultado', async () => {
    expect(await daConta((db) => push.cancelarConta(db, EP('nada'), 'segredo'))).toBeUndefined();
  });

  it('AD-107: com 10 assinaturas, a nova devolve limite', async () => {
    await semear('push_conta', aberto.cenario.contaC, 10);
    const r = await daConta((db) => push.assinarConta(db, { endpoint: EP('onze'), ...CHAVES }));
    expect(r).toBe('limite');
  });

  it('NOT-45: sem conta no contexto, assinarConta lança (42501)', async () => {
    await expect(
      semContexto((db) => push.assinarConta(db, { endpoint: EP('sem'), ...CHAVES })),
    ).rejects.toThrow();
  });
});

describe('envio e limpeza (sessão sem conta e sem slug)', () => {
  it('NOT-24: envioGrupo devolve nome, slug e arquivado; grupo inexistente, null', async () => {
    const { grupoG, slugG } = aberto.cenario;
    const [achado, nulo] = await semContexto(async (db) => [
      await push.envioGrupo(db, grupoG),
      await push.envioGrupo(db, '00000000-0000-4000-8000-000000000000'),
    ]);
    expect(achado).toMatchObject({ slug: slugG, arquivado: false });
    expect(typeof achado?.nome).toBe('string');
    expect(nulo).toBeNull();
    // Entradas do planoEfetivo (T18, plano B da S-01): situação do CHECK e datas em texto AAAA-MM-DD ou nulas.
    expect(['uso_proprio', 'trial', 'ativo', 'inadimplente', 'cancelado']).toContain(
      achado?.situacaoComercial,
    );
    for (const data of [achado?.trialInicio, achado?.pagoAte]) {
      if (data !== null) expect(data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('NOT-69, NOT-29, NOT-30: loteRanking devolve ids em texto; resultadoRanking aceita e revoga só as do grupo', async () => {
    const { grupoG } = aberto.cenario;
    await semear('push_ranking', grupoG, 3);
    const r = await semContexto(async (db) => {
      const desde = new Date(Date.now() - 60_000).toISOString();
      const antes = await push.loteRanking(db, grupoG, '0', 40, desde);
      const [primeira, segunda] = antes.filter((a) => a.endpoint.includes('t14-fixo-'));
      await push.resultadoRanking(db, grupoG, [primeira?.id ?? ''], [segunda?.id ?? '']);
      const depois = await push.loteRanking(db, grupoG, '0', 40, desde);
      return { antes, depois, primeira, segunda };
    });
    expect(r.antes.every((a) => typeof a.id === 'string' && /^\d+$/.test(a.id))).toBe(true);
    const idsDepois = r.depois.map((a) => a.id);
    expect(idsDepois).not.toContain(r.primeira?.id);
    expect(idsDepois).not.toContain(r.segunda?.id);
    expect(r.depois).toHaveLength(r.antes.length - 2);
  });

  it('NOT-38, NOT-46: destinoCobranca devolve a criadora com as assinaturas (ids em texto) ou lista vazia; sem criadora, null', async () => {
    const { grupoG, contaC } = aberto.cenario;
    await aberto.db.query(
      `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, $2, 'chave', 'segredo')`,
      [contaC, EP('destino')],
    );
    const [com, nulo] = await semContexto(async (db) => [
      await push.destinoCobranca(db, grupoG),
      await push.destinoCobranca(db, '00000000-0000-4000-8000-000000000000'),
    ]);
    expect(com).toMatchObject({ contaId: contaC, grupoNome: expect.any(String) });
    expect(com?.assinaturas).toEqual([
      expect.objectContaining({ endpoint: EP('destino'), id: expect.stringMatching(/^\d+$/) }),
    ]);
    expect(nulo).toBeNull();
    await aberto.db.query(`DELETE FROM push_conta WHERE endpoint = $1`, [EP('destino')]);
    const vazio = await semContexto((db) => push.destinoCobranca(db, grupoG));
    expect(vazio?.assinaturas).toEqual([]);
  });

  it('NOT-39: registrarAviso devolve true na primeira vez da chave e false na segunda; outro tipo é outra chave', async () => {
    const { grupoG } = aberto.cenario;
    const r = await semContexto(async (db) => [
      await push.registrarAviso(db, 'pay_t14_1', 'pagamento_confirmado', grupoG),
      await push.registrarAviso(db, 'pay_t14_1', 'pagamento_confirmado', grupoG),
      await push.registrarAviso(db, 'pay_t14_1', 'pagamento_atrasado', grupoG),
    ]);
    expect(r).toEqual([true, false, true]);
  });

  it('NOT-29, NOT-30: resultadoConta aceita e revoga só as da conta', async () => {
    const { contaC, contaB } = aberto.cenario;
    const r = await aberto.db.query<{ id: string }>(
      `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
       VALUES ($1, $3, 'p', 'a'), ($1, $4, 'p', 'a'), ($2, $5, 'p', 'a') RETURNING id::text`,
      [contaC, contaB, EP('rc-1'), EP('rc-2'), EP('rc-3')],
    );
    const [c1, c2, b1] = r.rows.map((l) => l.id);
    // Confirma a transação: o resultado é lido depois, pela conexão do dono (sem confirmar, o ROLLBACK apaga o efeito).
    await comDb(
      aberto.url,
      null,
      (db) => push.resultadoConta(db, contaC, [c1 ?? ''], [c2 ?? '', b1 ?? '']),
      {
        confirmar: true,
      },
    );
    const depois = await aberto.db.query<{ id: string; aceita: boolean }>(
      `SELECT id::text, ultimo_envio_em IS NOT NULL AS aceita FROM push_conta WHERE id = ANY ($1::bigint[]) ORDER BY push_conta.id`,
      [[c1, c2, b1]],
    );
    expect(depois.rows).toEqual([
      { id: c1, aceita: true },
      { id: b1, aceita: false },
    ]);
  });

  it('NOT-56: limpar devolve as contagens apagadas', async () => {
    const { grupoG } = aberto.cenario;
    await aberto.db.query(
      `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id, enviado_em)
       VALUES ('pay_t14_velho', 'cobranca_gerada', $1, now() - interval '100 days')`,
      [grupoG],
    );
    const r = await semContexto((db) => push.limpar(db));
    expect(r).toEqual({ ranking: 0, avisos: 1 });
  });
});
