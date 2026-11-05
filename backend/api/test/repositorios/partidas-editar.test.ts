import type { PartidaCorpo } from '@pelada/contrato';
import { MENSAGEM_JOGADOR_INATIVO } from '@pelada/dominio';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { partidas } from '../../src/infraestrutura/db/repositorios/partidas.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `partidas.editar` e `partidas.excluir` (T31; PAR-45 a PAR-51, PAR-142; AD-038), contra o cenário de grupos. Antes de
 * cada caso, como superusuário: a partida de 2026-02-05 de G (sem chuva, Toninho presente) com o evento
 * `partida_lancada`, e Novato, ativo só desde 2026-06-01. O `afterEach` apaga tudo isso, as auditorias e o gatilho.
 *
 * Casos limite: sem partida na data; data do corpo trocada; ativo hoje mas não na data; todas ausentes; edição
 * concorrente com a correção de período do mesmo jogador; falha no meio; excluir mantém o evento.
 */

const DATA = '2026-02-05';
const HOJE = '2026-11-05';

let aberto: CenarioGruposAberto;
let partidaId: string;
let novato: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  const { db, cenario } = aberto;
  const p = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, false, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, DATA, cenario.contaC],
  );
  partidaId = p.rows[0]?.id ?? '';
  await db.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
    partidaId,
    cenario.idsG.jogadorAtivo,
    cenario.grupoG,
  ]);
  await db.query(
    `INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), $2)`,
    [cenario.grupoG, DATA],
  );
  const n = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Novato', 1995, 'atacante', $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoG, cenario.contaC],
  );
  novato = n.rows[0]?.id ?? '';
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-06-01', NULL)`, [
    novato,
    cenario.grupoG,
  ]);
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM partidas WHERE grupo_id = $1 AND data <> '2026-01-08'`, [cenario.grupoG]);
  await db.query(`DELETE FROM eventos_uso WHERE grupo_id = $1 AND data_partida = $2`, [cenario.grupoG, DATA]);
  await db.query('DELETE FROM jogadores WHERE id = $1', [novato]);
  await db.query(`DELETE FROM auditoria WHERE acao IN ('partida_editada', 'partida_excluida', 'jogador_inicio_alterado')`);
  await db.query('DROP TRIGGER IF EXISTS falha_teste_par49 ON auditoria');
  await db.query('DROP FUNCTION IF EXISTS falha_teste_par49()');
});

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function editarComo(conta: string, dados: PartidaCorpo, data = DATA) {
  return comDb(aberto.url, conta, (db) => partidas.editar(db, aberto.cenario.grupoG, data, dados), { confirmar: true });
}

function excluirComo(conta: string, data = DATA) {
  return comDb(aberto.url, conta, (db) => partidas.excluir(db, aberto.cenario.grupoG, data), { confirmar: true });
}

async function estado() {
  const { db, cenario } = aberto;
  const p = await db.query<{ choveu: boolean; alterada_por: string }>(
    'SELECT choveu, alterada_por FROM partidas WHERE grupo_id = $1 AND data = $2',
    [cenario.grupoG, DATA],
  );
  const pr = await db.query<{ jogador_id: string; situacao: string }>(
    'SELECT jogador_id, situacao FROM presencas WHERE partida_id = $1 ORDER BY jogador_id',
    [partidaId],
  );
  return { partida: p.rows[0] ?? null, presencas: pr.rows };
}

async function eventos(): Promise<number> {
  const r = await aberto.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1 AND tipo = 'partida_lancada' AND data_partida = $2`,
    [aberto.cenario.grupoG, DATA],
  );
  return r.rows[0]?.n ?? -1;
}

async function auditorias(acao: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    'SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = $1 ORDER BY id',
    [acao],
  );
  return r.rows;
}

describe('partidas.editar', () => {
  it('PAR-46: troca a chuva, a autoria e todas as presenças, e audita partida_editada', async () => {
    const { cenario } = aberto;
    const r = await editarComo(cenario.contaO, {
      data: DATA,
      choveu: true,
      marcacoes: [
        { jogadorId: cenario.idsG.jogadorAtivo, situacao: 'ausente' },
        { jogadorId: cenario.idsG.jogadorHistorico, situacao: 'lesionado' },
      ],
    });
    expect(r).toEqual({ resultado: 'ok', contagem: { presentes: 0, lesionados: 1, expulsos: 0 } });
    expect(await estado()).toEqual({
      partida: { choveu: true, alterada_por: cenario.contaO },
      presencas: [{ jogador_id: cenario.idsG.jogadorHistorico, situacao: 'lesionado' }],
    });
    expect(await auditorias('partida_editada')).toEqual([
      {
        autor: cenario.contaO,
        resumo: { data: DATA, choveu: true, presentes: 0, lesionados: 1, expulsos: 0 },
      },
    ]);
  });

  it('PAR-46: todas ausentes deixam a partida sem presenças', async () => {
    const { cenario } = aberto;
    await editarComo(cenario.contaC, { data: DATA, choveu: false, marcacoes: [] });
    expect((await estado()).presencas).toEqual([]);
  });

  it('PAR-45: sem partida na data, nao_encontrada, sem gravar', async () => {
    const { cenario } = aberto;
    const r = await editarComo(cenario.contaC, { data: '2026-02-06', choveu: true, marcacoes: [] }, '2026-02-06');
    expect(r).toEqual({ resultado: 'nao_encontrada' });
    expect(await auditorias('partida_editada')).toEqual([]);
  });

  it('PAR-47: data do corpo diferente da do caminho: data_alterada, sem gravar', async () => {
    const { cenario } = aberto;
    const antes = await estado();
    const r = await editarComo(cenario.contaC, { data: '2026-02-06', choveu: true, marcacoes: [] });
    expect(r).toEqual({ resultado: 'data_alterada' });
    expect(await estado()).toEqual(antes);
  });

  it('PAR-48: jogador ativo hoje mas não na data da partida é recusado, sem gravar', async () => {
    const { cenario } = aberto;
    const antes = await estado();
    const r = await editarComo(cenario.contaC, {
      data: DATA,
      choveu: true,
      marcacoes: [{ jogadorId: novato, situacao: 'presente' }],
    });
    expect(r).toEqual({ resultado: 'invalido', campos: { 'marcacoes.0.jogadorId': MENSAGEM_JOGADOR_INATIVO } });
    expect(await estado()).toEqual(antes);
  });

  it('PAR-49: editar não grava evento de uso', async () => {
    const { cenario } = aberto;
    const antes = await eventos();
    await editarComo(cenario.contaC, { data: DATA, choveu: true, marcacoes: [] });
    expect(await eventos()).toBe(antes);
  });

  it('PAR-49: falha forçada na auditoria desfaz a chuva e a troca das presenças', async () => {
    const { cenario } = aberto;
    const antes = await estado();
    await aberto.db.query(
      `CREATE FUNCTION falha_teste_par49() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.acao = 'partida_editada' THEN RAISE EXCEPTION 'falha forçada (PAR-49)'; END IF;
         RETURN NEW;
       END $$`,
    );
    await aberto.db.query(
      'CREATE TRIGGER falha_teste_par49 BEFORE INSERT ON auditoria FOR EACH ROW EXECUTE FUNCTION falha_teste_par49()',
    );
    await expect(
      editarComo(cenario.contaC, {
        data: DATA,
        choveu: true,
        marcacoes: [{ jogadorId: cenario.idsG.jogadorHistorico, situacao: 'expulso' }],
      }),
    ).rejects.toThrow('falha forçada');
    expect(await estado()).toEqual(antes);
  });

  it('PAR-49: editar enquanto outra conexão altera o período do mesmo jogador serializa (AD-038)', async () => {
    const { cenario } = aberto;
    const bira = cenario.idsG.jogadorHistorico;
    let liberar!: () => void;
    const segurando = new Promise<void>((r) => (liberar = r));
    let avisarTravou!: () => void;
    const travou = new Promise<void>((r) => (avisarTravou = r));
    let edicaoTerminou = false;

    const escritaDePeriodo = comDb(aberto.url, cenario.contaC, async (db) => {
      await jogadores.alterarInicio(db, cenario.grupoG, bira, { data: '2026-01-01' }, HOJE);
      avisarTravou();
      await segurando;
    });
    await travou;
    const edicao = comDb(
      aberto.url,
      cenario.contaO,
      async (db) => {
        const r = await partidas.editar(db, cenario.grupoG, DATA, {
          data: DATA,
          choveu: false,
          marcacoes: [{ jogadorId: bira, situacao: 'presente' }],
        });
        edicaoTerminou = true;
        return r;
      },
      { confirmar: true },
    );
    await espera(300);
    expect(edicaoTerminou, 'a edição precisa esperar a trava do jogador').toBe(false);
    liberar();
    const [, r] = await Promise.all([escritaDePeriodo, edicao]);
    expect(r.resultado).toBe('ok');
  });
});

describe('partidas.excluir', () => {
  it('PAR-50: apaga a partida e as presenças e audita partida_excluida com a data', async () => {
    const { cenario } = aberto;
    expect(await excluirComo(cenario.contaC)).toEqual({ resultado: 'ok' });
    expect(await estado()).toEqual({ partida: null, presencas: [] });
    expect(await auditorias('partida_excluida')).toEqual([{ autor: cenario.contaC, resumo: { data: DATA } }]);
  });

  it('PAR-51: excluir mantém o evento partida_lancada', async () => {
    const { cenario } = aberto;
    await excluirComo(cenario.contaC);
    expect(await eventos()).toBe(1);
  });

  it('PAR-45: sem partida na data, nao_encontrada', async () => {
    const { cenario } = aberto;
    expect(await excluirComo(cenario.contaC, '2026-02-06')).toEqual({ resultado: 'nao_encontrada' });
  });

  it('PAR-50: a conta de outro grupo não encontra a partida de G', async () => {
    const { cenario } = aberto;
    expect(await excluirComo(cenario.contaB)).toEqual({ resultado: 'nao_encontrada' });
    expect((await estado()).partida).not.toBeNull();
  });
});
