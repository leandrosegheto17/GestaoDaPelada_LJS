import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Reativar o jogador (T39; GEL-54, GEL-55, GEL-56, GEL-57, GEL-58), contra o cenário de grupos. Cada caso cria como
 * superusuário um jogador com `inicio_pontuacao` 2026-01-10, pontuação inicial 37 e um período encerrado de 2026-01-10
 * a 2026-03-01 (ou aberto, quando pede), e o apaga no `afterEach`. "Hoje" é 2026-11-05. Os casos que conferem a
 * auditoria confirmam a transação.
 *
 * Casos limite: retorno no dia da saída; na véspera; já ativo; sem data; erro depois do `INSERT`.
 */

let aberto: CenarioGruposAberto;
const jogadoresCriados: string[] = [];

const HOJE = '2026-11-05';

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
  await db.query('DROP TRIGGER IF EXISTS falha_teste_gel109_reativar ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_gel109_reativar()');
});

async function novoJogador(apelido: string, fim: string | null = '2026-03-01'): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 37, '2026-01-10', $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-10', $3)`, [
    id,
    cenario.grupoG,
    fim,
  ]);
  jogadoresCriados.push(id);
  return id;
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

async function jogador(id: string) {
  const r = await aberto.db.query<{ inicio: string; pontuacao: number }>(
    'SELECT inicio_pontuacao::text AS inicio, pontuacao_inicial AS pontuacao FROM jogadores WHERE id = $1',
    [id],
  );
  return r.rows[0];
}

async function reativados(id: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = 'jogador_reativado' AND entidade_id = $1`,
    [id],
  );
  return r.rows;
}

function reativarComo(conta: string, grupo: string, id: string, data?: string, confirmar = true) {
  return comDb(aberto.url, conta, (db) => jogadores.reativar(db, grupo, id, data === undefined ? {} : { data }, HOJE), {
    confirmar,
  });
}

describe('jogadores.reativar', () => {
  it('GEL-54: abre um período novo na data de retorno sem mudar o início nem a pontuação inicial', async () => {
    const id = await novoJogador('Volta em Outubro');
    const r = await reativarComo(aberto.cenario.contaO, aberto.cenario.grupoG, id, '2026-10-20');
    expect(r).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-03-01' },
      { inicio: '2026-10-20', fim: null },
    ]);
    expect(await jogador(id)).toEqual({ inicio: '2026-01-10', pontuacao: 37 });
  });

  it('GEL-55: sem data, o retorno é hoje', async () => {
    const id = await novoJogador('Volta Hoje');
    await reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id);
    expect(await periodos(id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-03-01' },
      { inicio: HOJE, fim: null },
    ]);
    expect(await jogador(id)).toEqual({ inicio: '2026-01-10', pontuacao: 37 });
  });

  it('GEL-61: retorno no dia da saída anterior é aceito', async () => {
    const id = await novoJogador('Mesmo Dia');
    const r = await reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-03-01');
    expect(r.resultado).toBe('ok');
    expect(await periodos(id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-03-01' },
      { inicio: '2026-03-01', fim: null },
    ]);
  });

  it('GEL-56: já ativo devolve ja_ativo sem gravar nem auditar', async () => {
    const id = await novoJogador('Já Ativo', null);
    const r = await reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-10-01');
    expect(r).toEqual({ resultado: 'ja_ativo' });
    expect(await periodos(id)).toEqual([{ inicio: '2026-01-10', fim: null }]);
    expect(await reativados(id)).toEqual([]);
  });

  it('GEL-57: audita jogador_reativado com a conta autora, o retorno e a saída anterior', async () => {
    const id = await novoJogador('Auditado');
    await reativarComo(aberto.cenario.contaO, aberto.cenario.grupoG, id, '2026-10-20');
    const a = await reativados(id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(aberto.cenario.contaO);
    expect(a[0]?.resumo).toMatchObject({ retorno: '2026-10-20', saidaAnterior: '2026-03-01' });
    // T35 da partidas-e-ranking (PAR-122): a auditoria passa a levar acumulado e posição antes e depois.
    expect(Object.keys(a[0]?.resumo ?? {})).toEqual(
      expect.arrayContaining(['acumuladoAntes', 'acumuladoDepois', 'posicaoAntes', 'posicaoDepois']),
    );
  });

  it('GEL-58: retorno na véspera da saída anterior é recusado com a mensagem e nada é gravado', async () => {
    const id = await novoJogador('Volta Antes');
    const r = await reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-02-28');
    expect(r).toEqual({
      resultado: 'invalido',
      regra: 'retorno-antes-da-saida-anterior',
      campo: 'retorno',
      mensagem: 'O retorno não pode ser antes da saída anterior (01/03/2026).',
    });
    expect(await periodos(id)).toEqual([{ inicio: '2026-01-10', fim: '2026-03-01' }]);
    expect(await reativados(id)).toEqual([]);
  });

  it('GEL-58, GEL-64: retorno no futuro é recusado', async () => {
    const id = await novoJogador('Volta Amanhã');
    const r = await reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-11-06');
    expect(r).toMatchObject({ resultado: 'invalido', regra: 'futuro', campo: 'retorno' });
    expect(await periodos(id)).toHaveLength(1);
  });

  it('GEL-44: jogador de outro grupo dá nao_encontrado e nada muda', async () => {
    const id = await novoJogador('De G');
    const r = await reativarComo(aberto.cenario.contaB, aberto.cenario.grupoH, id, '2026-10-01');
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect(await periodos(id)).toHaveLength(1);
  });

  it('GEL-109: erro forçado depois do INSERT (na auditoria) deixa os períodos como antes', async () => {
    const id = await novoJogador('Falha na Auditoria');
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_gel109_reativar() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'jogador_reativado' AND NEW.entidade_id = '${id}' THEN
           RAISE EXCEPTION 'falha forçada (GEL-109)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_gel109_reativar BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_gel109_reativar()',
    );
    await expect(reativarComo(aberto.cenario.contaC, aberto.cenario.grupoG, id, '2026-10-01')).rejects.toThrow(
      'falha forçada',
    );
    expect(await periodos(id)).toEqual([{ inicio: '2026-01-10', fim: '2026-03-01' }]);
    expect(await reativados(id)).toEqual([]);
  });
});
