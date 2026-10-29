import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { comoApp, type ErroPg } from '../apoio/como-role.ts';

// grupo_criar como pelada_app (T18; GEL-01, GEL-02, GEL-09, GEL-10, GEL-14).

// GEL-02: a ordem das habilidades iniciais.
const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

/** Conta gravada como owner (só o id importa aqui). */
async function novaConta(): Promise<string> {
  const id = randomUUID();
  await cliente.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [id, `${id}@exemplo.com`],
  );
  return id;
}

interface Criado {
  id: string;
  slug: string;
}

const CRIAR = 'SELECT id, slug FROM grupo_criar($1, $2, $3, $4, $5, $6)';

function criar(conta: string | undefined, slugBase: string, habilidades = HABILIDADES, nome = 'Pelada de Quinta') {
  return comoApp(cliente, { conta }, async () => {
    const { rows } = await cliente.query<Criado>(CRIAR, [nome, 'quinta', 'semanal', '20:30', slugBase, habilidades]);
    return rows;
  });
}

async function erroDe(acao: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await acao();
    return undefined;
  } catch (erro) {
    return (erro as ErroPg).code ?? 'sem-codigo';
  }
}

describe('grupo_criar (GEL-01, GEL-02, GEL-10)', () => {
  it('devolve (id, slug) e cria grupo, vínculo com financeiro, 6 habilidades em ordem e a auditoria', async () => {
    const conta = await novaConta();
    const linhas = await criar(conta, 'criado-completo');
    expect(linhas).toEqual([{ id: expect.any(String), slug: 'criado-completo' }]);
    const id = linhas[0]?.id;

    const grupo = await cliente.query(
      `SELECT nome, dia_semana, frequencia, to_char(horario, 'HH24:MI') AS horario, criado_por, arquivado_em
         FROM grupos WHERE id = $1`,
      [id],
    );
    expect(grupo.rows).toEqual([
      {
        nome: 'Pelada de Quinta',
        dia_semana: 'quinta',
        frequencia: 'semanal',
        horario: '20:30',
        criado_por: conta,
        arquivado_em: null,
      },
    ]);

    const vinculo = await cliente.query(
      'SELECT conta_id, acessa_financeiro, criado_por FROM vinculos_admin WHERE grupo_id = $1',
      [id],
    );
    expect(vinculo.rows).toEqual([{ conta_id: conta, acessa_financeiro: true, criado_por: conta }]);

    const habilidades = await cliente.query<{ nome: string }>(
      'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
      [id],
    );
    expect(habilidades.rows.map((h) => h.nome)).toEqual(HABILIDADES);

    const auditoria = await cliente.query(
      'SELECT autor_tipo, autor_conta_id, acao, entidade, entidade_id FROM auditoria WHERE grupo_id = $1',
      [id],
    );
    expect(auditoria.rows).toEqual([
      { autor_tipo: 'conta', autor_conta_id: conta, acao: 'grupo_criado', entidade: 'grupo', entidade_id: id },
    ]);
  });

  it('a conta criadora enxerga o grupo novo sob a RLS na mesma transação', async () => {
    const conta = await novaConta();
    const vistos = await comoApp(cliente, { conta }, async () => {
      const { rows } = await cliente.query<Criado>(CRIAR, [
        'Pelada visível',
        'quarta',
        'mensal',
        '19:00',
        'pelada-visivel',
        HABILIDADES,
      ]);
      const grupos = await cliente.query('SELECT id FROM grupos');
      return { criado: rows[0]?.id, vistos: grupos.rows.map((r: { id: string }) => r.id) };
    });
    expect(vistos.vistos).toEqual([vistos.criado]);
  });
});

describe('sufixo do slug (GEL-14)', () => {
  it('base ocupada → -2, depois -3, contando grupo arquivado como ocupado', async () => {
    const conta = await novaConta();
    expect((await criar(conta, 'pelada-de-quinta'))[0]?.slug).toBe('pelada-de-quinta');
    // O dono da base arquiva o grupo: o slug continua ocupado.
    await cliente.query("UPDATE grupos SET arquivado_em = now() WHERE slug = 'pelada-de-quinta'");
    expect((await criar(await novaConta(), 'pelada-de-quinta'))[0]?.slug).toBe('pelada-de-quinta-2');
    expect((await criar(await novaConta(), 'pelada-de-quinta'))[0]?.slug).toBe('pelada-de-quinta-3');
  });

  it('usa o primeiro sufixo livre: com -2 livre e -3 ocupado, fica -2', async () => {
    const conta = await novaConta();
    await criar(conta, 'buraco');
    await cliente.query(
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ('Buraco 3', 'buraco-3', 'quarta', 'semanal', '20:00', $1, now())`,
      [conta],
    );
    expect((await criar(conta, 'buraco'))[0]?.slug).toBe('buraco-2');
    expect((await criar(conta, 'buraco'))[0]?.slug).toBe('buraco-4');
  });

  it('o slug de outra base parecida não ocupa a base ("grupo-a" não ocupa "grupo")', async () => {
    const conta = await novaConta();
    await criar(conta, 'parecido-a');
    expect((await criar(conta, 'parecido'))[0]?.slug).toBe('parecido');
  });
});

describe('falhas (GEL-09)', () => {
  it('sem app_conta_id() a função falha e nada é criado', async () => {
    const codigo = await erroDe(() => criar(undefined, 'sem-conta'));
    expect(codigo).toBe('42501');
    const { rows } = await cliente.query("SELECT 1 FROM grupos WHERE slug = 'sem-conta'");
    expect(rows).toEqual([]);
  });

  it('habilidade inválida no meio desfaz grupo, vínculo e habilidades já gravadas (a transação segue e confirma)', async () => {
    const conta = await novaConta();
    await cliente.query('BEGIN');
    let codigo: string | undefined;
    try {
      await cliente.query('SET LOCAL ROLE pelada_app');
      await cliente.query("SELECT set_config('app.conta_id', $1, true)", [conta]);
      await cliente.query('SAVEPOINT tentativa');
      try {
        await cliente.query(CRIAR, ['Pelada parcial', 'quarta', 'semanal', '20:00', 'parcial', ['Passe', 'X']]);
      } catch (erro) {
        codigo = (erro as ErroPg).code;
        await cliente.query('ROLLBACK TO SAVEPOINT tentativa');
      }
      await cliente.query('COMMIT');
    } catch (erro) {
      await cliente.query('ROLLBACK');
      throw erro;
    }
    expect(codigo).toBe('23514');
    const grupos = await cliente.query("SELECT id FROM grupos WHERE slug = 'parcial'");
    const vinculos = await cliente.query('SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [conta]);
    const habilidades = await cliente.query(
      "SELECT 1 FROM habilidades h JOIN grupos g ON g.id = h.grupo_id WHERE g.nome = 'Pelada parcial'",
    );
    expect({ grupos: grupos.rows, vinculos: vinculos.rows, habilidades: habilidades.rows }).toEqual({
      grupos: [],
      vinculos: [],
      habilidades: [],
    });
  });
});

describe('proteções (AD-008)', () => {
  it('SECURITY DEFINER, search_path fixo, EXECUTE só para pelada_app e nada para PUBLIC', async () => {
    const { rows } = await cliente.query(
      `SELECT p.prosecdef AS definer, p.proconfig AS config,
              EXISTS (SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS publico,
              has_function_privilege('pelada_app', p.oid, 'EXECUTE') AS app,
              has_function_privilege('pelada_backup_ro', p.oid, 'EXECUTE') AS backup
         FROM pg_proc p WHERE p.proname = 'grupo_criar' AND p.pronamespace = 'public'::regnamespace`,
    );
    expect(rows).toEqual([
      { definer: true, config: ['search_path=public, pg_temp'], publico: false, app: true, backup: false },
    ]);
  });
});
