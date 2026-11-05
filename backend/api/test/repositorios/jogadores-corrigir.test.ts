import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Corrigir as datas de um período (T40; GEL-71, GEL-72, GEL-73, GEL-74, GEL-75), contra o cenário de grupos. Cada caso
 * cria como superusuário um jogador com os períodos pedidos (padrão: 2026-01-10 a 2026-10-05 e um aberto desde
 * 2026-10-20) e o apaga no `afterEach`. "Hoje" é 2026-11-05. Os casos que conferem a auditoria confirmam a transação.
 *
 * Casos limite: período aberto; primeiro período; datas iguais; período de outro jogador; saída e retorno juntos.
 */

let aberto: CenarioGruposAberto;
const jogadoresCriados: string[] = [];

const HOJE = '2026-11-05';

type Faixa = [string, string | null];
const PADRAO: Faixa[] = [
  ['2026-01-10', '2026-10-05'],
  ['2026-10-20', null],
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
  await db.query('DROP TRIGGER IF EXISTS falha_teste_gel109_corrigir ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_gel109_corrigir()');
});

/** Cria o jogador e devolve o id e os ids dos períodos, na ordem dada. */
async function novoJogador(apelido: string, faixas: Faixa[] = PADRAO): Promise<{ id: string; periodos: string[] }> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, $4, now(), $4, now()) RETURNING id`,
    [cenario.grupoG, apelido, faixas[0]![0], cenario.contaC],
  );
  const id = r.rows[0]!.id;
  jogadoresCriados.push(id);
  const ids: string[] = [];
  for (const [inicio, fim] of faixas) {
    const p = await db.query<{ id: string }>(
      'INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4) RETURNING id',
      [id, cenario.grupoG, inicio, fim],
    );
    ids.push(p.rows[0]!.id);
  }
  return { id, periodos: ids };
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

async function corrigidos(id: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = 'jogador_periodo_corrigido' AND entidade_id = $1`,
    [id],
  );
  return r.rows;
}

function corrigirComo(
  conta: string,
  grupo: string,
  id: string,
  periodoId: string,
  dados: { saida?: string; retorno?: string },
) {
  return comDb(aberto.url, conta, (db) => jogadores.corrigirPeriodo(db, grupo, id, periodoId, dados, HOJE), {
    confirmar: true,
  });
}

describe('jogadores.corrigirPeriodo', () => {
  it('GEL-71: saída de 05/10 para 03/10 grava e audita antes e depois com a conta autora', async () => {
    const j = await novoJogador('Corrige Saída');
    const r = await corrigirComo(aberto.cenario.contaO, aberto.cenario.grupoG, j.id, j.periodos[0]!, {
      saida: '2026-10-03',
    });
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-10-03' },
      { inicio: '2026-10-20', fim: null },
    ]);
    const a = await corrigidos(j.id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(aberto.cenario.contaO);
    expect(a[0]?.resumo).toMatchObject({
      periodoId: j.periodos[0],
      antes: { inicio: '2026-01-10', fim: '2026-10-05' },
      depois: { inicio: '2026-01-10', fim: '2026-10-03' },
    });
  });

  it('GEL-71: corrige o retorno de um período que não é o primeiro', async () => {
    const j = await novoJogador('Corrige Retorno');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[1]!, {
      retorno: '2026-10-15',
    });
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-10-05' },
      { inicio: '2026-10-15', fim: null },
    ]);
  });

  it('GEL-71: saída e retorno juntos num período do meio gravam os dois', async () => {
    const j = await novoJogador('Corrige Os Dois', [
      ['2026-01-10', '2026-03-01'],
      ['2026-04-01', '2026-06-01'],
      ['2026-08-01', null],
    ]);
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[1]!, {
      retorno: '2026-03-15',
      saida: '2026-07-01',
    });
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-03-01' },
      { inicio: '2026-03-15', fim: '2026-07-01' },
      { inicio: '2026-08-01', fim: null },
    ]);
  });

  it('GEL-72: saída de período aberto é recusada com "Este período não tem data de saída."', async () => {
    const j = await novoJogador('Aberto');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[1]!, {
      saida: '2026-11-01',
    });
    expect(r).toEqual({
      resultado: 'invalido',
      regra: 'nao-corrigivel',
      campo: 'saida',
      mensagem: 'Este período não tem data de saída.',
    });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-10-05' },
      { inicio: '2026-10-20', fim: null },
    ]);
    expect(await corrigidos(j.id)).toEqual([]);
  });

  it('GEL-73: retorno do primeiro período é recusado com a mensagem de alterar a data de início', async () => {
    const j = await novoJogador('Primeiro');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[0]!, {
      retorno: '2026-01-05',
    });
    expect(r).toEqual({
      resultado: 'invalido',
      regra: 'nao-corrigivel',
      campo: 'retorno',
      mensagem: 'O início do primeiro período é a data de início da pontuação; use Alterar data de início.',
    });
    expect((await periodos(j.id))[0]).toEqual({ inicio: '2026-01-10', fim: '2026-10-05' });
    expect(await corrigidos(j.id)).toEqual([]);
  });

  it('GEL-74: datas iguais às atuais devolvem alterado: false sem gravar nem auditar', async () => {
    const j = await novoJogador('Igual');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[0]!, {
      saida: '2026-10-05',
    });
    expect(r).toEqual({ resultado: 'ok', alterado: false });
    expect(await corrigidos(j.id)).toEqual([]);
  });

  it('GEL-75: período de outro jogador do mesmo grupo dá nao_encontrado e nada muda', async () => {
    const a = await novoJogador('Dono do Período');
    const b = await novoJogador('Outro Jogador');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, b.id, a.periodos[0]!, {
      saida: '2026-10-03',
    });
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect((await periodos(a.id))[0]).toEqual({ inicio: '2026-01-10', fim: '2026-10-05' });
    expect(await corrigidos(a.id)).toEqual([]);
    expect(await corrigidos(b.id)).toEqual([]);
  });

  it('GEL-44: jogador de outro grupo dá nao_encontrado', async () => {
    const j = await novoJogador('De G');
    const r = await corrigirComo(aberto.cenario.contaB, aberto.cenario.grupoH, j.id, j.periodos[0]!, {
      saida: '2026-10-03',
    });
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect((await periodos(j.id))[0]).toEqual({ inicio: '2026-01-10', fim: '2026-10-05' });
  });

  it('GEL-66: saída depois do próximo retorno é recusada pela regra de período', async () => {
    const j = await novoJogador('Passa do Retorno');
    const r = await corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[0]!, {
      saida: '2026-10-25',
    });
    expect(r).toMatchObject({ resultado: 'invalido', regra: 'saida-depois-do-proximo-retorno', campo: 'saida' });
    expect((await periodos(j.id))[0]).toEqual({ inicio: '2026-01-10', fim: '2026-10-05' });
  });

  it('GEL-109: erro forçado depois do UPDATE (na auditoria) deixa o período como antes', async () => {
    const j = await novoJogador('Falha na Auditoria');
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_gel109_corrigir() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'jogador_periodo_corrigido' AND NEW.entidade_id = '${j.id}' THEN
           RAISE EXCEPTION 'falha forçada (GEL-109)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_gel109_corrigir BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_gel109_corrigir()',
    );
    await expect(
      corrigirComo(aberto.cenario.contaC, aberto.cenario.grupoG, j.id, j.periodos[0]!, { saida: '2026-10-03' }),
    ).rejects.toThrow('falha forçada');
    expect((await periodos(j.id))[0]).toEqual({ inicio: '2026-01-10', fim: '2026-10-05' });
    expect(await corrigidos(j.id)).toEqual([]);
  });
});
