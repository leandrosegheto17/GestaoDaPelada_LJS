import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET`, `PATCH` e `DELETE /api/grupos/:grupoId/jogadores/:id` (T37; GEL-41, GEL-44, GEL-84, GEL-85), com o app real
 * como `pelada_app` contra o cenário de grupos. Bira (`jogadorHistorico`) tem presença, nota e pagamento; os jogadores
 * novos de cada caso nascem como superusuário e saem no `afterEach`.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

const EDICAO = { apelido: 'Editado Rota', anoNascimento: 1991, posicao: 'atacante' } as const;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function novoJogador(apelido: string): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em, inicio_pontuacao)
     VALUES ($1, $2, 1990, 'meia', 5, $3, now(), $3, now(), '2026-01-01') RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
    [id, cenario.grupoG],
  );
  criados.push(id);
  return id;
}

function jogador(id: string, conta: string, metodo = 'GET', corpo?: unknown) {
  return sessao(conta).then((token) =>
    cliente(aberto.url)(`/grupos/${aberto.cenario.grupoG}/jogadores/${id}`, {
      metodo,
      sessao: token,
      ...(corpo !== undefined ? { corpo } : {}),
    }),
  );
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
});

describe('GET /api/grupos/:grupoId/jogadores/:id', () => {
  it('GEL-46: devolve a ficha com períodos e notas', async () => {
    const r = await jogador(aberto.cenario.idsG.jogadorHistorico, aberto.cenario.contaO);
    expect(r.status).toBe(200);
    const ficha = (await r.json()) as { apelido: string; periodos: unknown[]; notas: unknown[] };
    expect(ficha.apelido).toBe('Bira');
    expect(ficha.periodos).toHaveLength(1);
    expect(ficha.notas).toHaveLength(6);
  });
});

describe('PATCH /api/grupos/:grupoId/jogadores/:id', () => {
  it('GEL-41: PATCH válido dá 200, grava e ignora a dataEntrada enviada', async () => {
    const id = await novoJogador('Para Editar');
    const r = await jogador(id, aberto.cenario.contaC, 'PATCH', {
      ...EDICAO,
      dataEntrada: '2020-05-05',
    });
    expect(r.status).toBe(200);
    const ficha = (await r.json()) as Record<string, unknown>;
    expect(ficha).toMatchObject({
      apelido: 'Editado Rota',
      posicao: 'atacante',
      inicioPontuacao: '2026-01-01',
      pontuacaoInicial: 5,
    });
    expect(ficha.periodos).toEqual([expect.objectContaining({ inicio: '2026-01-01', fim: null })]);
  });

  it('GEL-41: as mesmas validações do cadastro: apelido curto dá 422', async () => {
    const id = await novoJogador('Valida');
    const r = await jogador(id, aberto.cenario.contaC, 'PATCH', { ...EDICAO, apelido: 'X' });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { campos: string[] }).campos).toContain('apelido');
  });

  it('GEL-41: a dataEntrada ignorada não esconde outro campo extra (continua 422)', async () => {
    const id = await novoJogador('Estrito');
    const r = await jogador(id, aberto.cenario.contaC, 'PATCH', {
      ...EDICAO,
      dataEntrada: '2020-05-05',
      inicioPontuacao: '2020-05-05',
    });
    expect(r.status).toBe(422);
  });
});

describe('DELETE /api/grupos/:grupoId/jogadores/:id', () => {
  it('GEL-84: sem histórico dá 204 e o jogador some', async () => {
    const id = await novoJogador('Some');
    const r = await jogador(id, aberto.cenario.contaC, 'DELETE');
    expect(r.status).toBe(204);
    expect((await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(0);
  });

  it('GEL-85: com histórico dá 409 com código, mensagem com o apelido e sugestão inativar', async () => {
    const r = await jogador(aberto.cenario.idsG.jogadorHistorico, aberto.cenario.contaC, 'DELETE');
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      codigo: 'jogador_com_historico',
      erro: 'Bira tem histórico de partidas e não pode ser excluído.',
      sugestao: 'inativar',
    });
    expect(
      (
        await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [
          aberto.cenario.idsG.jogadorHistorico,
        ])
      ).rowCount,
    ).toBe(1);
  });

  it('GEL-85 (SV-02): admin sem acesso ao financeiro também recebe 409 quando o único histórico é um pagamento', async () => {
    const id = await novoJogador('So Pagamento');
    await aberto.db.query(
      `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, marcado_por, marcado_em)
       VALUES ($1, $2, '2026-02', $3, now())`,
      [aberto.cenario.grupoG, id, aberto.cenario.contaC],
    );
    try {
      const r = await jogador(id, aberto.cenario.contaO, 'DELETE');
      expect(r.status).toBe(409);
      expect(await r.json()).toEqual({
        codigo: 'jogador_com_historico',
        erro: 'So Pagamento tem histórico de partidas e não pode ser excluído.',
        sugestao: 'inativar',
      });
      expect((await aberto.db.query('SELECT 1 FROM jogadores WHERE id = $1', [id])).rowCount).toBe(
        1,
      );
    } finally {
      await aberto.db.query('DELETE FROM pagamentos_mes WHERE jogador_id = $1', [id]);
    }
  });
});

describe('GEL-44: jogador de outro grupo', () => {
  async function jogadorDeH(): Promise<string> {
    const { db, cenario } = aberto;
    const r = await db.query<{ id: string }>(
      `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                              alterado_por, alterado_em)
       VALUES ($1, 'Do Grupo H', 1990, 'meia', 0, $2, now(), $2, now()) RETURNING id`,
      [cenario.grupoH, cenario.contaB],
    );
    const id = r.rows[0]!.id;
    await db.query(
      `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
      [id, cenario.grupoH],
    );
    criados.push(id);
    return id;
  }

  it.each(['GET', 'PATCH', 'DELETE'])(
    'GEL-44: %s com o id de um jogador de H, pelo grupo G, dá 404 e nada muda',
    async (metodo) => {
      const id = await jogadorDeH();
      const r = await jogador(
        id,
        aberto.cenario.contaC,
        metodo,
        metodo === 'PATCH' ? EDICAO : undefined,
      );
      expect(r.status).toBe(404);
      const linha = await aberto.db.query<{ apelido: string }>(
        'SELECT apelido FROM jogadores WHERE id = $1',
        [id],
      );
      expect(linha.rows[0]?.apelido).toBe('Do Grupo H');
    },
  );

  it.each(['GET', 'PATCH', 'DELETE'])('GEL-44: %s com id que não é uuid dá 404', async (metodo) => {
    const r = await jogador(
      'nao-e-uuid',
      aberto.cenario.contaC,
      metodo,
      metodo === 'PATCH' ? EDICAO : undefined,
    );
    expect(r.status).toBe(404);
  });
});
