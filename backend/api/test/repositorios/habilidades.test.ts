import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as habilidades from '../../src/infraestrutura/db/repositorios/habilidades.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de habilidades como pelada_app, sob a RLS (T46; GEL-88, GEL-89, GEL-91, GEL-92, GEL-93, GEL-96).
const DADOS_GRUPO = {
  nome: 'Pelada Habilidades',
  diaSemana: 'terca',
  frequencia: 'semanal',
  horario: '19:00',
} as const;
const INICIAIS = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const REPETIDO = { ok: false, campo: 'nome', mensagem: 'Já existe uma habilidade com esse nome.' };

let b: BancoDeRepositorio;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(conta: string, acao: (db: Db) => Promise<T>) => comDb(b.urlApp, { conta }, acao);

interface Cenario {
  conta: string;
  grupo: string;
  /** Ids das 6 habilidades iniciais, na ordem. */
  habilidades: string[];
  /** Dois jogadores do grupo. */
  jogadores: [string, string];
}

async function novoCenario(): Promise<Cenario> {
  const conta = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [conta, `${conta}@exemplo.com`],
  );
  const g = await como(conta, (db) => grupos.criar(db, DADOS_GRUPO, `hab-${randomUUID().slice(0, 8)}`));
  const { rows } = await b.owner.query<{ id: string }>(
    'SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
    [g.id],
  );
  const jogadores: string[] = [];
  for (const apelido of ['Um', 'Dois']) {
    const r = await b.owner.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
      [g.id, apelido, conta],
    );
    jogadores.push(r.rows[0]!.id);
  }
  return { conta, grupo: g.id, habilidades: rows.map((r) => r.id), jogadores: jogadores as [string, string] };
}

async function darNota(c: Cenario, jogador: string, habilidade: string, valor: number): Promise<void> {
  await b.owner.query('INSERT INTO notas (grupo_id, jogador_id, habilidade_id, valor) VALUES ($1, $2, $3, $4)', [
    c.grupo,
    jogador,
    habilidade,
    valor,
  ]);
}

const notasDe = async (grupo: string) =>
  (
    await b.owner.query<{ jogador_id: string; habilidade_id: string; valor: number }>(
      'SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id, habilidade_id',
      [grupo],
    )
  ).rows;

const nomesNoBanco = async (grupo: string) =>
  (
    await b.owner.query<{ nome: string }>('SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem', [grupo])
  ).rows.map((r) => r.nome);

const auditoriaDe = async (grupo: string, acao: string) =>
  (
    await b.owner.query<{ autor_conta_id: string; entidade: string; entidade_id: string; resumo: unknown }>(
      'SELECT autor_conta_id, entidade, entidade_id, resumo FROM auditoria WHERE grupo_id = $1 AND acao = $2',
      [grupo, acao],
    )
  ).rows;

/** Espera algum backend do banco ficar travado esperando a transação do backend `por`. */
async function esperarAlguemTravadoPor(por: number): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    const { rows } = await b.owner.query(
      'SELECT pid FROM pg_stat_activity WHERE $1::int = ANY (pg_blocking_pids(pid))',
      [por],
    );
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`ninguém chegou a esperar o backend ${por}`);
}

describe('habilidades.listar (GEL-88)', () => {
  it('na ordem de cadastro, com id e nome', async () => {
    const c = await novoCenario();
    const lista = await como(c.conta, (db) => habilidades.listar(db, c.grupo));
    expect(lista).toEqual(INICIAIS.map((nome, i) => ({ id: c.habilidades[i], nome })));
  });

  it('não traz habilidade de outro grupo', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    const lista = await como(c.conta, (db) => habilidades.listar(db, outro.grupo));
    expect(lista).toEqual([]);
  });
});

describe('habilidades.criar (GEL-89, GEL-91)', () => {
  it('nova vai ao fim da ordem', async () => {
    const c = await novoCenario();
    const r = await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'Cabeceio'));
    expect(r.ok).toBe(true);
    expect(await nomesNoBanco(c.grupo)).toEqual([...INICIAIS, 'Cabeceio']);
    const lista = await como(c.conta, (db) => habilidades.listar(db, c.grupo));
    expect(lista.at(-1)).toEqual({ id: r.ok ? r.id : '', nome: 'Cabeceio' });
  });

  it('"drible" e "DRIBLE" colidem com "Drible" (sem caixa); nada é gravado', async () => {
    const c = await novoCenario();
    expect(await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'drible'))).toEqual(REPETIDO);
    expect(await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'DRIBLE'))).toEqual(REPETIDO);
    expect(await nomesNoBanco(c.grupo)).toEqual(INICIAIS);
  });

  it('o mesmo nome em outro grupo é aceito', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'Cabeceio'));
    expect((await como(outro.conta, (db) => habilidades.criar(db, outro.grupo, 'cabeceio'))).ok).toBe(true);
  });

  it('corrida: o INSERT que passa da consulta cai no índice único e vira a mesma recusa (23505 traduzido)', async () => {
    const c = await novoCenario();
    const ocupante = new pg.Client({ connectionString: b.banco.url });
    await ocupante.connect();
    try {
      const pid = (await ocupante.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await ocupante.query('BEGIN');
      await ocupante.query("INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Corrida')", [c.grupo]);
      const pedido = como(c.conta, (db) => habilidades.criar(db, c.grupo, 'CORRIDA'));
      await esperarAlguemTravadoPor(pid);
      await ocupante.query('COMMIT');
      expect(await pedido).toEqual(REPETIDO);
    } finally {
      await ocupante.end();
    }
    expect(await nomesNoBanco(c.grupo)).toEqual([...INICIAIS, 'Corrida']);
  });
});

describe('habilidades.renomear (GEL-92, GEL-91, GEL-96)', () => {
  it('muda só o nome: notas e posição na ordem continuam', async () => {
    const c = await novoCenario();
    const drible = c.habilidades[3]!;
    await darNota(c, c.jogadores[0], drible, 8);
    await darNota(c, c.jogadores[1], drible, 4);
    const antes = await notasDe(c.grupo);
    const r = await como(c.conta, (db) => habilidades.renomear(db, c.grupo, drible, 'Drible curto'));
    expect(r).toEqual({ ok: true });
    const lista = await como(c.conta, (db) => habilidades.listar(db, c.grupo));
    expect(lista[3]).toEqual({ id: drible, nome: 'Drible curto' });
    expect(lista.map((h) => h.nome)).toEqual([
      'Visão de Jogo',
      'Passe',
      'Preparo Físico',
      'Drible curto',
      'Chute',
      'Desarme',
    ]);
    expect(await notasDe(c.grupo)).toEqual(antes);
  });

  it('nome de outra habilidade do grupo, sem caixa → recusa; nada muda', async () => {
    const c = await novoCenario();
    const r = await como(c.conta, (db) => habilidades.renomear(db, c.grupo, c.habilidades[3]!, 'chute'));
    expect(r).toEqual(REPETIDO);
    expect(await nomesNoBanco(c.grupo)).toEqual(INICIAIS);
  });

  it('trocar só a caixa do próprio nome é aceito', async () => {
    const c = await novoCenario();
    const r = await como(c.conta, (db) => habilidades.renomear(db, c.grupo, c.habilidades[3]!, 'DRIBLE'));
    expect(r).toEqual({ ok: true });
    expect((await nomesNoBanco(c.grupo))[3]).toBe('DRIBLE');
  });

  it('corrida: o UPDATE que passa da consulta cai no índice único e vira a mesma recusa', async () => {
    const c = await novoCenario();
    const ocupante = new pg.Client({ connectionString: b.banco.url });
    await ocupante.connect();
    try {
      const pid = (await ocupante.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await ocupante.query('BEGIN');
      await ocupante.query("INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Corrida')", [c.grupo]);
      const pedido = como(c.conta, (db) => habilidades.renomear(db, c.grupo, c.habilidades[0]!, 'corrida'));
      await esperarAlguemTravadoPor(pid);
      await ocupante.query('COMMIT');
      expect(await pedido).toEqual(REPETIDO);
    } finally {
      await ocupante.end();
    }
    expect((await nomesNoBanco(c.grupo))[0]).toBe('Visão de Jogo');
  });

  it('habilidade de outro grupo → nulo e a de lá não muda', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    const r = await como(c.conta, (db) => habilidades.renomear(db, c.grupo, outro.habilidades[0]!, 'Invasão'));
    expect(r).toBeNull();
    expect(await nomesNoBanco(outro.grupo)).toEqual(INICIAIS);
  });

  it('id inexistente → nulo', async () => {
    const c = await novoCenario();
    expect(await como(c.conta, (db) => habilidades.renomear(db, c.grupo, randomUUID(), 'Nada'))).toBeNull();
  });
});

describe('habilidades.excluir (GEL-93, GEL-96)', () => {
  it('apaga a habilidade e as notas de todos os jogadores nela; as outras notas ficam', async () => {
    const c = await novoCenario();
    const [visao, , , , chute] = c.habilidades;
    await darNota(c, c.jogadores[0], chute!, 7);
    await darNota(c, c.jogadores[1], chute!, 9);
    await darNota(c, c.jogadores[0], visao!, 6);
    const r = await como(c.conta, (db) => habilidades.excluir(db, c.grupo, chute!));
    expect(r).toEqual({ ok: true });
    expect(await nomesNoBanco(c.grupo)).toEqual(['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Desarme']);
    expect(await notasDe(c.grupo)).toEqual([{ jogador_id: c.jogadores[0], habilidade_id: visao, valor: 6 }]);
  });

  it('audita habilidade_excluida pela conta, só com id e a quantidade de notas', async () => {
    const c = await novoCenario();
    const chute = c.habilidades[4]!;
    await darNota(c, c.jogadores[0], chute, 7);
    await darNota(c, c.jogadores[1], chute, 9);
    await como(c.conta, (db) => habilidades.excluir(db, c.grupo, chute));
    expect(await auditoriaDe(c.grupo, 'habilidade_excluida')).toEqual([
      { autor_conta_id: c.conta, entidade: 'habilidade', entidade_id: chute, resumo: { notasApagadas: 2 } },
    ]);
  });

  it('habilidade de outro grupo → nulo; nada lá muda nem é auditado', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    await darNota(outro, outro.jogadores[0], outro.habilidades[0]!, 5);
    const r = await como(c.conta, (db) => habilidades.excluir(db, c.grupo, outro.habilidades[0]!));
    expect(r).toBeNull();
    expect(await nomesNoBanco(outro.grupo)).toEqual(INICIAIS);
    expect(await notasDe(outro.grupo)).toHaveLength(1);
    expect(await auditoriaDe(c.grupo, 'habilidade_excluida')).toEqual([]);
    expect(await auditoriaDe(outro.grupo, 'habilidade_excluida')).toEqual([]);
  });
});

describe('habilidades.ler (GEL-96)', () => {
  it('do grupo → id e nome; de outro grupo → nulo', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    expect(await como(c.conta, (db) => habilidades.ler(db, c.grupo, c.habilidades[1]!))).toEqual({
      id: c.habilidades[1],
      nome: 'Passe',
    });
    expect(await como(c.conta, (db) => habilidades.ler(db, c.grupo, outro.habilidades[1]!))).toBeNull();
  });
});

describe('auditoria de criar e renomear habilidade (T81; SEC-008)', () => {
  /** Troca a auditoria da ação por uma que falha, roda `acao` e desfaz a troca. */
  async function comAuditoriaFalhando(acaoAuditada: string, acao: () => Promise<unknown>): Promise<void> {
    await b.owner.query(`
      CREATE FUNCTION auditoria_falha_hab() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'auditoria fora do ar'; END $$;
      CREATE TRIGGER auditoria_falha_hab BEFORE INSERT ON auditoria
        FOR EACH ROW WHEN (NEW.acao = '${acaoAuditada}') EXECUTE FUNCTION auditoria_falha_hab();
    `);
    try {
      await expect(acao()).rejects.toThrow('auditoria fora do ar');
    } finally {
      await b.owner.query('DROP TRIGGER auditoria_falha_hab ON auditoria; DROP FUNCTION auditoria_falha_hab();');
    }
  }

  it('criar grava habilidade_criada com o id da nova, sem o nome', async () => {
    const c = await novoCenario();
    const r = await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'Cabeceio Secreto'));
    if (!r.ok) throw new Error('criar recusou');
    expect(await auditoriaDe(c.grupo, 'habilidade_criada')).toEqual([
      { autor_conta_id: c.conta, entidade: 'habilidade', entidade_id: r.id, resumo: {} },
    ]);
  });

  it('renomear grava habilidade_renomeada com o id e a indicação de nome alterado, sem o nome antigo nem o novo', async () => {
    const c = await novoCenario();
    const drible = c.habilidades[3]!;
    expect(await como(c.conta, (db) => habilidades.renomear(db, c.grupo, drible, 'Drible Secreto'))).toEqual({
      ok: true,
    });
    expect(await auditoriaDe(c.grupo, 'habilidade_renomeada')).toEqual([
      { autor_conta_id: c.conta, entidade: 'habilidade', entidade_id: drible, resumo: { campos: ['nome'] } },
    ]);
    const { rows } = await b.owner.query('SELECT resumo FROM auditoria WHERE grupo_id = $1', [c.grupo]);
    expect(JSON.stringify(rows)).not.toContain('Drible');
  });

  it('renomear para o mesmo nome não grava evento; trocar só a caixa grava', async () => {
    const c = await novoCenario();
    const passe = c.habilidades[1]!;
    await como(c.conta, (db) => habilidades.renomear(db, c.grupo, passe, 'Passe'));
    expect(await auditoriaDe(c.grupo, 'habilidade_renomeada')).toEqual([]);
    await como(c.conta, (db) => habilidades.renomear(db, c.grupo, passe, 'PASSE'));
    expect(await auditoriaDe(c.grupo, 'habilidade_renomeada')).toHaveLength(1);
  });

  it('criar ou renomear recusado (nome repetido) ou de outro grupo não deixa evento', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    expect(await como(c.conta, (db) => habilidades.criar(db, c.grupo, 'drible'))).toEqual(REPETIDO);
    expect(await como(c.conta, (db) => habilidades.renomear(db, c.grupo, c.habilidades[0]!, 'CHUTE'))).toEqual(
      REPETIDO,
    );
    expect(await como(c.conta, (db) => habilidades.renomear(db, c.grupo, outro.habilidades[0]!, 'Hack'))).toBeNull();
    for (const g of [c.grupo, outro.grupo]) {
      expect(await auditoriaDe(g, 'habilidade_criada')).toEqual([]);
      expect(await auditoriaDe(g, 'habilidade_renomeada')).toEqual([]);
    }
  });

  it('auditoria na mesma transação: se ela falha, a habilidade não é criada nem renomeada', async () => {
    const c = await novoCenario();
    await comAuditoriaFalhando('habilidade_criada', () =>
      como(c.conta, (db) => habilidades.criar(db, c.grupo, 'Cabeceio')),
    );
    await comAuditoriaFalhando('habilidade_renomeada', () =>
      como(c.conta, (db) => habilidades.renomear(db, c.grupo, c.habilidades[0]!, 'Visão')),
    );
    expect(await nomesNoBanco(c.grupo)).toEqual(INICIAIS);
  });
});
