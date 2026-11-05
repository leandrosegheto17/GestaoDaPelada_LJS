import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Alterar a data de início da pontuação (T41; GEL-77, GEL-81, GEL-82, GEL-83), contra o cenário de grupos. Cada caso
 * cria como superusuário um jogador com `inicio_pontuacao` 2026-02-05 e os períodos pedidos (padrão: 2026-02-05 a
 * 2026-06-30 e um aberto desde 2026-08-01) e o apaga no `afterEach`. "Hoje" é 2026-11-05. Os casos que conferem a
 * auditoria confirmam a transação.
 *
 * Casos limite: recuo; avanço dentro do primeiro período; data igual; primeiro período aberto.
 */

let aberto: CenarioGruposAberto;
const jogadoresCriados: string[] = [];

const HOJE = '2026-11-05';

type Faixa = [string, string | null];
const PADRAO: Faixa[] = [
  ['2026-02-05', '2026-06-30'],
  ['2026-08-01', null],
];

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [jogadoresCriados]);
  jogadoresCriados.length = 0;
  await db.query('DROP TRIGGER IF EXISTS falha_teste_gel109_inicio ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_gel109_inicio()');
});

async function novoJogador(apelido: string, faixas: Faixa[] = PADRAO): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, '2026-02-05', $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  jogadoresCriados.push(id);
  for (const [inicio, fim] of faixas) {
    await db.query('INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4)', [
      id,
      cenario.grupoG,
      inicio,
      fim,
    ]);
  }
  return id;
}

async function inicio(id: string) {
  const r = await aberto.db.query<{ inicio: string }>(
    'SELECT inicio_pontuacao::text AS inicio FROM jogadores WHERE id = $1',
    [id],
  );
  return r.rows[0]?.inicio;
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

async function alteracoes(id: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = 'jogador_inicio_alterado' AND entidade_id = $1`,
    [id],
  );
  return r.rows;
}

function alterarComo(conta: string, grupo: string, id: string, data: string) {
  return comDb(aberto.url, conta, (db) => jogadores.alterarInicio(db, grupo, id, { data }, HOJE), { confirmar: true });
}

describe('jogadores.alterarInicio', () => {
  it('GEL-77, GEL-81: recuar de 05/02 para 01/02 grava, move o primeiro período e audita as duas datas', async () => {
    const id = await novoJogador('Recua');
    const r = await alterarComo(aberto.cenario.contaO, aberto.cenario.grupoG, id, '2026-02-01');
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await inicio(id)).toBe('2026-02-01');
    expect(await periodos(id)).toEqual([
      { inicio: '2026-02-01', fim: '2026-06-30' },
      { inicio: '2026-08-01', fim: null },
    ]);
    const a = await alteracoes(id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(aberto.cenario.contaO);
    expect(a[0]?.resumo).toMatchObject({ anterior: '2026-02-05', nova: '2026-02-01' });
    // T35 da partidas-e-ranking (PAR-122): a auditoria passa a levar acumulado e posição antes e depois.
    expect(Object.keys(a[0]?.resumo ?? {})).toEqual(
      expect.arrayContaining(['acumuladoAntes', 'acumuladoDepois', 'posicaoAntes', 'posicaoDepois']),
    );
  });

  it('GEL-77, GEL-81: avançar dentro do primeiro período grava só a data de início', async () => {
    const id = await novoJogador('Avança');
    const r = await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-03-10');
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await inicio(id)).toBe('2026-03-10');
    expect(await periodos(id)).toEqual([
      { inicio: '2026-02-05', fim: '2026-06-30' },
      { inicio: '2026-08-01', fim: null },
    ]);
  });

  it('GEL-82: data igual à atual não grava nem audita', async () => {
    const id = await novoJogador('Igual');
    const r = await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-02-05');
    expect(r).toEqual({ resultado: 'ok', alterado: false });
    expect(await inicio(id)).toBe('2026-02-05');
    expect(await alteracoes(id)).toEqual([]);
  });

  it('GEL-77: com o primeiro período aberto, avançar até hoje é aceito', async () => {
    const id = await novoJogador('Só Aberto', [['2026-02-05', null]]);
    const r = await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, HOJE);
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await inicio(id)).toBe(HOJE);
    expect(await periodos(id)).toEqual([{ inicio: '2026-02-05', fim: null }]);
  });

  it('GEL-80: depois da saída do primeiro período é recusado com a mensagem e nada é gravado', async () => {
    const id = await novoJogador('Passa da Saída');
    const r = await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-07-01');
    expect(r).toEqual({
      resultado: 'invalido',
      regra: 'depois-da-saida-do-primeiro',
      campo: 'data',
      mensagem:
        'A data de início não pode ficar depois da saída do primeiro período (30/06/2026). Corrija antes a data de saída do primeiro período.',
    });
    expect(await inicio(id)).toBe('2026-02-05');
    expect(await alteracoes(id)).toEqual([]);
  });

  it('GEL-78, GEL-79: antes do piso e no futuro são recusados', async () => {
    const id = await novoJogador('Fora dos Limites');
    expect(await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '1999-12-31')).toMatchObject({
      resultado: 'invalido',
      regra: 'antes-do-piso',
    });
    expect(await alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-11-06')).toMatchObject({
      resultado: 'invalido',
      regra: 'futuro',
    });
    expect(await inicio(id)).toBe('2026-02-05');
  });

  it('GEL-44: jogador de outro grupo dá nao_encontrado e nada muda', async () => {
    const id = await novoJogador('De G');
    const r = await alterarComo(aberto.cenario.contaB, aberto.cenario.grupoH, id, '2026-02-01');
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect(await inicio(id)).toBe('2026-02-05');
  });

  it('GEL-109: erro forçado depois do UPDATE (na auditoria) deixa a data e o primeiro período como antes', async () => {
    const id = await novoJogador('Falha na Auditoria');
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_gel109_inicio() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'jogador_inicio_alterado' AND NEW.entidade_id = '${id}' THEN
           RAISE EXCEPTION 'falha forçada (GEL-109)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_gel109_inicio BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_gel109_inicio()',
    );
    await expect(alterarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-02-01')).rejects.toThrow(
      'falha forçada',
    );
    expect(await inicio(id)).toBe('2026-02-05');
    expect((await periodos(id))[0]).toEqual({ inicio: '2026-02-05', fim: '2026-06-30' });
  });
});
