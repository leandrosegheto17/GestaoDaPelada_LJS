import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { comContexto } from '../apoio/como-role.ts';

// grupos_visiveis() com o grupo arquivado (T17; GEL-25, GEL-107, GEL-112; AD-014): com conta, o grupo arquivado só é
// visível à conta que tem vínculo E é a criadora. O ramo do slug público não muda.

// Tabelas que pelada_app lê, com a coluna do grupo (as mesmas da suíte de RLS, menos as sem grant).
const LEGIVEIS: [string, string][] = [
  ['grupos', 'id'],
  ['vinculos_admin', 'grupo_id'],
  ['jogadores', 'grupo_id'],
  ['periodos_ativos', 'grupo_id'],
  ['habilidades', 'grupo_id'],
  ['notas', 'grupo_id'],
  ['partidas', 'grupo_id'],
  ['presencas', 'grupo_id'],
  ['convites_admin', 'grupo_id'],
];

// Segunda admin de A e de B (não criadoras) e criadora de um terceiro grupo que foi removida dele.
const OUTRA_DE_A = '00000000-0000-0000-0000-0000000000a5';
const OUTRA_DE_B = '00000000-0000-0000-0000-0000000000a6';
const CRIADORA_REMOVIDA = '00000000-0000-0000-0000-0000000000a7';
const GRUPO_SEM_CRIADORA = '00000000-0000-0000-0000-0000000000b7';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  await gravarDoisGrupos(cliente);
  for (const [conta, nome] of [
    [OUTRA_DE_A, 'outra-a'],
    [OUTRA_DE_B, 'outra-b'],
    [CRIADORA_REMOVIDA, 'removida'],
  ] as const) {
    await cliente.query(
      "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2 || '@exemplo.com', $2, 'x', now())",
      [conta, nome],
    );
  }
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now()), ($4, $5, $6, now())',
    [OUTRA_DE_A, GRUPO_A.grupo, GRUPO_A.conta, OUTRA_DE_B, GRUPO_B.grupo, GRUPO_B.conta],
  );
  // Grupo arquivado cuja criadora já não é admin: só a OUTRA_DE_A tem vínculo.
  await cliente.query(
    `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
     VALUES ($1, 'Sem criadora', 'sem-criadora', 'quarta', 'semanal', '20:00', $2, now(), now())`,
    [GRUPO_SEM_CRIADORA, CRIADORA_REMOVIDA],
  );
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
    [OUTRA_DE_A, GRUPO_SEM_CRIADORA],
  );
  // A fica arquivado; B continua ativo.
  await cliente.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]);
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

async function linhasDoGrupo(tabela: string, coluna: string, grupo: string): Promise<number> {
  const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela} WHERE ${coluna} = $1`, [
    grupo,
  ]);
  return Number(rows[0]?.n);
}

async function visiveis(): Promise<string[]> {
  const { rows } = await cliente.query<{ g: string }>('SELECT g::text FROM grupos_visiveis() AS g ORDER BY 1');
  return rows.map((r) => r.g);
}

describe('grupo arquivado (GEL-25)', () => {
  it.each(LEGIVEIS)('a criadora, ainda admin, lê o grupo arquivado em %s', async (tabela, coluna) => {
    const n = await comContexto(cliente, { conta: GRUPO_A.conta }, () => linhasDoGrupo(tabela, coluna, GRUPO_A.grupo));
    expect(n).toBeGreaterThan(0);
  });

  it.each(LEGIVEIS)('outra admin do mesmo grupo lê zero linhas do arquivado em %s', async (tabela, coluna) => {
    const n = await comContexto(cliente, { conta: OUTRA_DE_A }, () => linhasDoGrupo(tabela, coluna, GRUPO_A.grupo));
    expect(n).toBe(0);
  });

  it('para a outra admin, grupos_visiveis() não traz o arquivado nem o arquivado de criadora removida', async () => {
    expect(await comContexto(cliente, { conta: OUTRA_DE_A }, visiveis)).toEqual([]);
  });

  it('a criadora removida do grupo não vê o grupo arquivado que criou', async () => {
    const n = await comContexto(cliente, { conta: CRIADORA_REMOVIDA }, () =>
      linhasDoGrupo('grupos', 'id', GRUPO_SEM_CRIADORA),
    );
    expect(n).toBe(0);
  });

  it('a outra admin não altera o grupo arquivado (zero linhas)', async () => {
    const r = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      cliente.query("UPDATE jogadores SET apelido = 'Hack' WHERE grupo_id = $1", [GRUPO_A.grupo]),
    );
    expect(r.rowCount).toBe(0);
  });
});

describe('grupo ativo continua como antes', () => {
  it.each([GRUPO_B.conta, OUTRA_DE_B])('a admin %s vê o grupo ativo e os jogadores dele', async (conta) => {
    const vistos = await comContexto(cliente, { conta }, async () => ({
      grupos: await linhasDoGrupo('grupos', 'id', GRUPO_B.grupo),
      jogadores: await linhasDoGrupo('jogadores', 'grupo_id', GRUPO_B.grupo),
      visiveis: await visiveis(),
    }));
    expect(vistos).toEqual({ grupos: 1, jogadores: 1, visiveis: [GRUPO_B.grupo] });
  });
});

describe('ramo do slug público (inalterado)', () => {
  it('só com o slug do grupo arquivado, ele continua visível (regra anterior)', async () => {
    expect(await comContexto(cliente, { slug: GRUPO_A.slug }, visiveis)).toEqual([GRUPO_A.grupo]);
  });

  it('com conta, o slug continua ignorado', async () => {
    expect(await comContexto(cliente, { conta: OUTRA_DE_B, slug: GRUPO_A.slug }, visiveis)).toEqual([GRUPO_B.grupo]);
  });
});

describe('proteções da função', () => {
  it('continua SECURITY DEFINER, STABLE, com search_path fixo, sem EXECUTE para PUBLIC e com EXECUTE para pelada_app', async () => {
    const { rows } = await cliente.query<{
      definer: boolean;
      volatilidade: string;
      config: string[];
      publico: boolean;
      app: boolean;
    }>(
      `SELECT p.prosecdef AS definer, p.provolatile AS volatilidade, p.proconfig AS config,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app
         FROM pg_proc p WHERE p.oid = 'grupos_visiveis()'::regprocedure`,
    );
    expect(rows).toEqual([
      { definer: true, volatilidade: 's', config: ['search_path=public, pg_temp'], publico: false, app: true },
    ]);
  });
});
