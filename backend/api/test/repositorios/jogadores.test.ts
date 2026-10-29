import { randomUUID } from 'node:crypto';
import type { KyselyPlugin } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as jogadores from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de jogadores como pelada_app, sob a RLS (T33 a T35; GEL-31 a GEL-50, GEL-84, GEL-85).
const DADOS_GRUPO = { nome: 'Pelada Elenco', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' } as const;

let b: BancoDeRepositorio;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(conta: string, acao: (db: Db) => Promise<T>) => comDb(b.urlApp, { conta }, acao);

async function novaConta(): Promise<string> {
  const id = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [id, `${id}@exemplo.com`],
  );
  return id;
}

interface Cenario {
  conta: string;
  grupo: string;
  /** Ids das 6 habilidades iniciais, na ordem. */
  habilidades: string[];
}

/** Conta nova com um grupo criado pelo repositório (6 habilidades iniciais). */
async function novoCenario(): Promise<Cenario> {
  const conta = await novaConta();
  const g = await como(conta, (db) => grupos.criar(db, DADOS_GRUPO, `elenco-${randomUUID().slice(0, 8)}`));
  const { rows } = await b.owner.query<{ id: string }>(
    'SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
    [g.id],
  );
  return { conta, grupo: g.id, habilidades: rows.map((r) => r.id) };
}

/** Jogador gravado direto pelo owner, com os períodos dados (`[inicio, fim]`). */
async function gravarJogador(
  c: Cenario,
  apelido: string,
  periodos: Array<[string, string | null]>,
  extras: { posicao?: string; ano?: number; telefone?: string | null; pontuacao?: number; inicio?: string | null } = {},
): Promise<string> {
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, ano_nascimento, telefone, pontuacao_inicial, inicio_pontuacao,
                            criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $8, now()) RETURNING id`,
    [
      c.grupo,
      apelido,
      extras.posicao ?? 'meia',
      extras.ano ?? 1990,
      extras.telefone ?? null,
      extras.pontuacao ?? 0,
      extras.inicio === undefined ? (periodos[0]?.[0] ?? null) : extras.inicio,
      c.conta,
    ],
  );
  const id = rows[0]!.id;
  for (const [inicio, fim] of periodos) {
    await b.owner.query('INSERT INTO periodos_ativos (grupo_id, jogador_id, inicio, fim) VALUES ($1, $2, $3, $4)', [
      c.grupo,
      id,
      inicio,
      fim,
    ]);
  }
  return id;
}

async function darNotas(c: Cenario, jogador: string, notas: number[]): Promise<void> {
  for (const [i, valor] of notas.entries()) {
    await b.owner.query('INSERT INTO notas (grupo_id, jogador_id, habilidade_id, valor) VALUES ($1, $2, $3, $4)', [
      c.grupo,
      jogador,
      c.habilidades[i],
      valor,
    ]);
  }
}

/** Plugin que conta as consultas enviadas ao banco por um `Db`. */
function contador(): { plugin: KyselyPlugin; total: () => number } {
  let n = 0;
  return {
    plugin: {
      transformQuery: ({ node }) => {
        n++;
        return node;
      },
      transformResult: async ({ result }) => result,
    },
    total: () => n,
  };
}

describe('jogadores.listar (T33; GEL-46, GEL-50)', () => {
  it('com período aberto: ativo desde o início desse período (não do primeiro)', async () => {
    const c = await novoCenario();
    await gravarJogador(c, 'Volta', [
      ['2026-01-01', '2026-03-01'],
      ['2026-05-10', null],
    ]);
    const lista = await como(c.conta, (db) => jogadores.listar(db, c.grupo));
    expect(lista).toEqual([
      {
        id: expect.any(String),
        apelido: 'Volta',
        posicao: 'meia',
        situacao: 'ativo',
        desde: '2026-05-10',
        nivel: 550,
        semNota: true,
      },
    ]);
  });

  it('sem período aberto: inativo desde a última saída (não a primeira)', async () => {
    const c = await novoCenario();
    await gravarJogador(c, 'Saiu', [
      ['2026-04-01', '2026-06-15'],
      ['2026-01-01', '2026-03-01'],
    ]);
    const lista = await como(c.conta, (db) => jogadores.listar(db, c.grupo));
    expect(lista).toMatchObject([{ apelido: 'Saiu', situacao: 'inativo', desde: '2026-06-15' }]);
  });

  it('nível e semNota vêm do domínio: 8, 7, 6, 7, 8, 5 → 683; sem nota → 550 e semNota', async () => {
    const c = await novoCenario();
    const comNota = await gravarJogador(c, 'Com Nota', [['2026-01-01', null]]);
    await darNotas(c, comNota, [8, 7, 6, 7, 8, 5]);
    await gravarJogador(c, 'Sem Nota', [['2026-01-01', null]]);
    const lista = await como(c.conta, (db) => jogadores.listar(db, c.grupo));
    expect(lista.map((j) => [j.apelido, j.nivel, j.semNota])).toEqual([
      ['Com Nota', 683, false],
      ['Sem Nota', 550, true],
    ]);
  });

  it('ordena pelo apelido sem acento nem caixa (GEL-47)', async () => {
    const c = await novoCenario();
    for (const apelido of ['beto', 'Álvaro', 'Carlos', 'andré'])
      await gravarJogador(c, apelido, [['2026-01-01', null]]);
    const lista = await como(c.conta, (db) => jogadores.listar(db, c.grupo));
    expect(lista.map((j) => j.apelido)).toEqual(['Álvaro', 'andré', 'beto', 'Carlos']);
  });

  it('usa 2 consultas, com 1 ou com 5 jogadores e notas (sem N+1)', async () => {
    const c = await novoCenario();
    const contar = async () => {
      const k = contador();
      await como(c.conta, (db) => jogadores.listar(db.withPlugin(k.plugin), c.grupo));
      return k.total();
    };
    const primeiro = await gravarJogador(c, 'Um', [['2026-01-01', null]]);
    await darNotas(c, primeiro, [5]);
    expect(await contar()).toBe(2);
    for (const apelido of ['Dois', 'Três', 'Quatro', 'Cinco']) {
      const id = await gravarJogador(c, apelido, [['2026-01-01', '2026-02-01']]);
      await darNotas(c, id, [6, 7]);
    }
    expect(await contar()).toBe(2);
  });

  it('não traz jogador de outro grupo, nem pelo id do outro grupo (RLS)', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    await gravarJogador(a, 'Meu', [['2026-01-01', null]]);
    await gravarJogador(outro, 'Alheio', [['2026-01-01', null]]);
    expect((await como(a.conta, (db) => jogadores.listar(db, a.grupo))).map((j) => j.apelido)).toEqual(['Meu']);
    expect(await como(a.conta, (db) => jogadores.listar(db, outro.grupo))).toEqual([]);
  });
});

describe('jogadores.ler (T33; GEL-44, GEL-46)', () => {
  it('devolve dados, períodos em ordem e a nota de cada habilidade (nula onde falta), com o nível', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(
      c,
      'Fichado',
      [
        ['2026-05-01', null],
        ['2026-01-01', '2026-03-01'],
      ],
      { posicao: 'goleiro', ano: 1985, telefone: '11987654321', pontuacao: 42, inicio: '2026-01-01' },
    );
    await darNotas(c, id, [9, 6]);
    const lido = await como(c.conta, (db) => jogadores.ler(db, c.grupo, id));
    expect(lido).toEqual({
      id,
      apelido: 'Fichado',
      posicao: 'goleiro',
      situacao: 'ativo',
      desde: '2026-05-01',
      nivel: 750,
      semNota: false,
      anoNascimento: 1985,
      telefone: '11987654321',
      pontuacaoInicial: 42,
      inicioPontuacao: '2026-01-01',
      periodos: [
        { id: expect.any(String), inicio: '2026-01-01', fim: '2026-03-01' },
        { id: expect.any(String), inicio: '2026-05-01', fim: null },
      ],
      notas: [
        { habilidadeId: c.habilidades[0], habilidade: 'Visão de Jogo', nota: 9 },
        { habilidadeId: c.habilidades[1], habilidade: 'Passe', nota: 6 },
        { habilidadeId: c.habilidades[2], habilidade: 'Preparo Físico', nota: null },
        { habilidadeId: c.habilidades[3], habilidade: 'Drible', nota: null },
        { habilidadeId: c.habilidades[4], habilidade: 'Chute', nota: null },
        { habilidadeId: c.habilidades[5], habilidade: 'Desarme', nota: null },
      ],
    });
  });

  it('início da pontuação nulo (dado antigo) = início do primeiro período', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(
      c,
      'Antigo',
      [
        ['2026-04-01', null],
        ['2026-02-01', '2026-03-01'],
      ],
      { inicio: null },
    );
    expect(await como(c.conta, (db) => jogadores.ler(db, c.grupo, id))).toMatchObject({
      inicioPontuacao: '2026-02-01',
    });
  });

  it('jogador de outro grupo: nulo, pelo grupo da rota e pelo grupo dele (sem vínculo)', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await gravarJogador(outro, 'Alheio', [['2026-01-01', null]]);
    expect(await como(a.conta, (db) => jogadores.ler(db, a.grupo, alheio))).toBeNull();
    expect(await como(a.conta, (db) => jogadores.ler(db, outro.grupo, alheio))).toBeNull();
    expect(await como(a.conta, (db) => jogadores.ler(db, a.grupo, randomUUID()))).toBeNull();
  });
});
