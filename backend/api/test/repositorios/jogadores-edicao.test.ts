import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { jogadoresEdicao } from '../../src/infraestrutura/db/repositorios/jogadores-edicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Editar e excluir o jogador (T35; GEL-41 a GEL-45, GEL-84, GEL-85, SEC-008), contra o cenário de grupos. Os jogadores
 * de cada caso nascem como superusuário (com período aberto) e saem no `afterEach`, com o histórico que o caso criou.
 * Os casos que conferem a auditoria confirmam a transação.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

const EDICAO = {
  apelido: 'Editado',
  anoNascimento: 1990,
  posicao: 'meia',
  telefone: '11912345678',
} as const;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db } = aberto;
  for (const tabela of ['presencas', 'notas', 'pagamentos_mes']) {
    await db.query(`DELETE FROM ${tabela} WHERE jogador_id = ANY($1::uuid[])`, [criados]);
  }
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
});

/** Jogador novo em G, como superusuário, com período aberto desde 2026-01-01. */
async function novoJogador(
  apelido: string,
  extra: { telefone?: string; pontuacao?: number } = {},
): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', $3, $4, $5, now(), $5, now()) RETURNING id`,
    [
      cenario.grupoG,
      apelido,
      extra.telefone ?? '11912345678',
      extra.pontuacao ?? 10,
      cenario.contaC,
    ],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
    [id, cenario.grupoG],
  );
  criados.push(id);
  return id;
}

async function eventos(
  acao: string,
  id: string,
): Promise<Array<{ autor: string; resumo: Record<string, unknown> }>> {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    `SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = $1 AND entidade_id = $2 ORDER BY momento, id`,
    [acao, id],
  );
  return r.rows;
}

async function linha(id: string) {
  const r = await aberto.db.query(
    `SELECT apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, inicio_pontuacao::text AS inicio_pontuacao
       FROM jogadores WHERE id = $1`,
    [id],
  );
  return r.rows[0];
}

describe('jogadoresEdicao.editar', () => {
  it('GEL-41, GEL-43: editar sem pontuação grava os dados e mantém a pontuação', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Antes', { pontuacao: 42 });
    const r = await comDb(
      url,
      cenario.contaO,
      (db) => jogadoresEdicao.editar(db, cenario.grupoG, id, EDICAO),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', mudou: true });
    expect(await linha(id)).toMatchObject({ apelido: 'Editado', pontuacao_inicial: 42 });
    expect(await eventos('jogador_pontuacao_inicial_alterada', id)).toEqual([]);
  });

  it('GEL-42: mudar a pontuação audita o valor antigo e o novo', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Pontuado', { pontuacao: 10 });
    await comDb(
      url,
      cenario.contaO,
      (db) =>
        jogadoresEdicao.editar(db, cenario.grupoG, id, {
          ...EDICAO,
          apelido: 'Pontuado',
          pontuacaoInicial: 250,
        }),
      {
        confirmar: true,
      },
    );
    expect((await linha(id))?.pontuacao_inicial).toBe(250);
    const a = await eventos('jogador_pontuacao_inicial_alterada', id);
    expect(a).toHaveLength(1);
    expect(a[0]).toEqual({ autor: cenario.contaO, resumo: { antes: 10, depois: 250 } });
  });

  it('SEC-008: editar o telefone grava jogador_editado com campos ["telefone"] e sem o número', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Fone', { telefone: '11912345678' });
    await comDb(
      url,
      cenario.contaC,
      (db) =>
        jogadoresEdicao.editar(db, cenario.grupoG, id, {
          ...EDICAO,
          apelido: 'Fone',
          telefone: '21998765432',
        }),
      { confirmar: true },
    );
    const a = await eventos('jogador_editado', id);
    expect(a).toHaveLength(1);
    expect(a[0]?.resumo).toEqual({ campos: ['telefone'] });
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('21998765432');
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('11912345678');
  });

  it('SEC-008: editar sem mudar nada não grava nem audita', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Igual', { telefone: '11912345678', pontuacao: 10 });
    const r = await comDb(
      url,
      cenario.contaC,
      (db) =>
        jogadoresEdicao.editar(db, cenario.grupoG, id, {
          ...EDICAO,
          apelido: 'Igual',
          pontuacaoInicial: 10,
        }),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok', mudou: false });
    expect(await eventos('jogador_editado', id)).toEqual([]);
  });

  it('GEL-41: a edição não mexe no início da pontuação nem nos períodos', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Datas');
    const antes = await aberto.db.query(
      'SELECT inicio::text, fim::text FROM periodos_ativos WHERE jogador_id = $1',
      [id],
    );
    const inicioAntes = (await linha(id))?.inicio_pontuacao;
    await comDb(
      url,
      cenario.contaC,
      (db) => jogadoresEdicao.editar(db, cenario.grupoG, id, EDICAO),
      { confirmar: true },
    );
    const depois = await aberto.db.query(
      'SELECT inicio::text, fim::text FROM periodos_ativos WHERE jogador_id = $1',
      [id],
    );
    expect(depois.rows).toEqual(antes.rows);
    expect((await linha(id))?.inicio_pontuacao).toBe(inicioAntes);
  });

  it('GEL-35: apelido de outro jogador do grupo, sem caixa, dá apelido_repetido', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Único');
    const r = await comDb(url, cenario.contaC, (db) =>
      jogadoresEdicao.editar(db, cenario.grupoG, id, { ...EDICAO, apelido: 'TONINHO' }),
    );
    expect(r).toEqual({ resultado: 'apelido_repetido' });
  });

  it('GEL-41: manter o próprio apelido, mudando só a caixa, é aceito', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Caixa');
    const r = await comDb(url, cenario.contaC, (db) =>
      jogadoresEdicao.editar(db, cenario.grupoG, id, { ...EDICAO, apelido: 'CAIXA' }),
    );
    expect(r.resultado).toBe('ok');
  });

  it('GEL-44: jogador de outro grupo dá nao_encontrado e nada muda', async () => {
    const { url, cenario } = aberto;
    const r = await comDb(
      url,
      cenario.contaB,
      (db) => jogadoresEdicao.editar(db, cenario.grupoH, cenario.idsG.jogadorAtivo, EDICAO),
      {
        confirmar: true,
      },
    );
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect((await linha(cenario.idsG.jogadorAtivo))?.apelido).toBe('Toninho');
  });
});

describe('jogadoresEdicao.excluir', () => {
  it('GEL-84, GEL-45: sem histórico apaga o jogador e os períodos e audita jogador_excluido', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Sem Histórico');
    const r = await comDb(
      url,
      cenario.contaC,
      (db) => jogadoresEdicao.excluir(db, cenario.grupoG, id),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'ok' });
    expect((await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(0);
    expect(
      (await aberto.db.query('SELECT 1 FROM periodos_ativos WHERE jogador_id = $1', [id])).rowCount,
    ).toBe(0);
    const a = await eventos('jogador_excluido', id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(cenario.contaC);
  });

  const historicos: Array<[string, (id: string) => Promise<void>]> = [
    [
      'presença',
      async (id) => {
        await aberto.db.query(
          `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`,
          [aberto.cenario.idsG.partida, id, aberto.cenario.grupoG],
        );
      },
    ],
    [
      'nota',
      async (id) => {
        await aberto.db.query(
          'INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 8)',
          [id, aberto.cenario.idsG.habilidade, aberto.cenario.grupoG],
        );
      },
    ],
    [
      'pagamento',
      async (id) => {
        const { cenario } = aberto;
        const l = await aberto.db.query<{ id: string }>(
          `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
           VALUES ($1, 'entrada', '2026-02-05', 'Mensalidade teste', 5000, $2, now(), $2, now()) RETURNING id`,
          [cenario.grupoG, cenario.contaC],
        );
        await aberto.db.query(
          `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
           VALUES ($1, $2, '2026-02', $3, $4, now())`,
          [cenario.grupoG, id, l.rows[0]!.id, cenario.contaC],
        );
      },
    ],
  ];

  it.each(historicos)(
    'GEL-85: com %s recusa como com_historico, sem apagar nem auditar',
    async (_tipo, criarHistorico) => {
      const { url, cenario } = aberto;
      const id = await novoJogador(`Histórico ${_tipo}`);
      await criarHistorico(id);
      const r = await comDb(
        url,
        cenario.contaC,
        (db) => jogadoresEdicao.excluir(db, cenario.grupoG, id),
        { confirmar: true },
      );
      expect(r).toEqual({ resultado: 'com_historico', apelido: `Histórico ${_tipo}` });
      expect((await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(
        1,
      );
      expect(
        (await aberto.db.query('SELECT 1 FROM periodos_ativos WHERE jogador_id = $1', [id]))
          .rowCount,
      ).toBe(1);
      expect(await eventos('jogador_excluido', id)).toEqual([]);
    },
  );

  it('GEL-44: jogador de outro grupo dá nao_encontrado e não é apagado', async () => {
    const { url, cenario } = aberto;
    const id = await novoJogador('Alheio');
    const r = await comDb(
      url,
      cenario.contaB,
      (db) => jogadoresEdicao.excluir(db, cenario.grupoH, id),
      { confirmar: true },
    );
    expect(r).toEqual({ resultado: 'nao_encontrado' });
    expect((await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(1);
  });
});

describe('excluir por admin sem acesso ao financeiro (S-2; GEL-85, FIN-38)', () => {
  it('GEL-85: com pagamento que a RLS esconde, recusa como com_historico em vez de estourar a FK (500)', async () => {
    const { url, cenario, db } = aberto;
    const id = await novoJogador('Histórico oculto');
    const l = await db.query<{ id: string }>(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'entrada', '2026-02-05', 'Mensalidade oculta', 5000, $2, now(), $2, now()) RETURNING id`,
      [cenario.grupoG, cenario.contaC],
    );
    try {
      await db.query(
        `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
         VALUES ($1, $2, '2026-02', $3, $4, now())`,
        [cenario.grupoG, id, l.rows[0]!.id, cenario.contaC],
      );
      const r = await comDb(
        url,
        cenario.contaO,
        (conexao) => jogadoresEdicao.excluir(conexao, cenario.grupoG, id),
        { confirmar: true },
      );
      expect(r).toEqual({ resultado: 'com_historico', apelido: 'Histórico oculto' });
      expect((await db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(1);
      expect(await eventos('jogador_excluido', id)).toEqual([]);
    } finally {
      await db.query('DELETE FROM pagamentos_mes WHERE jogador_id = $1', [id]);
      await db.query('DELETE FROM lancamentos WHERE id = $1', [l.rows[0]!.id]);
    }
  });
});
