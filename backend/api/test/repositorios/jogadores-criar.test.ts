import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { erroDeUnicidade, MENSAGEM_APELIDO_REPETIDO } from '../../src/entrada/corpo.ts';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Cadastro de jogador (T34; GEL-31, GEL-32, GEL-35, GEL-38, GEL-45), contra o cenário de grupos (G já tem Toninho,
 * Zé Inativo e Bira). Os casos que conferem a auditoria (a `pelada_app` só insere nela) confirmam a transação; o
 * `afterEach` apaga os jogadores criados (os períodos saem pelo cascade).
 */

let aberto: CenarioGruposAberto;

/** "Hoje" do relógio falso: a rota passa o `hoje()` do relógio injetado (T19). */
const HOJE = '2026-06-15';

/** O corpo já passado pelo contrato: telefone ausente ou vazio chega nulo (GEL-38, T17). */
const NOVO = {
  apelido: 'Novato',
  anoNascimento: 1995,
  posicao: 'meia',
  telefone: null,
  pontuacaoInicial: 0,
} as const;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query(`DELETE FROM jogadores WHERE grupo_id = $1 AND id NOT IN ($2, $3, $4)`, [
    cenario.grupoG,
    cenario.idsG.jogadorAtivo,
    cenario.idsG.jogadorInativo,
    cenario.idsG.jogadorHistorico,
  ]);
});

async function jogadorGravado(id: string) {
  const r = await aberto.db.query(
    `SELECT apelido, telefone, pontuacao_inicial, inicio_pontuacao::text AS inicio_pontuacao, criado_por FROM jogadores WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

async function periodosDe(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

/** Espera alguma conexão do banco de teste parar numa trava. */
async function esperarAlguemNaTrava(prazoMs = 5000): Promise<void> {
  const limite = Date.now() + prazoMs;
  while (Date.now() < limite) {
    const r = await aberto.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`,
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await new Promise((ok) => setTimeout(ok, 20));
  }
  throw new Error('Nenhuma conexão esperou na trava');
}

describe('jogadores.criar', () => {
  it('GEL-31, GEL-32: sem data de entrada, período aberto e inicio_pontuacao em hoje', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaC,
      (db) => jogadores.criar(db, cenario.grupoG, NOVO, HOJE),
      { confirmar: true },
    );
    expect(r.resultado).toBe('ok');
    if (r.resultado !== 'ok') return;
    expect(await periodosDe(r.id)).toEqual([{ inicio: HOJE, fim: null }]);
    expect(await jogadorGravado(r.id)).toMatchObject({
      apelido: 'Novato',
      inicio_pontuacao: HOJE,
      criado_por: cenario.contaC,
    });
  });

  it('GEL-31: com data de entrada, o período e o início da pontuação começam nela', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaC,
      (db) =>
        jogadores.criar(
          db,
          cenario.grupoG,
          { ...NOVO, apelido: 'Com Data', dataEntrada: '2026-03-10' },
          HOJE,
        ),
      { confirmar: true },
    );
    if (r.resultado !== 'ok') throw new Error('esperava ok');
    expect(await periodosDe(r.id)).toEqual([{ inicio: '2026-03-10', fim: null }]);
    expect((await jogadorGravado(r.id))?.inicio_pontuacao).toBe('2026-03-10');
  });

  it.each(['toninho', 'TONINHO', 'ToNiNhO'])(
    'GEL-35: "%s" com "Toninho" existente dá apelido_repetido e nada é gravado',
    async (apelido) => {
      const { url, cenario } = aberto;
      const r = await comDb(
        url,
        cenario.contaC,
        (db) => jogadores.criar(db, cenario.grupoG, { ...NOVO, apelido }, HOJE),
        {
          confirmar: true,
        },
      );
      expect(r).toEqual({ resultado: 'apelido_repetido' });
      const n = await aberto.db.query(
        'SELECT 1 FROM jogadores WHERE grupo_id = $1 AND lower(apelido) = $2',
        [cenario.grupoG, 'toninho'],
      );
      expect(n.rowCount).toBe(1);
    },
  );

  it('GEL-35: o acento conta: "Ze Inativo" não colide com "Zé Inativo"', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaC, (db) =>
      jogadores.criar(db, cenario.grupoG, { ...NOVO, apelido: 'Ze Inativo' }, HOJE),
    );
    expect(r.resultado).toBe('ok');
  });

  it('GEL-35: o mesmo apelido em outro grupo é aceito', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(url, cenario.contaB, (db) =>
      jogadores.criar(db, cenario.grupoH, { ...NOVO, apelido: 'Toninho' }, HOJE),
    );
    expect(r.resultado).toBe('ok');
  });

  it('GEL-35: dois cadastros simultâneos do mesmo apelido: um grava e o outro cai no índice e vira o 422 do apelido', async () => {
    const { url, cenario } = aberto;
    let liberar: () => void = () => undefined;
    const segura = new Promise<void>((ok) => {
      liberar = ok;
    });
    let primeiroGravou: () => void = () => undefined;
    const gravou = new Promise<void>((ok) => {
      primeiroGravou = ok;
    });
    const dados = { ...NOVO, apelido: 'Gêmeo' };

    const primeiro = comDb(
      url,
      cenario.contaC,
      async (db) => {
        const r = await jogadores.criar(db, cenario.grupoG, dados, HOJE);
        primeiroGravou();
        await segura;
        return r;
      },
      { confirmar: true },
    );
    await gravou;
    // O segundo não vê o primeiro (não confirmado), passa pela consulta e para no índice único.
    const segundo = comDb(
      url,
      cenario.contaO,
      (db) => jogadores.criar(db, cenario.grupoG, dados, HOJE),
      { confirmar: true },
    ).then(
      (r) => ({ ok: true as const, r }),
      (erro: unknown) => ({ ok: false as const, erro }),
    );
    try {
      await esperarAlguemNaTrava();
    } finally {
      liberar();
    }
    expect((await primeiro).resultado).toBe('ok');
    const s = await segundo;
    expect(s.ok).toBe(false);
    if (s.ok) return;
    expect(erroDeUnicidade(s.erro)).toEqual({
      campo: 'apelido',
      mensagem: MENSAGEM_APELIDO_REPETIDO,
    });
    const n = await aberto.db.query(
      `SELECT 1 FROM jogadores WHERE grupo_id = $1 AND apelido = 'Gêmeo'`,
      [cenario.grupoG],
    );
    expect(n.rowCount).toBe(1);
  });

  it('GEL-38: telefone nulo (ausente ou vazio no corpo) grava nulo', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaC,
      (db) =>
        jogadores.criar(db, cenario.grupoG, { ...NOVO, apelido: 'Sem Fone', telefone: null }, HOJE),
      { confirmar: true },
    );
    if (r.resultado !== 'ok') throw new Error('esperava ok');
    expect((await jogadorGravado(r.id))?.telefone).toBeNull();
  });

  it('GEL-45: jogador_criado com o id do jogador, a conta autora e sem telefone nem ano', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaC,
      (db) =>
        jogadores.criar(
          db,
          cenario.grupoG,
          { ...NOVO, apelido: 'Auditado', telefone: '11987654321', anoNascimento: 1988 },
          HOJE,
        ),
      { confirmar: true },
    );
    if (r.resultado !== 'ok') throw new Error('esperava ok');
    const a = await aberto.db.query<{
      autor: string;
      entidade_id: string;
      resumo: Record<string, unknown>;
    }>(
      `SELECT autor_conta_id AS autor, entidade_id, resumo FROM auditoria WHERE acao = 'jogador_criado' AND entidade_id = $1`,
      [r.id],
    );
    expect(a.rows).toHaveLength(1);
    expect(a.rows[0]).toMatchObject({ autor: cenario.contaC, entidade_id: r.id });
    const texto = JSON.stringify(a.rows[0]?.resumo);
    expect(texto).not.toContain('11987654321');
    expect(texto).not.toContain('1988');
  });
});
