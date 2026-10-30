import { readdirSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { codigoDoErro, comContexto } from '../apoio/como-role.ts';

// Só quem criou muda arquivado_em, também no banco (T82; SEC-009): como pelada_app, a admin que não criou o grupo não
// arquiva nem reativa por UPDATE direto (o grant de coluna e a policy deixariam); a criadora arquiva e reativa; as
// outras colunas editáveis continuam para qualquer admin; o owner não passa pela trigger.

const MIGRACAO = '1792844520000_grupos-arquivar-so-criadora.sql';
const SEM_PRIVILEGIO = '42501';
const OUTRA_DE_A = '00000000-0000-0000-0000-0000000000a9';

async function adicionarOutraAdmin(cliente: pg.Client): Promise<void> {
  await cliente.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, 'outra-a9@exemplo.com', 'Outra', 'x', now())",
    [OUTRA_DE_A],
  );
  await cliente.query(
    'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $3, now())',
    [OUTRA_DE_A, GRUPO_A.grupo, GRUPO_A.conta],
  );
}

const arquivadoEm = async (cliente: pg.Client) =>
  (await cliente.query<{ a: Date | null }>('SELECT arquivado_em AS a FROM grupos WHERE id = $1', [GRUPO_A.grupo]))
    .rows[0]?.a ?? null;

describe('do zero: arquivado_em só pela criadora (SEC-009)', () => {
  let banco: BancoTemporario;
  let cliente: pg.Client;

  beforeAll(async () => {
    banco = await criarBancoTemporario();
    await migrar(banco.url);
    cliente = new pg.Client({ connectionString: banco.url });
    await cliente.connect();
    await gravarDoisGrupos(cliente);
    await adicionarOutraAdmin(cliente);
  });

  afterAll(async () => {
    await cliente?.end();
    await banco?.remover();
  });

  it('a admin que não criou o grupo não arquiva por UPDATE direto: permissão negada e nada muda', async () => {
    const codigo = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      codigoDoErro(cliente, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]),
    );
    expect(codigo).toBe(SEM_PRIVILEGIO);
    expect(await arquivadoEm(cliente)).toBeNull();
  });

  it('nem junto com as colunas que ela pode editar', async () => {
    const codigo = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      codigoDoErro(cliente, "UPDATE grupos SET nome = 'Tomado', arquivado_em = now() WHERE id = $1", [GRUPO_A.grupo]),
    );
    expect(codigo).toBe(SEM_PRIVILEGIO);
  });

  it('a admin que não criou continua editando nome, dia, frequência e horário', async () => {
    const r = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      cliente.query(
        "UPDATE grupos SET nome = 'Novo', dia_semana = 'sexta', frequencia = 'mensal', horario = '21:00' WHERE id = $1",
        [GRUPO_A.grupo],
      ),
    );
    expect(r.rowCount).toBe(1);
  });

  it('atribuir o mesmo valor (NULL em grupo ativo) não é mudança e passa', async () => {
    const r = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      cliente.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [GRUPO_A.grupo]),
    );
    expect(r.rowCount).toBe(1);
  });

  it('a criadora arquiva e reativa normalmente', async () => {
    const r = await comContexto(cliente, { conta: GRUPO_A.conta }, async () => {
      const arquivar = await cliente.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]);
      const reativar = await cliente.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [GRUPO_A.grupo]);
      return [arquivar.rowCount, reativar.rowCount];
    });
    expect(r).toEqual([1, 1]);
  });

  it('o owner (sem pelada_app) não passa pela trigger', async () => {
    await cliente.query('BEGIN');
    try {
      const r = await cliente.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]);
      expect(r.rowCount).toBe(1);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});

describe('sobre o banco atual: a migration nova fecha o UPDATE que já era possível', () => {
  let banco: BancoTemporario;
  let cliente: pg.Client;

  beforeAll(async () => {
    banco = await criarBancoTemporario();
    const anteriores = readdirSync(PASTA_MIGRACOES)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .indexOf(MIGRACAO);
    expect(anteriores).toBeGreaterThan(0);
    await aplicarMigracoes({ url: banco.url, quantas: anteriores });
    cliente = new pg.Client({ connectionString: banco.url });
    await cliente.connect();
    await gravarDoisGrupos(cliente);
    await adicionarOutraAdmin(cliente);
  });

  afterAll(async () => {
    await cliente?.end();
    await banco?.remover();
  });

  it('antes dela a outra admin arquivava; depois dela, permissão negada', async () => {
    const antes = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      codigoDoErro(cliente, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]),
    );
    // O defeito do SEC-009: sem a trigger, o UPDATE passa (desfeito pelo ROLLBACK do comContexto).
    expect(antes).toBeNull();

    expect(await aplicarMigracoes({ url: banco.url })).toContain(MIGRACAO.replace(/\.sql$/, ''));

    const depois = await comContexto(cliente, { conta: OUTRA_DE_A }, () =>
      codigoDoErro(cliente, 'UPDATE grupos SET arquivado_em = now() WHERE id = $1', [GRUPO_A.grupo]),
    );
    expect(depois).toBe(SEM_PRIVILEGIO);
  });
});
