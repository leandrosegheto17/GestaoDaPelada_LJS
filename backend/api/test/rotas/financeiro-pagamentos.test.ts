import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { mesFinanceiroResposta } from '@pelada/contrato';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { auditorias, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * `POST` e `DELETE /api/grupos/:grupoId/financeiro/pagamentos` (financeiro T27; FIN-16 a FIN-20, FIN-22, FIN-23), com o
 * app real como `pelada_app` e o relógio fixo em 2026-10-15 (São Paulo). G: mensalidade 5000; Toninho e Bira ativos
 * desde 2026-01-01, Zé Inativo só em 2025; Bira já pagou 2026-01. O `afterEach` restaura o caixa.
 *
 * Casos limite: mês de hoje e mês passado aceitos, mês seguinte recusado; jogador inativo, de outro grupo e inexistente
 * (mesma mensagem); sem mensalidade (só o pagamento); segunda marcação (409); duas marcações simultâneas (204 e 409, um
 * lançamento); desmarcar a entrada editada; desmarcar inexistente (404), mês malformado (422), id malformado (404), dois
 * DELETE simultâneos (204 e 404, nenhum 500).
 */

let aberto: CenarioGruposAberto;
let deH = '';

const base = () => `/grupos/${aberto.cenario.grupoG}/financeiro/pagamentos`;
const marcar = (corpo: unknown, conta = aberto.cenario.contaC) =>
  pedir(aberto, { metodo: 'POST', caminho: base(), conta, corpo });
const desmarcar = (jogador: string, mes: string, conta = aberto.cenario.contaC) =>
  pedir(aberto, { metodo: 'DELETE', caminho: `${base()}/${jogador}/${mes}`, conta });

async function pagamentos(
  jogador: string,
  mes: string,
): Promise<Array<{ lancamento_id: string | null }>> {
  const r = await aberto.db.query<{ lancamento_id: string | null }>(
    'SELECT lancamento_id FROM pagamentos_mes WHERE grupo_id = $1 AND jogador_id = $2 AND mes = $3',
    [aberto.cenario.grupoG, jogador, mes],
  );
  return r.rows;
}

async function lancamentosComDescricao(
  descricao: string,
): Promise<Array<{ id: string; valor_centavos: number; data: string }>> {
  const r = await aberto.db.query<{ id: string; valor_centavos: number; data: string }>(
    `SELECT id, valor_centavos, data::text AS data FROM lancamentos WHERE grupo_id = $1 AND descricao = $2`,
    [aberto.cenario.grupoG, descricao],
  );
  return r.rows;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Do Outro Grupo', 'meia', $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoH, cenario.contaB],
  );
  deH = r.rows[0]!.id;
  await db.query(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`,
    [deH, cenario.grupoH],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await restaurarCaixa(aberto);
});

describe('POST …/financeiro/pagamentos', () => {
  it('FIN-16: 204 e o mês mostra a entrada "Mensalidade Toninho 10/2026" com o valor da configuração e hoje', async () => {
    const { idsG } = aberto.cenario;
    const antes = await auditorias(aberto, aberto.cenario.grupoG, 'pagamento_marcado');
    const r = await marcar({ jogadorId: idsG.jogadorAtivo, mes: '2026-10' });
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');

    const mes = mesFinanceiroResposta.parse(
      await (
        await pedir(aberto, {
          metodo: 'GET',
          caminho: `/grupos/${aberto.cenario.grupoG}/financeiro/mes`,
          conta: aberto.cenario.contaC,
        })
      ).json(),
    );
    expect(mes.lancamentos).toEqual([
      expect.objectContaining({
        tipo: 'entrada',
        data: '2026-10-15',
        descricao: 'Mensalidade Toninho 10/2026',
        valorCentavos: 5000,
        mensalidade: true,
      }),
    ]);
    expect(mes.pagamentos.find((p) => p.jogadorId === idsG.jogadorAtivo)?.pagou).toBe(true);
    expect(await auditorias(aberto, aberto.cenario.grupoG, 'pagamento_marcado')).toBe(antes + 1);
  });

  it('FIN-16: o valor do corpo é recusado (o valor vem só da configuração)', async () => {
    const r = await marcar({
      jogadorId: aberto.cenario.idsG.jogadorAtivo,
      mes: '2026-10',
      valorCentavos: 1,
    });
    expect(r.status).toBe(422);
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-10')).toEqual([]);
  });

  it('FIN-16: mês passado do histórico também é marcado, com a data de hoje', async () => {
    const r = await marcar({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-03' });
    expect(r.status).toBe(204);
    expect(await lancamentosComDescricao('Mensalidade Toninho 03/2026')).toEqual([
      expect.objectContaining({ valor_centavos: 5000, data: '2026-10-15' }),
    ]);
  });

  it('FIN-17: sem mensalidade, só o pagamento, com lancamento_id nulo', async () => {
    await aberto.db.query(
      'UPDATE config_financeira SET mensalidade_centavos = NULL WHERE grupo_id = $1',
      [aberto.cenario.grupoG],
    );
    const r = await marcar({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' });
    expect(r.status).toBe(204);
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-10')).toEqual([
      { lancamento_id: null },
    ]);
    expect(await lancamentosComDescricao('Mensalidade Toninho 10/2026')).toEqual([]);
  });

  it('FIN-18: novembro com hoje em outubro dá 422 no campo mes, sem gravar', async () => {
    const r = await marcar({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-11' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      campos: ['mes'],
      mensagens: { mes: 'Não dá para marcar o pagamento de um mês que ainda não começou.' },
    });
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-11')).toEqual([]);
  });

  it('FIN-18: mês malformado dá 422 no campo mes', async () => {
    const r = await marcar({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-13' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { mes: 'Mês inválido.' } });
  });

  it('FIN-19: jogador do grupo B dá 422 com a mensagem em jogadorId, sem revelar o jogador', async () => {
    const r = await marcar({ jogadorId: deH, mes: '2026-10' });
    expect(r.status).toBe(422);
    const texto = await r.text();
    expect(JSON.parse(texto)).toMatchObject({
      campos: ['jogadorId'],
      mensagens: { jogadorId: 'O jogador precisa estar ativo no grupo nesse mês.' },
    });
    expect(texto).not.toContain('Do Outro Grupo');
    const r2 = await aberto.db.query('SELECT 1 FROM pagamentos_mes WHERE jogador_id = $1', [deH]);
    expect(r2.rows).toEqual([]);
  });

  it.each([
    ['inativo no mês', () => aberto.cenario.idsG.jogadorInativo],
    ['inexistente', () => crypto.randomUUID()],
  ])('FIN-19: jogador %s dá a mesma 422 em jogadorId', async (_nome, id) => {
    const r = await marcar({ jogadorId: id(), mes: '2026-10' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      mensagens: { jogadorId: 'O jogador precisa estar ativo no grupo nesse mês.' },
    });
  });

  it('FIN-19: id que não é uuid dá 422 em jogadorId', async () => {
    const r = await marcar({ jogadorId: 'abc', mes: '2026-10' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['jogadorId'] });
  });

  it('FIN-20: segunda marcação dá 409 com código e mensagem, e um lançamento só', async () => {
    const corpo = { jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' };
    expect((await marcar(corpo)).status).toBe(204);
    const r = await marcar(corpo);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'O pagamento deste mês já está marcado.',
      codigo: 'pagamento_ja_marcado',
    });
    expect(await lancamentosComDescricao('Mensalidade Toninho 10/2026')).toHaveLength(1);
  });

  it('FIN-20: duas marcações simultâneas dão 204 e 409, com um pagamento e um lançamento', async () => {
    const corpo = { jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' };
    const respostas = await Promise.all([marcar(corpo), marcar(corpo)]);
    expect(respostas.map((r) => r.status).sort()).toEqual([204, 409]);
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-10')).toHaveLength(1);
    expect(await lancamentosComDescricao('Mensalidade Toninho 10/2026')).toHaveLength(1);
  });

  it('FIN-33: admin sem acesso recebe 403 e nada é gravado', async () => {
    const r = await marcar(
      { jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' },
      aberto.cenario.contaO,
    );
    expect(r.status).toBe(403);
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-10')).toEqual([]);
  });

  it('FIN-37: grupo arquivado dá 409 grupo_arquivado e nada é gravado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await marcar({ jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await pagamentos(aberto.cenario.idsG.jogadorAtivo, '2026-10')).toEqual([]);
  });
});

describe('DELETE …/financeiro/pagamentos/:jogadorId/:mes', () => {
  it('FIN-22: 204 apaga o pagamento e a entrada editada, e audita o valor editado', async () => {
    const { idsG, grupoG } = aberto.cenario;
    expect((await marcar({ jogadorId: idsG.jogadorAtivo, mes: '2026-10' })).status).toBe(204);
    await aberto.db.query(
      `UPDATE lancamentos SET valor_centavos = 4500 WHERE grupo_id = $1 AND descricao = 'Mensalidade Toninho 10/2026'`,
      [grupoG],
    );

    const r = await desmarcar(idsG.jogadorAtivo, '2026-10');
    expect(r.status).toBe(204);
    expect(await pagamentos(idsG.jogadorAtivo, '2026-10')).toEqual([]);
    expect(await lancamentosComDescricao('Mensalidade Toninho 10/2026')).toEqual([]);
    const ultima = await aberto.db.query<{ resumo: unknown }>(
      `SELECT resumo FROM auditoria WHERE grupo_id = $1 AND acao = 'pagamento_desmarcado' ORDER BY momento DESC, id DESC LIMIT 1`,
      [grupoG],
    );
    expect(ultima.rows[0]?.resumo).toEqual({ mes: '2026-10', valorCentavos: 4500 });
  });

  it('FIN-22: o pagamento do cenário (Bira, 2026-01) é desmarcado com o lançamento vinculado', async () => {
    const { idsG, grupoG } = aberto.cenario;
    const r = await desmarcar(idsG.jogadorHistorico, '2026-01');
    expect(r.status).toBe(204);
    const l = await aberto.db.query('SELECT 1 FROM lancamentos WHERE grupo_id = $1 AND id = $2', [
      grupoG,
      idsG.lancamento,
    ]);
    expect(l.rows).toEqual([]);
    // O `restaurarCaixa` do afterEach repõe o lançamento e o pagamento do cenário.
  });

  it('FIN-23: desmarcar o inexistente dá 404', async () => {
    const r = await desmarcar(aberto.cenario.idsG.jogadorAtivo, '2026-10');
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
  });

  it('FIN-23: 2026-13 dá 422 "Mês inválido." no campo mes', async () => {
    const r = await desmarcar(aberto.cenario.idsG.jogadorAtivo, '2026-13');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['mes'], mensagens: { mes: 'Mês inválido.' } });
  });

  it('FIN-23: id que não é uuid dá 404', async () => {
    expect((await desmarcar('abc', '2026-10')).status).toBe(404);
  });

  it('FIN-23: jogador de outro grupo dá 404', async () => {
    expect((await desmarcar(deH, '2026-10')).status).toBe(404);
  });

  it('FIN-23: dois DELETE simultâneos dão 204 e 404, nenhum 500', async () => {
    const { idsG } = aberto.cenario;
    expect((await marcar({ jogadorId: idsG.jogadorAtivo, mes: '2026-10' })).status).toBe(204);
    const respostas = await Promise.all([
      desmarcar(idsG.jogadorAtivo, '2026-10'),
      desmarcar(idsG.jogadorAtivo, '2026-10'),
    ]);
    expect(respostas.map((r) => r.status).sort()).toEqual([204, 404]);
    expect(await lancamentosComDescricao('Mensalidade Toninho 10/2026')).toEqual([]);
  });

  it('FIN-33: admin sem acesso recebe 403 e o pagamento fica', async () => {
    const { idsG } = aberto.cenario;
    const r = await desmarcar(idsG.jogadorHistorico, '2026-01', aberto.cenario.contaO);
    expect(r.status).toBe(403);
    expect(await pagamentos(idsG.jogadorHistorico, '2026-01')).toHaveLength(1);
  });
});
