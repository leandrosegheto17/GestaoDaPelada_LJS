import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as notas from '../../src/infraestrutura/db/repositorios/notas.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de notas como pelada_app, sob a RLS (T48; GEL-97, GEL-98, GEL-100 a GEL-102, GEL-105).
const DADOS_GRUPO = { nome: 'Pelada Notas', diaSemana: 'sexta', frequencia: 'semanal', horario: '21:00' } as const;

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
  habilidades: string[];
  /** Jogador ativo (período aberto). */
  ativo: string;
  /** Jogador inativo (só período encerrado). */
  inativo: string;
}

async function novoJogador(grupo: string, conta: string, apelido: string, fim: string | null): Promise<string> {
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, inicio_pontuacao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, '2026-01-01', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  await b.owner.query(
    "INSERT INTO periodos_ativos (grupo_id, jogador_id, inicio, fim) VALUES ($1, $2, '2026-01-01', $3)",
    [grupo, rows[0]!.id, fim],
  );
  return rows[0]!.id;
}

async function novoCenario(): Promise<Cenario> {
  const conta = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [conta, `${conta}@exemplo.com`],
  );
  const g = await como(conta, (db) => grupos.criar(db, DADOS_GRUPO, `notas-${randomUUID().slice(0, 8)}`));
  const { rows } = await b.owner.query<{ id: string }>(
    'SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
    [g.id],
  );
  return {
    conta,
    grupo: g.id,
    habilidades: rows.map((r) => r.id),
    ativo: await novoJogador(g.id, conta, 'Ativo', null),
    inativo: await novoJogador(g.id, conta, 'Inativo', '2026-03-01'),
  };
}

const notasDe = async (jogador: string) =>
  (
    await b.owner.query<{ habilidade_id: string; valor: number }>(
      'SELECT habilidade_id, valor FROM notas WHERE jogador_id = $1 ORDER BY habilidade_id',
      [jogador],
    )
  ).rows;

const salvar = (c: Cenario, jogador: string, habilidade: string, nota: number | null) =>
  como(c.conta, (db) => notas.salvar(db, c.grupo, jogador, habilidade, nota));

describe('notas.salvar (T48)', () => {
  it('cria a nota; salvar de novo substitui (uma linha só) (GEL-97)', async () => {
    const c = await novoCenario();
    const h = c.habilidades[0]!;
    expect(await salvar(c, c.ativo, h, 8)).toEqual({ nivel: 800, semNota: false });
    expect(await notasDe(c.ativo)).toEqual([{ habilidade_id: h, valor: 8 }]);
    expect(await salvar(c, c.ativo, h, 3)).toEqual({ nivel: 300, semNota: false });
    expect(await notasDe(c.ativo)).toEqual([{ habilidade_id: h, valor: 3 }]);
  });

  it('null apaga a nota; apagar a que não existe não falha (GEL-98)', async () => {
    const c = await novoCenario();
    const [h1, h2] = c.habilidades;
    await salvar(c, c.ativo, h1!, 8);
    await salvar(c, c.ativo, h2!, 6);
    expect(await salvar(c, c.ativo, h1!, null)).toEqual({ nivel: 600, semNota: false });
    expect(await notasDe(c.ativo)).toEqual([{ habilidade_id: h2, valor: 6 }]);
    expect(await salvar(c, c.ativo, h1!, null)).toEqual({ nivel: 600, semNota: false });
    expect(await notasDe(c.ativo)).toEqual([{ habilidade_id: h2, valor: 6 }]);
  });

  it('6 notas 8, 7, 6, 7, 8, 5 → nível 683; apagando todas → 550 e semNota (GEL-101, GEL-102)', async () => {
    const c = await novoCenario();
    const valores = [8, 7, 6, 7, 8, 5];
    let ultimo: notas.NivelDoJogador | null = null;
    for (const [i, v] of valores.entries()) ultimo = await salvar(c, c.ativo, c.habilidades[i]!, v);
    expect(ultimo).toEqual({ nivel: 683, semNota: false });
    for (const h of c.habilidades) ultimo = await salvar(c, c.ativo, h, null);
    expect(ultimo).toEqual({ nivel: 550, semNota: true });
    expect(await notasDe(c.ativo)).toEqual([]);
  });

  it('o nível é só do jogador: notas de outro jogador do grupo não entram', async () => {
    const c = await novoCenario();
    await salvar(c, c.inativo, c.habilidades[0]!, 2);
    expect(await salvar(c, c.ativo, c.habilidades[0]!, 9)).toEqual({ nivel: 900, semNota: false });
  });

  it('jogador inativo recebe nota (GEL-105)', async () => {
    const c = await novoCenario();
    expect(await salvar(c, c.inativo, c.habilidades[2]!, 4)).toEqual({ nivel: 400, semNota: false });
    expect(await notasDe(c.inativo)).toEqual([{ habilidade_id: c.habilidades[2], valor: 4 }]);
  });

  it('jogador de outro grupo → nulo e nada gravado (GEL-100)', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    expect(await salvar(c, outro.ativo, c.habilidades[0]!, 8)).toBeNull();
    expect(await notasDe(outro.ativo)).toEqual([]);
  });

  it('habilidade de outro grupo → nulo e nada gravado (GEL-100)', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    expect(await salvar(c, c.ativo, outro.habilidades[0]!, 8)).toBeNull();
    expect(await notasDe(c.ativo)).toEqual([]);
  });

  it('jogador e habilidade do outro grupo, pedidos pela rota do grupo próprio → nulo e nada gravado', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    expect(await salvar(c, outro.ativo, outro.habilidades[0]!, 8)).toBeNull();
    expect(await notasDe(outro.ativo)).toEqual([]);
  });

  it('null em jogador ou habilidade de outro grupo → nulo e a nota de lá continua', async () => {
    const c = await novoCenario();
    const outro = await novoCenario();
    await salvar(outro, outro.ativo, outro.habilidades[0]!, 7);
    expect(await salvar(c, outro.ativo, outro.habilidades[0]!, null)).toBeNull();
    expect(await notasDe(outro.ativo)).toEqual([{ habilidade_id: outro.habilidades[0], valor: 7 }]);
  });

  it('jogador ou habilidade inexistentes → nulo', async () => {
    const c = await novoCenario();
    expect(await salvar(c, randomUUID(), c.habilidades[0]!, 8)).toBeNull();
    expect(await salvar(c, c.ativo, randomUUID(), 8)).toBeNull();
  });
});
