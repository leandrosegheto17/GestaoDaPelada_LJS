import { randomUUID } from 'node:crypto';
import type { KyselyPlugin } from 'kysely';
import pg from 'pg';
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

const HOJE = '2026-07-15';
const NOVO = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia', telefone: null, pontuacaoInicial: 0 } as const;

const periodosDe = async (jogador: string) =>
  (
    await b.owner.query<{ inicio: string; fim: string | null }>(
      "SELECT to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio",
      [jogador],
    )
  ).rows;

const linhaDe = async (jogador: string) =>
  (
    await b.owner.query(
      `SELECT apelido, ano_nascimento, posicao, telefone, pontuacao_inicial,
              to_char(inicio_pontuacao, 'YYYY-MM-DD') AS inicio_pontuacao
       FROM jogadores WHERE id = $1`,
      [jogador],
    )
  ).rows[0];

const auditoriaDe = async (grupo: string, acao: string) =>
  (
    await b.owner.query<{ autor_conta_id: string; entidade_id: string; resumo: Record<string, unknown> }>(
      'SELECT autor_conta_id, entidade_id, resumo FROM auditoria WHERE grupo_id = $1 AND acao = $2 ORDER BY momento, id',
      [grupo, acao],
    )
  ).rows;

const contarJogadores = async (grupo: string, apelido: string) =>
  Number(
    (
      await b.owner.query<{ n: string }>(
        'SELECT count(*) AS n FROM jogadores WHERE grupo_id = $1 AND lower(apelido) = lower($2)',
        [grupo, apelido],
      )
    ).rows[0]?.n,
  );

async function criado(c: Cenario, dados: Parameters<typeof jogadores.criar>[2], hoje = HOJE): Promise<string> {
  const r = await como(c.conta, (db) => jogadores.criar(db, c.grupo, dados, hoje));
  if (!r.ok) throw new Error(`criar recusou: ${r.mensagem}`);
  return r.id;
}

describe('jogadores.criar (T34; GEL-31, GEL-32, GEL-35, GEL-38, GEL-45)', () => {
  it('sem data de entrada usa hoje (do parâmetro): período aberto e inicio_pontuacao em hoje', async () => {
    const c = await novoCenario();
    const id = await criado(c, NOVO);
    expect(await periodosDe(id)).toEqual([{ inicio: HOJE, fim: null }]);
    expect(await linhaDe(id)).toEqual({
      apelido: 'Toninho',
      ano_nascimento: 1990,
      posicao: 'meia',
      telefone: null,
      pontuacao_inicial: 0,
      inicio_pontuacao: HOJE,
    });
  });

  it('com data de entrada: o período aberto e o inicio_pontuacao têm essa data; grava telefone e pontuação', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...NOVO, telefone: '11987654321', pontuacaoInicial: 120, dataEntrada: '2026-03-02' });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-03-02', fim: null }]);
    expect(await linhaDe(id)).toMatchObject({
      telefone: '11987654321',
      pontuacao_inicial: 120,
      inicio_pontuacao: '2026-03-02',
    });
    expect(await como(c.conta, (db) => jogadores.ler(db, c.grupo, id))).toMatchObject({
      situacao: 'ativo',
      desde: '2026-03-02',
    });
  });

  it('"Toninho" e depois "toninho": recusa no apelido com a mensagem do GEL-35 e nada é criado', async () => {
    const c = await novoCenario();
    await criado(c, NOVO);
    const r = await como(c.conta, (db) => jogadores.criar(db, c.grupo, { ...NOVO, apelido: 'toninho' }, HOJE));
    expect(r).toEqual({ ok: false, campo: 'apelido', mensagem: 'Já existe um jogador com esse apelido neste grupo.' });
    expect(await contarJogadores(c.grupo, 'toninho')).toBe(1);
  });

  it('"José" e "Jose" coexistem (acento conta); o mesmo apelido em outro grupo também', async () => {
    const c = await novoCenario();
    await criado(c, { ...NOVO, apelido: 'José' });
    const r = await como(c.conta, (db) => jogadores.criar(db, c.grupo, { ...NOVO, apelido: 'Jose' }, HOJE));
    expect(r.ok).toBe(true);
    const outro = await novoCenario();
    expect(
      (await como(outro.conta, (db) => jogadores.criar(db, outro.grupo, { ...NOVO, apelido: 'José' }, HOJE))).ok,
    ).toBe(true);
  });

  it('corrida: o INSERT que passa da consulta cai no índice único e vira a mesma recusa (23505 traduzido)', async () => {
    const c = await novoCenario();
    const ocupante = new pg.Client({ connectionString: b.banco.url });
    await ocupante.connect();
    try {
      const pidOcupante = (await ocupante.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await ocupante.query('BEGIN');
      // Gravado e ainda não confirmado: invisível à consulta do repositório, mas o INSERT dele espera no índice.
      await ocupante.query(
        `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, 'Corrida', $2, now(), $2, now())`,
        [c.grupo, c.conta],
      );
      const pedido = como(c.conta, (db) => jogadores.criar(db, c.grupo, { ...NOVO, apelido: 'CORRIDA' }, HOJE));
      await esperarAlguemTravadoPor(pidOcupante);
      await ocupante.query('COMMIT');
      expect(await pedido).toEqual({
        ok: false,
        campo: 'apelido',
        mensagem: 'Já existe um jogador com esse apelido neste grupo.',
      });
    } finally {
      await ocupante.end();
    }
    expect(await contarJogadores(c.grupo, 'corrida')).toBe(1);
  });

  it('auditoria jogador_criado pela conta, sem telefone nem ano de nascimento (GEL-113)', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...NOVO, anoNascimento: 1987, telefone: '21987654321', dataEntrada: '2026-02-01' });
    const linhas = await auditoriaDe(c.grupo, 'jogador_criado');
    expect(linhas).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: { dataEntrada: '2026-02-01', pontuacaoInicial: 0 } },
    ]);
    const texto = JSON.stringify(linhas[0]?.resumo);
    expect(texto).not.toContain('21987654321');
    expect(texto).not.toContain('1987');
  });
});

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

const EDICAO = { apelido: 'Toninho', anoNascimento: 1991, posicao: 'atacante', telefone: '11912345678' } as const;

/** Partida no grupo, gravada pelo owner, com a presença do jogador. */
async function gravarPresenca(c: Cenario, jogador: string, data: string, situacao = 'presente'): Promise<void> {
  const { rows } = await b.owner.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
    [c.grupo, data, c.conta],
  );
  await b.owner.query('INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, $4)', [
    rows[0]!.id,
    jogador,
    c.grupo,
    situacao,
  ]);
}

describe('jogadores.editar (T35; GEL-41 a GEL-44)', () => {
  it('grava os dados novos; mudar a pontuação audita anterior e novo; não mexe em início nem períodos', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...NOVO, pontuacaoInicial: 10, dataEntrada: '2026-02-01' });
    expect(await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...EDICAO, pontuacaoInicial: 25 }))).toEqual(
      { ok: true },
    );
    expect(await linhaDe(id)).toEqual({
      apelido: 'Toninho',
      ano_nascimento: 1991,
      posicao: 'atacante',
      telefone: '11912345678',
      pontuacao_inicial: 25,
      inicio_pontuacao: '2026-02-01',
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-02-01', fim: null }]);
    expect(await auditoriaDe(c.grupo, 'jogador_pontuacao_inicial_alterada')).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: { anterior: 10, novo: 25 } },
    ]);
  });

  it('pontuação omitida mantém a atual e não audita; a mesma pontuação também não audita', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...NOVO, pontuacaoInicial: 33 });
    expect(await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, EDICAO))).toEqual({ ok: true });
    expect(await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...EDICAO, pontuacaoInicial: 33 }))).toEqual(
      { ok: true },
    );
    expect(await linhaDe(id)).toMatchObject({ pontuacao_inicial: 33, posicao: 'atacante' });
    expect(await auditoriaDe(c.grupo, 'jogador_pontuacao_inicial_alterada')).toEqual([]);
  });

  it('apelido de outro jogador (outra caixa) é recusado e nada muda; trocar só a caixa do próprio passa', async () => {
    const c = await novoCenario();
    await criado(c, { ...NOVO, apelido: 'Beto' });
    const id = await criado(c, NOVO);
    const r = await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...EDICAO, apelido: 'BETO' }));
    expect(r).toEqual({ ok: false, campo: 'apelido', mensagem: 'Já existe um jogador com esse apelido neste grupo.' });
    expect(await linhaDe(id)).toMatchObject({ apelido: 'Toninho', posicao: 'meia' });
    expect(await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...EDICAO, apelido: 'TONINHO' }))).toEqual({
      ok: true,
    });
    expect(await linhaDe(id)).toMatchObject({ apelido: 'TONINHO' });
  });

  it('jogador de outro grupo: nulo e nada muda', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await criado(outro, NOVO);
    expect(await como(a.conta, (db) => jogadores.editar(db, a.grupo, alheio, EDICAO))).toBeNull();
    expect(await como(a.conta, (db) => jogadores.editar(db, outro.grupo, alheio, EDICAO))).toBeNull();
    expect(await linhaDe(alheio)).toMatchObject({ posicao: 'meia', ano_nascimento: 1990 });
  });
});

describe('jogadores.excluir (T35; GEL-84, GEL-85)', () => {
  it('sem histórico: apaga o jogador e os períodos e audita jogador_excluido só com o id', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Engano', [
      ['2026-01-01', '2026-02-01'],
      ['2026-03-01', null],
    ]);
    expect(await como(c.conta, (db) => jogadores.excluir(db, c.grupo, id))).toEqual({ ok: true });
    expect(await linhaDe(id)).toBeUndefined();
    expect(await periodosDe(id)).toEqual([]);
    expect(await auditoriaDe(c.grupo, 'jogador_excluido')).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: {} },
    ]);
  });

  it.each([
    ['presença', (c: Cenario, id: string) => gravarPresenca(c, id, '2026-07-02', 'lesionado')],
    ['nota', (c: Cenario, id: string) => darNotas(c, id, [7])],
    [
      'pagamento mensal',
      (c: Cenario, id: string) =>
        b.owner
          .query(
            `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, marcado_por, marcado_em)
             VALUES ($1, $2, '2026-07', $3, now())`,
            [c.grupo, id, c.conta],
          )
          .then(() => undefined),
    ],
  ])('com %s: jogador_com_historico com o apelido e nada apagado', async (_tipo, gravarHistorico) => {
    const c = await novoCenario();
    const id = await criado(c, NOVO);
    await gravarHistorico(c, id);
    expect(await como(c.conta, (db) => jogadores.excluir(db, c.grupo, id))).toEqual({
      ok: false,
      codigo: 'jogador_com_historico',
      apelido: 'Toninho',
    });
    expect(await linhaDe(id)).toMatchObject({ apelido: 'Toninho' });
    expect(await periodosDe(id)).toEqual([{ inicio: HOJE, fim: null }]);
    expect(await auditoriaDe(c.grupo, 'jogador_excluido')).toEqual([]);
  });

  it('jogador de outro grupo: nulo e nada apagado', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await criado(outro, NOVO);
    expect(await como(a.conta, (db) => jogadores.excluir(db, a.grupo, alheio))).toBeNull();
    expect(await como(a.conta, (db) => jogadores.excluir(db, outro.grupo, alheio))).toBeNull();
    expect(await linhaDe(alheio)).toMatchObject({ apelido: 'Toninho' });
  });
});

const HOJE_P = '2026-10-29';

/** Jogador criado pelo repositório com entrada em `entrada` (período aberto desde ela). */
async function jogadorDesde(c: Cenario, entrada: string, apelido = `J ${randomUUID().slice(0, 6)}`): Promise<string> {
  return criado(c, { ...NOVO, apelido, dataEntrada: entrada }, HOJE_P);
}

describe('jogadores.inativar (T38; GEL-51 a GEL-53, GEL-58, GEL-68, GEL-109)', () => {
  it('jogador ativo com data válida: fecha o período aberto nessa data e audita jogador_inativado', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-05', HOJE_P))).toEqual({
      ok: true,
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
    const auditado = await auditoriaDe(c.grupo, 'jogador_inativado');
    expect(auditado).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: { periodo: expect.any(String), saida: '2026-10-05' } },
    ]);
  });

  it('sem data: usa hoje (do parâmetro)', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, undefined, HOJE_P))).toEqual({ ok: true });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: HOJE_P }]);
  });

  it('já inativo: ja_inativo, sem alterar nada nem auditar', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-05', HOJE_P));
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-20', HOJE_P))).toEqual({
      ok: false,
      codigo: 'ja_inativo',
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
    expect(await auditoriaDe(c.grupo, 'jogador_inativado')).toHaveLength(1);
  });

  it('presença em 01/10 e saída em 30/09: recusa com a mensagem do GEL-68 e a data mínima 02/10', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    await gravarPresenca(c, id, '2026-10-01');
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-09-30', HOJE_P))).toEqual({
      ok: false,
      campo: 'saida',
      mensagem:
        'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.',
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
    // Na data mínima, passa.
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-02', HOJE_P))).toEqual({
      ok: true,
    });
  });

  it.each([
    ['data inválida', '2026-02-30', 'Informe uma data válida.'],
    ['data futura', '2026-10-30', 'A data não pode ser no futuro.'],
    ['antes do início do período', '2026-08-31', 'A saída não pode ser antes do início deste período (01/09/2026).'],
  ])('%s: recusa com a regra do domínio e nada muda (GEL-58)', async (_caso, data, mensagem) => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    expect(await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, data, HOJE_P))).toEqual({
      ok: false,
      campo: 'saida',
      mensagem,
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('auditoria na mesma transação: se ela falha, o período não muda', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    await b.owner.query(`
      CREATE FUNCTION auditoria_falha_teste() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'auditoria fora do ar'; END $$;
      CREATE TRIGGER auditoria_falha_teste BEFORE INSERT ON auditoria
        FOR EACH ROW WHEN (NEW.acao = 'jogador_inativado') EXECUTE FUNCTION auditoria_falha_teste();
    `);
    try {
      await expect(como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-05', HOJE_P))).rejects.toThrow(
        'auditoria fora do ar',
      );
    } finally {
      await b.owner.query('DROP TRIGGER auditoria_falha_teste ON auditoria; DROP FUNCTION auditoria_falha_teste();');
    }
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('trava a linha do jogador antes de ler (FOR UPDATE): outra transação que trava o jogador espera', async () => {
    const c = await novoCenario();
    const id = await jogadorDesde(c, '2026-09-01');
    const outra = new pg.Client({ connectionString: b.banco.url });
    await outra.connect();
    try {
      const pid = (await outra.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]!.pid;
      await outra.query('BEGIN');
      await outra.query('SELECT 1 FROM jogadores WHERE id = $1 FOR UPDATE', [id]);
      const pedido = como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-05', HOJE_P));
      await esperarAlguemTravadoPor(pid);
      // Enquanto espera, a outra transação fecha o período: o pedido é avaliado sobre isso (já inativo).
      await outra.query("UPDATE periodos_ativos SET fim = '2026-10-01' WHERE jogador_id = $1", [id]);
      await outra.query('COMMIT');
      expect(await pedido).toEqual({ ok: false, codigo: 'ja_inativo' });
    } finally {
      await outra.end();
    }
  });

  it('jogador de outro grupo: nulo e nada muda', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await jogadorDesde(outro, '2026-09-01');
    expect(await como(a.conta, (db) => jogadores.inativar(db, a.grupo, alheio, '2026-10-05', HOJE_P))).toBeNull();
    expect(await periodosDe(alheio)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });
});

describe('jogadores.reativar (T39; GEL-54 a GEL-57)', () => {
  it('retorno em 12/10 depois da saída em 05/10: cria [12/10, ∞) sem mudar início nem pontuação; audita as duas datas', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...NOVO, pontuacaoInicial: 77, dataEntrada: '2026-09-01' }, HOJE_P);
    await como(c.conta, (db) => jogadores.inativar(db, c.grupo, id, '2026-10-05', HOJE_P));
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-10-12', HOJE_P))).toEqual({
      ok: true,
    });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-05' },
      { inicio: '2026-10-12', fim: null },
    ]);
    expect(await linhaDe(id)).toMatchObject({ inicio_pontuacao: '2026-09-01', pontuacao_inicial: 77 });
    expect(await auditoriaDe(c.grupo, 'jogador_reativado')).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: { retorno: '2026-10-12', saidaAnterior: '2026-10-05' } },
    ]);
  });

  it('com dois períodos encerrados, a saída anterior auditada é a mais recente', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Vaivem', [
      ['2026-06-01', '2026-07-01'],
      ['2026-01-01', '2026-03-01'],
    ]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-08-01', HOJE_P))).toEqual({
      ok: true,
    });
    expect(await auditoriaDe(c.grupo, 'jogador_reativado')).toMatchObject([
      { resumo: { retorno: '2026-08-01', saidaAnterior: '2026-07-01' } },
    ]);
  });

  it('sem data: usa hoje', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Hoje', [['2026-01-01', '2026-03-01']]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, undefined, HOJE_P))).toEqual({ ok: true });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-01-01', fim: '2026-03-01' },
      { inicio: HOJE_P, fim: null },
    ]);
  });

  it('retorno antes da saída anterior: recusa com a mensagem do GEL-66 e nada muda', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Cedo', [['2026-09-01', '2026-10-05']]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-10-04', HOJE_P))).toEqual({
      ok: false,
      campo: 'retorno',
      mensagem: 'O retorno não pode ser antes da saída anterior (05/10/2026).',
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
    expect(await auditoriaDe(c.grupo, 'jogador_reativado')).toEqual([]);
  });

  it('sair e voltar no mesmo dia: aceita, sem sobreposição (GEL-61)', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Mesmo Dia', [['2026-09-01', '2026-10-05']]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-10-05', HOJE_P))).toEqual({
      ok: true,
    });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-05' },
      { inicio: '2026-10-05', fim: null },
    ]);
  });

  it('data futura: recusa no retorno', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Futuro', [['2026-09-01', '2026-10-05']]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-10-30', HOJE_P))).toEqual({
      ok: false,
      campo: 'retorno',
      mensagem: 'A data não pode ser no futuro.',
    });
  });

  it('já ativo: ja_ativo, sem alterar nada nem auditar', async () => {
    const c = await novoCenario();
    const id = await gravarJogador(c, 'Ativo', [['2026-09-01', null]]);
    expect(await como(c.conta, (db) => jogadores.reativar(db, c.grupo, id, '2026-10-12', HOJE_P))).toEqual({
      ok: false,
      codigo: 'ja_ativo',
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
    expect(await auditoriaDe(c.grupo, 'jogador_reativado')).toEqual([]);
  });

  it('jogador de outro grupo: nulo', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await gravarJogador(outro, 'Alheio', [['2026-09-01', '2026-10-05']]);
    expect(await como(a.conta, (db) => jogadores.reativar(db, a.grupo, alheio, '2026-10-12', HOJE_P))).toBeNull();
    expect(await periodosDe(alheio)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
  });
});

/** Ids dos períodos do jogador, em ordem de início. */
const idsDosPeriodos = async (jogador: string) =>
  (
    await b.owner.query<{ id: string }>('SELECT id FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio', [
      jogador,
    ])
  ).rows.map((r) => r.id);

describe('jogadores.corrigirPeriodo (T40; GEL-71 a GEL-75)', () => {
  /** Saiu em 05/10 e voltou em 12/10. */
  async function saiuEVoltou(c: Cenario): Promise<{ id: string; primeiro: string; segundo: string }> {
    const id = await gravarJogador(c, `Corrige ${randomUUID().slice(0, 6)}`, [
      ['2026-09-01', '2026-10-05'],
      ['2026-10-12', null],
    ]);
    const [primeiro, segundo] = await idsDosPeriodos(id);
    return { id, primeiro: primeiro!, segundo: segundo! };
  }

  it('saída de 05/10 para 03/10: grava e audita jogador_periodo_corrigido com as datas antes e depois', async () => {
    const c = await novoCenario();
    const { id, primeiro, segundo } = await saiuEVoltou(c);
    const r = await como(c.conta, (db) =>
      jogadores.corrigirPeriodo(db, c.grupo, id, primeiro, { saida: '2026-10-03' }, HOJE_P),
    );
    expect(r).toEqual({
      ok: true,
      alterado: true,
      periodos: [
        { id: primeiro, inicio: '2026-09-01', fim: '2026-10-03' },
        { id: segundo, inicio: '2026-10-12', fim: null },
      ],
    });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-03' },
      { inicio: '2026-10-12', fim: null },
    ]);
    expect(await auditoriaDe(c.grupo, 'jogador_periodo_corrigido')).toEqual([
      {
        autor_conta_id: c.conta,
        entidade_id: id,
        resumo: {
          periodo: primeiro,
          saidaAnterior: '2026-10-05',
          saidaNova: '2026-10-03',
          retornoAnterior: '2026-09-01',
          retornoNovo: '2026-09-01',
        },
      },
    ]);
  });

  it('retorno do segundo período de 12/10 para 10/10: grava só o início dele', async () => {
    const c = await novoCenario();
    const { id, segundo } = await saiuEVoltou(c);
    const r = await como(c.conta, (db) =>
      jogadores.corrigirPeriodo(db, c.grupo, id, segundo, { retorno: '2026-10-10' }, HOJE_P),
    );
    expect(r).toMatchObject({ ok: true, alterado: true });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-05' },
      { inicio: '2026-10-10', fim: null },
    ]);
  });

  it('datas iguais às atuais: alterado false, sem escrita e sem auditoria (GEL-74)', async () => {
    const c = await novoCenario();
    const { id, primeiro, segundo } = await saiuEVoltou(c);
    const r = await como(c.conta, (db) =>
      jogadores.corrigirPeriodo(db, c.grupo, id, segundo, { retorno: '2026-10-12' }, HOJE_P),
    );
    expect(r).toEqual({
      ok: true,
      alterado: false,
      periodos: [
        { id: primeiro, inicio: '2026-09-01', fim: '2026-10-05' },
        { id: segundo, inicio: '2026-10-12', fim: null },
      ],
    });
    expect(await auditoriaDe(c.grupo, 'jogador_periodo_corrigido')).toEqual([]);
  });

  it.each([
    ['saída de período aberto', 'segundo', { saida: '2026-10-20' }, 'saida', 'Este período não tem data de saída.'],
    [
      'início do primeiro período',
      'primeiro',
      { retorno: '2026-08-20' },
      'retorno',
      'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
    ],
    [
      'saída depois do próximo retorno',
      'primeiro',
      { saida: '2026-10-13' },
      'saida',
      'A saída não pode ser depois do próximo retorno (12/10/2026).',
    ],
  ] as const)('%s: recusa com a mensagem do domínio e nada muda', async (_caso, qual, datas, campo, mensagem) => {
    const c = await novoCenario();
    const periodos = await saiuEVoltou(c);
    const r = await como(c.conta, (db) =>
      jogadores.corrigirPeriodo(db, c.grupo, periodos.id, periodos[qual], datas, HOJE_P),
    );
    expect(r).toEqual({ ok: false, campo, mensagem });
    expect(await periodosDe(periodos.id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-10-05' },
      { inicio: '2026-10-12', fim: null },
    ]);
    expect(await auditoriaDe(c.grupo, 'jogador_periodo_corrigido')).toEqual([]);
  });

  it('período de outro jogador do grupo, inexistente ou jogador de outro grupo: nulo e nada muda', async () => {
    const c = await novoCenario();
    const um = await saiuEVoltou(c);
    const outroJogador = await saiuEVoltou(c);
    const saida = { saida: '2026-10-03' };
    expect(
      await como(c.conta, (db) => jogadores.corrigirPeriodo(db, c.grupo, um.id, outroJogador.primeiro, saida, HOJE_P)),
    ).toBeNull();
    expect(
      await como(c.conta, (db) => jogadores.corrigirPeriodo(db, c.grupo, um.id, randomUUID(), saida, HOJE_P)),
    ).toBeNull();
    const outro = await novoCenario();
    const alheio = await saiuEVoltou(outro);
    expect(
      await como(c.conta, (db) =>
        jogadores.corrigirPeriodo(db, outro.grupo, alheio.id, alheio.primeiro, saida, HOJE_P),
      ),
    ).toBeNull();
    expect(
      await como(c.conta, (db) => jogadores.corrigirPeriodo(db, c.grupo, alheio.id, alheio.primeiro, saida, HOJE_P)),
    ).toBeNull();
    for (const j of [um, outroJogador, alheio]) {
      expect(await periodosDe(j.id)).toEqual([
        { inicio: '2026-09-01', fim: '2026-10-05' },
        { inicio: '2026-10-12', fim: null },
      ]);
    }
  });
});

describe('jogadores.alterarInicio (T41; GEL-77 a GEL-83)', () => {
  /** Entrou em 05/02, saiu em 01/03 e voltou em 01/04. */
  const comDoisPeriodos = (c: Cenario) =>
    gravarJogador(
      c,
      `Inicio ${randomUUID().slice(0, 6)}`,
      [
        ['2026-02-05', '2026-03-01'],
        ['2026-04-01', null],
      ],
      { inicio: '2026-02-05' },
    );

  it('recuar de 05/02 para 01/02 move o início do primeiro período, deixa o resto e audita anterior e nova', async () => {
    const c = await novoCenario();
    const id = await comDoisPeriodos(c);
    expect(await como(c.conta, (db) => jogadores.alterarInicio(db, c.grupo, id, '2026-02-01', HOJE_P))).toEqual({
      ok: true,
      alterado: true,
    });
    expect(await linhaDe(id)).toMatchObject({ inicio_pontuacao: '2026-02-01' });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-02-01', fim: '2026-03-01' },
      { inicio: '2026-04-01', fim: null },
    ]);
    expect(await auditoriaDe(c.grupo, 'jogador_inicio_alterado')).toEqual([
      { autor_conta_id: c.conta, entidade_id: id, resumo: { anterior: '2026-02-05', nova: '2026-02-01' } },
    ]);
  });

  it('avançar dentro do primeiro período muda só o início da pontuação', async () => {
    const c = await novoCenario();
    const id = await comDoisPeriodos(c);
    expect(await como(c.conta, (db) => jogadores.alterarInicio(db, c.grupo, id, '2026-02-20', HOJE_P))).toEqual({
      ok: true,
      alterado: true,
    });
    expect(await linhaDe(id)).toMatchObject({ inicio_pontuacao: '2026-02-20' });
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-02-05', fim: '2026-03-01' },
      { inicio: '2026-04-01', fim: null },
    ]);
  });

  it('data igual à atual: sem gravar e sem auditar (GEL-82)', async () => {
    const c = await novoCenario();
    const id = await comDoisPeriodos(c);
    const antes = (await b.owner.query('SELECT alterado_em FROM jogadores WHERE id = $1', [id])).rows;
    expect(await como(c.conta, (db) => jogadores.alterarInicio(db, c.grupo, id, '2026-02-05', HOJE_P))).toEqual({
      ok: true,
      alterado: false,
    });
    expect((await b.owner.query('SELECT alterado_em FROM jogadores WHERE id = $1', [id])).rows).toEqual(antes);
    expect(await auditoriaDe(c.grupo, 'jogador_inicio_alterado')).toEqual([]);
  });

  it.each([
    [
      'depois da saída do primeiro período',
      '2026-03-02',
      'A data de início não pode ficar depois da saída do primeiro período (01/03/2026). Corrija antes a data de saída do primeiro período.',
    ],
    ['antes de 01/01/2000', '1999-12-31', 'A data de início não pode ser anterior a 01/01/2000.'],
    ['no futuro', '2026-10-30', 'A data não pode ser no futuro.'],
  ])('%s: recusa no campo data e nada muda', async (_caso, data, mensagem) => {
    const c = await novoCenario();
    const id = await comDoisPeriodos(c);
    expect(await como(c.conta, (db) => jogadores.alterarInicio(db, c.grupo, id, data, HOJE_P))).toEqual({
      ok: false,
      campo: 'data',
      mensagem,
    });
    expect(await linhaDe(id)).toMatchObject({ inicio_pontuacao: '2026-02-05' });
    expect(await auditoriaDe(c.grupo, 'jogador_inicio_alterado')).toEqual([]);
  });

  it('jogador de outro grupo: nulo e nada muda', async () => {
    const a = await novoCenario();
    const outro = await novoCenario();
    const alheio = await comDoisPeriodos(outro);
    expect(await como(a.conta, (db) => jogadores.alterarInicio(db, a.grupo, alheio, '2026-02-01', HOJE_P))).toBeNull();
    expect(await linhaDe(alheio)).toMatchObject({ inicio_pontuacao: '2026-02-05' });
  });
});

describe('jogadores.editar audita jogador_editado (T80; SEC-008)', () => {
  const editados = async (grupo: string) =>
    (
      await b.owner.query<{ autor_conta_id: string; entidade: string; entidade_id: string; resumo: unknown }>(
        `SELECT autor_conta_id, entidade, entidade_id, resumo FROM auditoria
          WHERE grupo_id = $1 AND acao = 'jogador_editado' ORDER BY momento, id`,
        [grupo],
      )
    ).rows;
  const BASE = { apelido: 'Fulano', anoNascimento: 1983, posicao: 'meia', telefone: '21987654321' } as const;

  it.each([
    ['apelido', { apelido: 'Ciclano' }, ['apelido']],
    ['posição', { posicao: 'goleiro' }, ['posicao']],
    ['telefone', { telefone: '11912345678' }, ['telefone']],
    ['telefone apagado', { telefone: null }, ['telefone']],
    ['ano de nascimento', { anoNascimento: 1984 }, ['anoNascimento']],
    ['só a caixa do apelido', { apelido: 'FULANO' }, ['apelido']],
    [
      'os quatro',
      { apelido: 'Beltrano', posicao: 'zagueiro', telefone: '11912345678', anoNascimento: 1999 },
      ['apelido', 'posicao', 'telefone', 'anoNascimento'],
    ],
  ] as const)('mudar %s grava um evento com os nomes dos campos, na conta da requisição', async (_c, troca, campos) => {
    const c = await novoCenario();
    const id = await criado(c, { ...BASE, pontuacaoInicial: 0 });
    expect(await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...BASE, ...troca }))).toEqual({ ok: true });
    expect(await editados(c.grupo)).toEqual([
      { autor_conta_id: c.conta, entidade: 'jogador', entidade_id: id, resumo: { campos: [...campos] } },
    ]);
  });

  it('nenhum evento leva o telefone nem o ano, antigos ou novos', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...BASE, pontuacaoInicial: 0 });
    const novo = { apelido: 'Beltrano', posicao: 'zagueiro', telefone: '11912345678', anoNascimento: 1999 } as const;
    await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, novo));
    const { rows } = await b.owner.query<{ acao: string; resumo: unknown }>(
      'SELECT acao, resumo FROM auditoria WHERE grupo_id = $1',
      [c.grupo],
    );
    expect(rows.map((r) => r.acao)).toContain('jogador_editado');
    for (const valor of ['21987654321', '11912345678', '1983', '1999']) {
      expect(JSON.stringify(rows)).not.toContain(valor);
    }
  });

  it('edição sem mudança nos quatro campos (só a pontuação, ou nada) não grava jogador_editado', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...BASE, pontuacaoInicial: 0 });
    await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, BASE));
    await como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...BASE, pontuacaoInicial: 10 }));
    expect(await editados(c.grupo)).toEqual([]);
  });

  it('edição recusada (apelido repetido) ou de jogador de outro grupo não deixa evento', async () => {
    const c = await novoCenario();
    await criado(c, { ...BASE, apelido: 'Beto', pontuacaoInicial: 0 });
    const id = await criado(c, { ...BASE, pontuacaoInicial: 0 });
    const r = await como(c.conta, (db) =>
      jogadores.editar(db, c.grupo, id, { ...BASE, apelido: 'BETO', posicao: 'goleiro' }),
    );
    expect(r).toMatchObject({ ok: false, campo: 'apelido' });
    const outro = await novoCenario();
    const alheio = await criado(outro, { ...BASE, pontuacaoInicial: 0 });
    expect(
      await como(c.conta, (db) => jogadores.editar(db, c.grupo, alheio, { ...BASE, posicao: 'goleiro' })),
    ).toBeNull();
    expect(await editados(c.grupo)).toEqual([]);
    expect(await editados(outro.grupo)).toEqual([]);
  });

  it('auditoria na mesma transação: se ela falha, a edição não fica gravada', async () => {
    const c = await novoCenario();
    const id = await criado(c, { ...BASE, pontuacaoInicial: 0 });
    await b.owner.query(`
      CREATE FUNCTION auditoria_falha_editar() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'auditoria fora do ar'; END $$;
      CREATE TRIGGER auditoria_falha_editar BEFORE INSERT ON auditoria
        FOR EACH ROW WHEN (NEW.acao = 'jogador_editado') EXECUTE FUNCTION auditoria_falha_editar();
    `);
    try {
      await expect(
        como(c.conta, (db) => jogadores.editar(db, c.grupo, id, { ...BASE, posicao: 'goleiro' })),
      ).rejects.toThrow('auditoria fora do ar');
    } finally {
      await b.owner.query('DROP TRIGGER auditoria_falha_editar ON auditoria; DROP FUNCTION auditoria_falha_editar();');
    }
    expect(await linhaDe(id)).toMatchObject({ posicao: 'meia' });
  });
});
