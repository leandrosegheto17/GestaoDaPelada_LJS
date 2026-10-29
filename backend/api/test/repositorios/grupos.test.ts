import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Repositório de grupos como pelada_app, sob a RLS (T27, T28; GEL-01, GEL-18 a GEL-30).
const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const DADOS = { nome: 'Pelada Repo', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' } as const;

let b: BancoDeRepositorio;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
});

afterAll(async () => {
  await b?.encerrar();
});

const como = <T>(conta: string, acao: Parameters<typeof comDb<T>>[2]) => comDb(b.urlApp, { conta }, acao);

async function novaConta(): Promise<string> {
  const id = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [id, `${id}@exemplo.com`],
  );
  return id;
}

/** Grupo criado pelo repositório, com slug único. */
async function criarGrupo(conta: string, nome: string = DADOS.nome): Promise<{ id: string; slug: string }> {
  return como(conta, (db) => grupos.criar(db, { ...DADOS, nome }, `repo-${randomUUID().slice(0, 8)}`));
}

async function adicionarAdmin(grupoId: string, conta: string): Promise<void> {
  await b.owner.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [conta, grupoId],
  );
}

describe('grupos.criar (GEL-01)', () => {
  it('como pelada_app devolve id e slug e cria o grupo com as 6 habilidades iniciais em ordem', async () => {
    const conta = await novaConta();
    const criado = await como(conta, (db) => grupos.criar(db, DADOS, 'pelada-repo'));
    expect(criado).toEqual({ id: expect.any(String), slug: 'pelada-repo' });
    const { rows } = await b.owner.query<{ nome: string }>(
      'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
      [criado.id],
    );
    expect(rows.map((r) => r.nome)).toEqual(HABILIDADES);
    const g = await b.owner.query(
      "SELECT criado_por, to_char(horario, 'HH24:MI') AS horario FROM grupos WHERE id = $1",
      [criado.id],
    );
    expect(g.rows).toEqual([{ criado_por: conta, horario: '20:30' }]);
  });
});

describe('grupos.listarDaConta (GEL-25, GEL-27)', () => {
  it('separa ativos de arquivados, com recorrência e HH:MM; o arquivado só aparece para a criadora', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const ativo = await criarGrupo(criadora, 'B Ativo');
    const arquivado = await criarGrupo(criadora, 'A Arquivado');
    await adicionarAdmin(ativo.id, outra);
    await adicionarAdmin(arquivado.id, outra);
    await b.owner.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [arquivado.id]);

    const item = (g: { id: string; slug: string }, nome: string) => ({
      id: g.id,
      nome,
      slug: g.slug,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:30',
    });
    expect(await como(criadora, (db) => grupos.listarDaConta(db))).toEqual({
      ativos: [item(ativo, 'B Ativo')],
      arquivados: [item(arquivado, 'A Arquivado')],
    });
    expect(await como(outra, (db) => grupos.listarDaConta(db))).toEqual({
      ativos: [item(ativo, 'B Ativo')],
      arquivados: [],
    });
  });

  it('não lista grupo sem vínculo', async () => {
    const dona = await novaConta();
    await criarGrupo(dona);
    expect(await como(await novaConta(), (db) => grupos.listarDaConta(db))).toEqual({ ativos: [], arquivados: [] });
  });
});

describe('grupos.ler (GEL-20)', () => {
  it('devolve contagens (ativos, habilidades, admins) e souCriador verdadeiro só para a criadora', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const g = await criarGrupo(criadora, 'Lido');
    await adicionarAdmin(g.id, outra);
    for (const [apelido, fim] of [
      ['Um', null],
      ['Dois', null],
      ['Saiu', '2026-03-01'],
    ] as const) {
      const { rows } = await b.owner.query<{ id: string }>(
        `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
        [g.id, apelido, criadora],
      );
      await b.owner.query(
        "INSERT INTO periodos_ativos (grupo_id, jogador_id, inicio, fim) VALUES ($1, $2, '2026-01-01', $3)",
        [g.id, rows[0]?.id, fim],
      );
    }
    const esperado = {
      id: g.id,
      nome: 'Lido',
      slug: g.slug,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:30',
      arquivado: false,
      jogadoresAtivos: 2,
      habilidades: 6,
      admins: 2,
    };
    expect(await como(criadora, (db) => grupos.ler(db, g.id))).toEqual({ ...esperado, souCriador: true });
    expect(await como(outra, (db) => grupos.ler(db, g.id))).toEqual({ ...esperado, souCriador: false });
  });

  it('sem vínculo: nulo', async () => {
    const g = await criarGrupo(await novaConta());
    expect(await como(await novaConta(), (db) => grupos.ler(db, g.id))).toBeNull();
  });
});
