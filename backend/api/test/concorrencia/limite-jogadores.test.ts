import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { conferirLimiteDeJogadores } from '../../src/aplicacao/plano/limite-jogadores.ts';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Limite de jogadores do Free com trava por grupo (planos-e-cobranca T23; PLA-16, PLA-21). Duas transações reais como
 * `pelada_app`, cada uma pelo `comDb` (o mesmo `Db` da rota), como em `concorrencia/periodos.test.ts`. G (de C) é
 * posto em `trial` desde 2026-10-01 (Free em 2026-11-20) como superusuário; o `afterAll` devolve a situação original.
 * G tem 2 ativos no cenário; cada teste completa a contagem com jogadores apagados no `afterEach`.
 *
 * Casos limite (Domínio: sim), listados antes do teste: 19 com dois cadastros simultâneos; 20 e reativar; trial com 20
 * (passa).
 *
 * Evidência da rede (registrar na T23 do tasks.md, pelo /executar): tirar o `pg_advisory_xact_lock` de
 * `conferirLimiteDeJogadores` deixa vermelho "dois cadastros simultâneos" (os dois gravam, 21 ativos).
 */

let aberto: CenarioGruposAberto;
let original: { s: string; t: string | null };
const criados: string[] = [];

const HOJE = '2026-11-20';
const PRAZO_MS = 5000;
const SEGURAR_MS = 250;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar: () => void = () => undefined;
  const promessa = new Promise<void>((ok) => {
    disparar = ok;
  });
  return { promessa, disparar };
}

async function situacao(s: string, t: string | null): Promise<void> {
  await aberto.db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1', [
    aberto.cenario.grupoG,
    s,
    t,
  ]);
}

async function ativos(): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM periodos_ativos WHERE grupo_id = $1 AND fim IS NULL',
    [aberto.cenario.grupoG],
  );
  return r.rows[0]!.n;
}

/** Completa G até `alvo` ativos, como superusuário. */
async function completarAte(alvo: number): Promise<void> {
  const { db, cenario } = aberto;
  let n = await ativos();
  while (n < alvo) {
    const r = await db.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
      [cenario.grupoG, `Completa ${n + 1}`, cenario.contaC],
    );
    const id = r.rows[0]!.id;
    criados.push(id);
    await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`, [
      id,
      cenario.grupoG,
    ]);
    n += 1;
  }
}

/** Espera a outra conexão parar na trava (advisory) em `pg_stat_activity`. */
async function esperarNaTrava(): Promise<void> {
  const limite = Date.now() + PRAZO_MS;
  while (Date.now() < limite) {
    const r = await aberto.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_stat_activity
        WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND query LIKE '%pg_advisory_xact_lock%'`,
    );
    if ((r.rows[0]?.n ?? 0) > 0) return;
    await esperar(20);
  }
  throw new Error('a segunda transação não parou na trava');
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [aberto.cenario.grupoG],
  );
  original = r.rows[0]!;
});

beforeEach(async () => {
  await situacao('trial', '2026-10-01');
});

afterEach(async () => {
  const { db, cenario } = aberto;
  const novos = await db.query<{ id: string }>(
    `SELECT id FROM jogadores WHERE grupo_id = $1 AND apelido LIKE 'Simultâneo %'`,
    [cenario.grupoG],
  );
  const ids = [...criados, ...novos.rows.map((l) => l.id)];
  await db.query('DELETE FROM periodos_ativos WHERE jogador_id = ANY($1::uuid[])', [ids]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [ids]);
  criados.length = 0;
});

afterAll(async () => {
  if (aberto) {
    await situacao(original.s, original.t);
    await aberto.fechar();
  }
});

const NOVO = { anoNascimento: 1995, posicao: 'meia', telefone: null, pontuacaoInicial: 0 } as const;

describe('conferirLimiteDeJogadores', () => {
  it('PLA-21: com 19 ativos, dois cadastros simultâneos terminam com 20 ativos e um 403', async () => {
    const { url, cenario } = aberto;
    await completarAte(19);
    const primeiroGravou = sinal();
    const soltar = sinal();

    const primeiro = comDb(
      url,
      cenario.contaC,
      async (db) => {
        const limite = await conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'cadastrar_jogador');
        expect(limite).toBeNull();
        const r = await jogadores.criar(db, cenario.grupoG, { ...NOVO, apelido: 'Simultâneo 1' }, HOJE);
        primeiroGravou.disparar();
        await soltar.promessa;
        return r.resultado;
      },
      { confirmar: true },
    );

    await primeiroGravou.promessa;
    const segundo = comDb(
      url,
      cenario.contaC,
      async (db) => {
        const limite = await conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'cadastrar_jogador');
        if (limite !== null) return limite;
        const r = await jogadores.criar(db, cenario.grupoG, { ...NOVO, apelido: 'Simultâneo 2' }, HOJE);
        return r.resultado;
      },
      { confirmar: true },
    );

    await esperarNaTrava();
    await esperar(SEGURAR_MS);
    soltar.disparar();

    expect(await primeiro).toBe('ok');
    expect(await segundo).toBe('limite_jogadores');
    expect(await ativos()).toBe(20);
  });

  it('PLA-16: com 20 ativos no Free, cadastrar dá limite_jogadores e nada é gravado', async () => {
    const { url, cenario } = aberto;
    await completarAte(20);
    const r = await comDb(url, cenario.contaC, (db) =>
      conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'cadastrar_jogador'),
    );
    expect(r).toBe('limite_jogadores');
    expect(await ativos()).toBe(20);
  });

  it('PLA-16: com 20 ativos no Free, reativar dá limite_jogadores e nada é gravado', async () => {
    const { url, cenario } = aberto;
    await completarAte(20);
    const r = await comDb(url, cenario.contaC, (db) =>
      conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'reativar_jogador'),
    );
    expect(r).toBe('limite_jogadores');
    expect(await ativos()).toBe(20);
  });

  it('PLA-16: com 19 ativos no Free, cadastrar passa', async () => {
    const { url, cenario } = aberto;
    await completarAte(19);
    const r = await comDb(url, cenario.contaC, (db) =>
      conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'cadastrar_jogador'),
    );
    expect(r).toBeNull();
  });

  it('PLA-16: grupo em trial válido com 20 ativos passa', async () => {
    const { url, cenario } = aberto;
    await situacao('trial', '2026-11-10');
    await completarAte(20);
    const r = await comDb(url, cenario.contaC, (db) =>
      conferirLimiteDeJogadores(db, cenario.grupoG, HOJE, 'reativar_jogador'),
    );
    expect(r).toBeNull();
  });
});
