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

const auditoriaDe = async (grupoId: string, acao: string) =>
  (
    await b.owner.query<{ autor_conta_id: string }>(
      'SELECT autor_conta_id FROM auditoria WHERE grupo_id = $1 AND acao = $2',
      [grupoId, acao],
    )
  ).rows;

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

describe('grupos.editar (GEL-18)', () => {
  it('grava os dados novos e mantém o slug; sem vínculo, false e nada muda', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Antes');
    const novos = { nome: 'Depois', diaSemana: 'sabado', frequencia: 'mensal', horario: '08:05' } as const;
    expect(await como(conta, (db) => grupos.editar(db, g.id, novos))).toBe(true);
    const lido = await como(conta, (db) => grupos.ler(db, g.id));
    expect(lido).toMatchObject({ ...novos, slug: g.slug });
    expect(await como(await novaConta(), (db) => grupos.editar(db, g.id, { ...novos, nome: 'Hack' }))).toBe(false);
    expect((await b.owner.query('SELECT nome FROM grupos WHERE id = $1', [g.id])).rows).toEqual([{ nome: 'Depois' }]);
  });
});

describe('grupos.arquivar (GEL-22 a GEL-24, GEL-29, GEL-30)', () => {
  it('pela criadora com o nome exato: grava arquivado_em, audita grupo_arquivado e não apaga nada', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Para Arquivar');
    const { rows: jog } = await b.owner.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'Fica', $2, now(), $2, now()) RETURNING id`,
      [g.id, conta],
    );
    const habilidade = await b.owner.query<{ id: string }>('SELECT id FROM habilidades WHERE grupo_id = $1 LIMIT 1', [
      g.id,
    ]);
    await b.owner.query('INSERT INTO notas (grupo_id, jogador_id, habilidade_id, valor) VALUES ($1, $2, $3, 8)', [
      g.id,
      jog[0]?.id,
      habilidade.rows[0]?.id,
    ]);
    const contar = async () =>
      (
        await b.owner.query(
          `SELECT (SELECT count(*) FROM jogadores WHERE grupo_id = $1) AS j,
                  (SELECT count(*) FROM habilidades WHERE grupo_id = $1) AS h,
                  (SELECT count(*) FROM notas WHERE grupo_id = $1) AS n,
                  (SELECT count(*) FROM vinculos_admin WHERE grupo_id = $1) AS v`,
          [g.id],
        )
      ).rows[0];
    const antes = await contar();

    expect(await como(conta, (db) => grupos.arquivar(db, g.id, 'Pelada Para Arquivar'))).toBe('ok');
    const { rows } = await b.owner.query<{ arquivado: boolean }>(
      'SELECT arquivado_em IS NOT NULL AS arquivado FROM grupos WHERE id = $1',
      [g.id],
    );
    expect(rows).toEqual([{ arquivado: true }]);
    expect(await auditoriaDe(g.id, 'grupo_arquivado')).toEqual([{ autor_conta_id: conta }]);
    expect(await contar()).toEqual(antes);
  });

  it.each([
    ['caixa diferente', 'pelada exata'],
    ['espaço a mais', 'Pelada Exata '],
    ['espaço a menos', 'PeladaExata'],
  ])('nome com %s: nome_nao_confere e nada muda', async (_caso, digitado) => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Exata');
    expect(await como(conta, (db) => grupos.arquivar(db, g.id, digitado))).toBe('nome_nao_confere');
    const { rows } = await b.owner.query('SELECT arquivado_em FROM grupos WHERE id = $1', [g.id]);
    expect(rows).toEqual([{ arquivado_em: null }]);
    expect(await auditoriaDe(g.id, 'grupo_arquivado')).toEqual([]);
  });

  it('admin que não criou: so_quem_criou e nada muda', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const g = await criarGrupo(criadora, 'Nao Sou Eu');
    await adicionarAdmin(g.id, outra);
    expect(await como(outra, (db) => grupos.arquivar(db, g.id, 'Nao Sou Eu'))).toBe('so_quem_criou');
    expect((await b.owner.query('SELECT arquivado_em FROM grupos WHERE id = $1', [g.id])).rows).toEqual([
      { arquivado_em: null },
    ]);
  });

  it('criadora removida do grupo: nao_encontrado (sem linha) e nada muda', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const g = await criarGrupo(criadora, 'Removida');
    await adicionarAdmin(g.id, outra);
    await b.owner.query('DELETE FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2', [g.id, criadora]);
    expect(await como(criadora, (db) => grupos.arquivar(db, g.id, 'Removida'))).toBe('nao_encontrado');
    expect(await como(criadora, (db) => grupos.reativar(db, g.id))).toBe('nao_encontrado');
  });

  it('arquivar um arquivado: sem_mudanca, sem nova auditoria e arquivado_em igual', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Duas Vezes');
    await como(conta, (db) => grupos.arquivar(db, g.id, 'Duas Vezes'));
    const antes = (await b.owner.query('SELECT arquivado_em FROM grupos WHERE id = $1', [g.id])).rows;
    expect(await como(conta, (db) => grupos.arquivar(db, g.id, 'Duas Vezes'))).toBe('sem_mudanca');
    expect((await b.owner.query('SELECT arquivado_em FROM grupos WHERE id = $1', [g.id])).rows).toEqual(antes);
    expect(await auditoriaDe(g.id, 'grupo_arquivado')).toHaveLength(1);
  });
});

describe('grupos.reativar (GEL-24, GEL-28, GEL-29)', () => {
  it('pela criadora: apaga arquivado_em e audita grupo_reativado; o slug continua', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Volta');
    await como(conta, (db) => grupos.arquivar(db, g.id, 'Volta'));
    expect(await como(conta, (db) => grupos.reativar(db, g.id))).toBe('ok');
    expect((await b.owner.query('SELECT arquivado_em, slug FROM grupos WHERE id = $1', [g.id])).rows).toEqual([
      { arquivado_em: null, slug: g.slug },
    ]);
    expect(await auditoriaDe(g.id, 'grupo_reativado')).toEqual([{ autor_conta_id: conta }]);
  });

  it('reativar um ativo: sem_mudanca e sem auditoria', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Ja Ativo');
    expect(await como(conta, (db) => grupos.reativar(db, g.id))).toBe('sem_mudanca');
    expect(await auditoriaDe(g.id, 'grupo_reativado')).toEqual([]);
  });

  it('admin que não criou: o arquivado nem é visível a ela (nao_encontrado)', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const g = await criarGrupo(criadora, 'Escondido');
    await adicionarAdmin(g.id, outra);
    await como(criadora, (db) => grupos.arquivar(db, g.id, 'Escondido'));
    expect(await como(outra, (db) => grupos.reativar(db, g.id))).toBe('nao_encontrado');
  });

  it('admin que não criou, num grupo ativo: so_quem_criou', async () => {
    const criadora = await novaConta();
    const outra = await novaConta();
    const g = await criarGrupo(criadora, 'Ativo Alheio');
    await adicionarAdmin(g.id, outra);
    expect(await como(outra, (db) => grupos.reativar(db, g.id))).toBe('so_quem_criou');
  });
});

describe('grupos.editar audita grupo_editado (T81; SEC-008)', () => {
  const editados = async (grupoId: string) =>
    (
      await b.owner.query<{ autor_conta_id: string; entidade: string; entidade_id: string; resumo: unknown }>(
        "SELECT autor_conta_id, entidade, entidade_id, resumo FROM auditoria WHERE grupo_id = $1 AND acao = 'grupo_editado'",
        [grupoId],
      )
    ).rows;

  it('renomear grava um evento com o id e a indicação de nome alterado, sem o nome antigo nem o novo', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Nome Antigo Secreto');
    expect(await como(conta, (db) => grupos.editar(db, g.id, { ...DADOS, nome: 'Nome Novo Secreto' }))).toBe(true);
    expect(await editados(g.id)).toEqual([
      { autor_conta_id: conta, entidade: 'grupo', entidade_id: g.id, resumo: { campos: ['nome'] } },
    ]);
    const { rows } = await b.owner.query('SELECT resumo FROM auditoria WHERE grupo_id = $1', [g.id]);
    expect(JSON.stringify(rows)).not.toContain('Secreto');
  });

  it('trocar só a caixa do nome também conta como renomear', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Caixa');
    expect(await como(conta, (db) => grupos.editar(db, g.id, { ...DADOS, nome: 'PELADA CAIXA' }))).toBe(true);
    expect(await editados(g.id)).toHaveLength(1);
  });

  it('editar sem trocar o nome (só dia, frequência ou horário, ou nada) não grava grupo_editado', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Fixa');
    await como(conta, (db) => grupos.editar(db, g.id, { ...DADOS, nome: 'Pelada Fixa' }));
    await como(conta, (db) =>
      grupos.editar(db, g.id, { nome: 'Pelada Fixa', diaSemana: 'sabado', frequencia: 'mensal', horario: '08:00' }),
    );
    expect(await editados(g.id)).toEqual([]);
  });

  it('sem vínculo: false e nenhum evento', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Alheia');
    expect(await como(await novaConta(), (db) => grupos.editar(db, g.id, { ...DADOS, nome: 'Hack' }))).toBe(false);
    expect(await editados(g.id)).toEqual([]);
  });

  it('auditoria na mesma transação: se ela falha, o nome não muda', async () => {
    const conta = await novaConta();
    const g = await criarGrupo(conta, 'Pelada Firme');
    await b.owner.query(`
      CREATE FUNCTION auditoria_falha_grupo() RETURNS trigger LANGUAGE plpgsql AS
      $$ BEGIN RAISE EXCEPTION 'auditoria fora do ar'; END $$;
      CREATE TRIGGER auditoria_falha_grupo BEFORE INSERT ON auditoria
        FOR EACH ROW WHEN (NEW.acao = 'grupo_editado') EXECUTE FUNCTION auditoria_falha_grupo();
    `);
    try {
      await expect(como(conta, (db) => grupos.editar(db, g.id, { ...DADOS, nome: 'Pelada Mole' }))).rejects.toThrow(
        'auditoria fora do ar',
      );
    } finally {
      await b.owner.query('DROP TRIGGER auditoria_falha_grupo ON auditoria; DROP FUNCTION auditoria_falha_grupo();');
    }
    expect((await b.owner.query('SELECT nome FROM grupos WHERE id = $1', [g.id])).rows).toEqual([
      { nome: 'Pelada Firme' },
    ]);
  });
});
