import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `grupo_criar` com os pesos padrão (T22; PAR-15, PAR-16; `BD:125-129`; AD-037), como `pelada_app` com a conta C.
 *
 * Casos limite: `p_hoje` nulo (erro, nada gravado); sessão sem conta (erro que já existia); falha forçada no INSERT dos
 * pesos (desfaz grupo, vínculo e habilidades); a de 6 parâmetros não existe mais (T25 do simulador); a de 7 com
 * `SECURITY DEFINER`, `search_path` fixo e EXECUTE só para `pelada_app`; nenhuma função do schema lê o relógio para
 * uma data (a exceção da AD-037 acabou com a remoção da de 6).
 */

const ASSINATURA_7 = 'grupo_criar(text,text,text,time without time zone,text,text[],date)';
const ASSINATURA_6 = 'grupo_criar(text,text,text,time without time zone,text,text[])';

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

interface Pesos {
  vigente_desde: string;
  pesos: number[];
  registrado_por: string;
}

async function pesosDe(d: pg.Client, grupo: string): Promise<Pesos[]> {
  const r = await d.query<Pesos>(
    `SELECT vigente_desde::text AS vigente_desde,
            ARRAY[presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva, lesionado_com_chuva,
                  expulso, expulso_com_chuva]::int[] AS pesos,
            registrado_por
       FROM config_pesos WHERE grupo_id = $1 ORDER BY vigente_desde`,
    [grupo],
  );
  return r.rows;
}

const criar7 = (d: pg.Client, slug: string, hoje: string | null) =>
  d.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM grupo_criar('Racha Novo', 'quinta', 'semanal', '20:00', $1, ARRAY['Passe', 'Chute']::text[], $2::date)`,
    [slug, hoje],
  );

const totais = async (d: pg.Client): Promise<number[]> => [
  await contar(d, 'SELECT 1 FROM grupos'),
  await contar(d, 'SELECT 1 FROM vinculos_admin'),
  await contar(d, 'SELECT 1 FROM habilidades'),
  await contar(d, 'SELECT 1 FROM config_pesos'),
  await contar(d, 'SELECT 1 FROM auditoria'),
];

describe('grupo_criar de 7 parâmetros', () => {
  it('PAR-15: cria o grupo com 1, 1, 1, 1, -1, -1 vigentes desde p_hoje, registrados pela conta', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const r = await criar7(d, 'racha-novo', '2026-03-15');
      const id = r.rows[0]?.id ?? '';
      expect(id).toBeTruthy();
      await d.query('RESET ROLE');
      expect(await pesosDe(d, id)).toEqual([
        {
          vigente_desde: '2026-03-15',
          pesos: [1, 1, 1, 1, -1, -1],
          registrado_por: cenario.contaC,
        },
      ]);
      expect(await contar(d, 'SELECT 1 FROM vinculos_admin WHERE grupo_id = $1', [id])).toBe(1);
      expect(await contar(d, 'SELECT 1 FROM habilidades WHERE grupo_id = $1', [id])).toBe(2);
    });
  });

  it('PAR-15: p_hoje nulo levanta erro e não grava nada', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      await d.query('RESET ROLE');
      const antes = await totais(d);
      await d.query('SET LOCAL ROLE pelada_app');
      await d.query('SAVEPOINT antes');
      await expect(criar7(d, 'racha-sem-hoje', null)).rejects.toMatchObject({ code: '22023' });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      await d.query('RESET ROLE');
      expect(await totais(d)).toEqual(antes);
    });
  });

  it('PAR-15: sem conta na sessão, recusa', async () => {
    const { db } = aberto;
    await comoApp(db, {}, async (d) => {
      await expect(criar7(d, 'racha-sem-conta', '2026-03-15')).rejects.toMatchObject({
        code: '42501',
      });
    });
  });

  it('PAR-16: falha forçada no INSERT dos pesos desfaz grupo, vínculo, habilidades e auditoria', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      await d.query('RESET ROLE');
      await d.query(`CREATE FUNCTION teste_falha_pesos() RETURNS trigger LANGUAGE plpgsql AS $$
                     BEGIN RAISE EXCEPTION 'falha forçada nos pesos' USING ERRCODE = 'P0001'; END $$`);
      await d.query(`CREATE TRIGGER teste_falha_pesos BEFORE INSERT ON config_pesos
                     FOR EACH ROW EXECUTE FUNCTION teste_falha_pesos()`);
      const antes = await totais(d);
      await d.query('SET LOCAL ROLE pelada_app');
      await d.query('SAVEPOINT antes');
      await expect(criar7(d, 'racha-falho', '2026-03-15')).rejects.toMatchObject({
        code: 'P0001',
        message: 'falha forçada nos pesos',
      });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      await d.query('RESET ROLE');
      expect(await totais(d)).toEqual(antes);
      expect(await contar(d, `SELECT 1 FROM grupos WHERE slug = 'racha-falho'`)).toBe(0);
    });
  });

  it('PAR-15: colisão de slug continua escolhendo o primeiro sufixo livre', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const r = await criar7(d, cenario.slugG, '2026-03-15');
      expect(r.rows[0]?.slug).toBe(`${cenario.slugG}-2`);
    });
  });
});

// A de 6 parâmetros saiu na T25 do simulador (`1792844940000_grupo-criar-contrair.sql`; AD-037, AD-048): o caso da
// delegação vira "não existe mais", e a regra do relógio passa a exigir zero funções (autorizado, `## Autorizações`).
describe('grupo_criar de 6 parâmetros (removida, AD-037)', () => {
  it('SIM-67: a assinatura de 6 parâmetros não existe; chamar com 6 argumentos falha (42883)', async () => {
    const r = await aberto.db.query<{ existe: boolean }>(
      `SELECT to_regprocedure($1) IS NOT NULL AS existe`,
      [ASSINATURA_6],
    );
    expect(r.rows[0]?.existe).toBe(false);
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      await expect(
        d.query(
          `SELECT id FROM grupo_criar('Racha Antigo', 'quinta', 'semanal', '20:00', 'racha-antigo', ARRAY['Passe']::text[])`,
        ),
      ).rejects.toMatchObject({ code: '42883' });
    });
  });
});

describe('proteções da assinatura', () => {
  it.each([ASSINATURA_7])(
    'PAR-15: %s é SECURITY DEFINER, com search_path fixo e EXECUTE só para pelada_app',
    async (assinatura) => {
      const r = await aberto.db.query<{
        definer: boolean;
        config: string[] | null;
        executores: string[];
      }>(
        `SELECT p.prosecdef AS definer, p.proconfig AS config,
                coalesce(array(SELECT coalesce(r.rolname::text, 'PUBLIC')
                                 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                                 LEFT JOIN pg_roles r ON r.oid = a.grantee
                                WHERE a.privilege_type = 'EXECUTE' AND a.grantee <> p.proowner
                                ORDER BY 1), '{}') AS executores
           FROM pg_proc p WHERE p.oid = $1::regprocedure`,
        [assinatura],
      );
      expect(r.rows[0]).toEqual({
        definer: true,
        config: ['search_path=public, pg_temp'],
        executores: ['pelada_app'],
      });
    },
  );

  it('PAR-15, SIM-67: nenhuma função do schema lê o relógio para uma data (fim da exceção da AD-037)', async () => {
    const r = await aberto.db.query<{ funcao: string }>(
      `SELECT p.oid::regprocedure::text AS funcao
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prosrc ~* '(now\\(\\)\\s*(AT\\s+TIME\\s+ZONE|::\\s*date)|\\mcurrent_date\\M|\\mlocaltimestamp\\M)'
        ORDER BY 1`,
    );
    expect(r.rows.map((l) => l.funcao)).toEqual([]);
  });
});
