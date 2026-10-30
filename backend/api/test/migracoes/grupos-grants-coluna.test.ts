import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos } from '../apoio/cenario-dois-grupos.ts';
import { codigoDoErro, comContexto } from '../apoio/como-role.ts';

// UPDATE por coluna em grupos (T20; GEL-16, GEL-112): a pelada_app, mesmo como admin do grupo, só altera nome,
// dia_semana, frequencia, horario e arquivado_em.
const SEM_PRIVILEGIO = '42501';

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

const comoAdminDeA = <T>(acao: () => Promise<T>) => comContexto(cliente, { conta: GRUPO_A.conta }, acao);

describe('colunas que a pelada_app não altera em grupos', () => {
  it.each([
    ['criado_por', `'${GRUPO_B.conta}'`],
    ['situacao_comercial', "'ativo'"],
    ['trial_inicio', "'2026-01-01'"],
    ['slug', "'outro-slug'"],
    ['criado_em', 'now()'],
    ['id', 'id'],
  ])('UPDATE grupos SET %s → permissão negada', async (coluna, valor) => {
    const codigo = await comoAdminDeA(() =>
      codigoDoErro(cliente, `UPDATE grupos SET ${coluna} = ${valor} WHERE id = $1`, [GRUPO_A.grupo]),
    );
    expect(codigo).toBe(SEM_PRIVILEGIO);
  });
});

describe('colunas que a pelada_app altera', () => {
  it('nome, dia_semana, frequencia, horario e arquivado_em continuam funcionando para o admin', async () => {
    const r = await comoAdminDeA(async () => {
      const u = await cliente.query(
        `UPDATE grupos SET nome = 'Novo nome', dia_semana = 'sexta', frequencia = 'mensal', horario = '21:00',
                           arquivado_em = now()
          WHERE id = $1`,
        [GRUPO_A.grupo],
      );
      return u.rowCount;
    });
    expect(r).toBe(1);
  });

  it('desarquivar (arquivado_em = NULL) também funciona', async () => {
    const r = await comoAdminDeA(async () => {
      const u = await cliente.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [GRUPO_A.grupo]);
      return u.rowCount;
    });
    expect(r).toBe(1);
  });
});

describe('a trigger de slug imutável continua barrando', () => {
  it('nem o owner troca o slug (P0001)', async () => {
    await cliente.query('BEGIN');
    try {
      expect(await codigoDoErro(cliente, "UPDATE grupos SET slug = 'outro' WHERE id = $1", [GRUPO_A.grupo])).toBe(
        'P0001',
      );
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});
