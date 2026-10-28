import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { codigoDoErro, comContexto, comoRole } from '../apoio/como-role.ts';

// As 14 tabelas do legado com grupo_id e convites_admin (conta-e-acesso).
const COM_GRUPO_ID = [
  'auditoria',
  'config_financeira',
  'convites_admin',
  'config_pesos',
  'escalacoes',
  'eventos_uso',
  'habilidades',
  'jogadores',
  'lancamentos',
  'notas',
  'pagamentos_mes',
  'partidas',
  'periodos_ativos',
  'presencas',
  'vinculos_admin',
];
// As que pelada_app pode ler na fundação (auditoria e eventos_uso ficam sem grant até a conta-e-acesso).
const LEGIVEIS = ['grupos', ...COM_GRUPO_ID.filter((t) => t !== 'auditoria' && t !== 'eventos_uso')];
// Pelo slug público: as legíveis, menos convites_admin (traz o e-mail do convidado; a leitura exige conta).
const LEGIVEIS_PELO_SLUG = LEGIVEIS.filter((t) => t !== 'convites_admin');
// Tabelas de conta, sem grupo_id, com RLS própria (conta-e-acesso, ACE-45). falhas_senha_atual entrou na T61 (ACE-70).
const DE_CONTA = [
  'contas',
  'envios_email',
  // envios_email_dia entrou na T63 (teto diário de e-mails, ACE-72).
  'envios_email_dia',
  'falhas_senha_atual',
  'links_conta',
  'pedidos_reset',
  'sessoes',
  'tentativas_login',
];
const colunaGrupo = (t: string) => (t === 'grupos' ? 'id' : 'grupo_id');

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  await gravarDoisGrupos(cliente);
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

async function gruposVistos(tabela: string): Promise<string[]> {
  const coluna = colunaGrupo(tabela);
  const { rows } = await cliente.query<{ g: string }>(`SELECT DISTINCT ${coluna} AS g FROM ${tabela} ORDER BY 1`);
  return rows.map((r) => r.g);
}

describe('RLS com FORCE (FUN-12)', () => {
  it('grupos e toda tabela com grupo_id têm ENABLE e FORCE ROW LEVEL SECURITY', async () => {
    const { rows } = await cliente.query<{ relname: string; ligada: boolean; forcada: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS ligada, c.relforcerowsecurity AS forcada
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
          AND (c.relname = 'grupos' OR EXISTS (
                SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped))
        ORDER BY 1`,
    );
    expect(rows.map((r) => r.relname)).toEqual([...COM_GRUPO_ID, 'grupos'].sort());
    expect(rows.filter((r) => !r.ligada || !r.forcada)).toEqual([]);
  });
});

describe('contexto de conta (FUN-13)', () => {
  it.each(LEGIVEIS)('com app.conta_id de A, %s mostra só linhas do grupo A', async (tabela) => {
    const vistos = await comContexto(cliente, { conta: GRUPO_A.conta }, () => gruposVistos(tabela));
    expect(vistos).toEqual([GRUPO_A.grupo]);
  });

  it('com conta definida, o slug de outro grupo é ignorado', async () => {
    const vistos = await comContexto(cliente, { conta: GRUPO_A.conta, slug: GRUPO_B.slug }, () =>
      gruposVistos('jogadores'),
    );
    expect(vistos).toEqual([GRUPO_A.grupo]);
  });

  it('com conta, escreve no próprio grupo', async () => {
    await comContexto(cliente, { conta: GRUPO_A.conta }, async () => {
      const r = await cliente.query("UPDATE jogadores SET apelido = 'Novo' WHERE grupo_id = $1", [GRUPO_A.grupo]);
      expect(r.rowCount).toBe(1);
    });
  });
});

describe('contexto de slug público (FUN-14)', () => {
  it('só com app.slug_publico de A, convites_admin não mostra nenhuma linha', async () => {
    const vistos = await comContexto(cliente, { slug: GRUPO_A.slug }, () => gruposVistos('convites_admin'));
    expect(vistos).toEqual([]);
  });

  it.each(LEGIVEIS_PELO_SLUG)('só com app.slug_publico de A, %s mostra só linhas do grupo A', async (tabela) => {
    const vistos = await comContexto(cliente, { slug: GRUPO_A.slug }, () => gruposVistos(tabela));
    expect(vistos).toEqual([GRUPO_A.grupo]);
  });

  it('pelo slug, inserir é recusado e alterar ou apagar não afeta nenhuma linha', async () => {
    await comContexto(cliente, { slug: GRUPO_A.slug }, async () => {
      expect(
        await codigoDoErro(
          cliente,
          `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
           VALUES ($1, 'Intruso', $2, now(), $2, now())`,
          [GRUPO_A.grupo, GRUPO_A.conta],
        ),
      ).toBe('42501');
      expect(
        (await cliente.query("UPDATE jogadores SET apelido = 'Hack' WHERE grupo_id = $1", [GRUPO_A.grupo])).rowCount,
      ).toBe(0);
      expect((await cliente.query('DELETE FROM presencas WHERE grupo_id = $1', [GRUPO_A.grupo])).rowCount).toBe(0);
      expect((await cliente.query("UPDATE grupos SET nome = 'Hack' WHERE id = $1", [GRUPO_A.grupo])).rowCount).toBe(0);
    });
    const { rows } = await cliente.query('SELECT apelido FROM jogadores WHERE grupo_id = $1', [GRUPO_A.grupo]);
    expect(rows).toEqual([{ apelido: 'Craque grupo-a' }]);
  });
});

describe('sem contexto (FUN-15)', () => {
  it.each(LEGIVEIS)('sem conta nem slug, %s devolve zero linhas', async (tabela) => {
    const n = await comContexto(cliente, {}, async () => {
      const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela}`);
      return Number(rows[0]?.n);
    });
    expect(n).toBe(0);
  });

  it('sem contexto, o owner continua enxergando as duas linhas (os dados existem)', async () => {
    const { rows } = await cliente.query<{ n: string }>('SELECT count(*) AS n FROM jogadores');
    expect(Number(rows[0]?.n)).toBe(2);
  });
});

describe('grupos_visiveis() (FUN-13 a FUN-15, design C3)', () => {
  it('é SECURITY DEFINER com search_path fixo', async () => {
    const { rows } = await cliente.query(
      "SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'grupos_visiveis' AND pronamespace = 'public'::regnamespace",
    );
    expect(rows).toEqual([{ prosecdef: true, proconfig: ['search_path=public, pg_temp'] }]);
  });

  it('só o owner e pelada_app executam (sem PUBLIC)', async () => {
    const { rows } = await cliente.query<{ grantee: string }>(
      `SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END AS grantee
         FROM pg_proc p, aclexplode(p.proacl) a
        WHERE p.proname = 'grupos_visiveis' AND p.pronamespace = 'public'::regnamespace AND a.privilege_type = 'EXECUTE'
        ORDER BY 1`,
    );
    const { rows: dono } = await cliente.query<{ d: string }>(
      "SELECT proowner::regrole::text AS d FROM pg_proc WHERE proname = 'grupos_visiveis'",
    );
    expect(rows.map((r) => r.grantee).sort()).toEqual([dono[0]?.d, 'pelada_app'].sort());
    await comoRole(cliente, 'pelada_backup', async () => {
      expect(await codigoDoErro(cliente, 'SELECT grupos_visiveis()')).toBe('42501');
    });
  });
});

describe('policy de leitura total do backup (spike S2)', () => {
  it.each([...COM_GRUPO_ID, 'grupos'])(
    'pelada_backup lê as linhas dos dois grupos em %s, sem contexto',
    async (tabela) => {
      const vistos = await comoRole(cliente, 'pelada_backup', () => gruposVistos(tabela));
      expect(vistos).toEqual([GRUPO_A.grupo, GRUPO_B.grupo]);
    },
  );
});

describe('RLS com FORCE nas tabelas de conta (ACE-45)', () => {
  it('as tabelas de conta têm ENABLE e FORCE ROW LEVEL SECURITY', async () => {
    const { rows } = await cliente.query<{ relname: string; ligada: boolean; forcada: boolean }>(
      `SELECT c.relname, c.relrowsecurity AS ligada, c.relforcerowsecurity AS forcada
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = ANY ($1) ORDER BY 1`,
      [DE_CONTA],
    );
    expect(rows).toEqual(DE_CONTA.map((relname) => ({ relname, ligada: true, forcada: true })));
  });

  it.each(DE_CONTA)('pelada_backup lê as linhas das duas contas em %s, sem contexto', async (tabela) => {
    const n = await comoRole(cliente, 'pelada_backup', async () => {
      const { rows } = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM ${tabela}`);
      return Number(rows[0]?.n);
    });
    expect(n).toBe(2);
  });
});
