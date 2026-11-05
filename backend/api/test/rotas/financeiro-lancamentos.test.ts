import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { lancamentoResposta, MENSAGEM_DESCRICAO } from '@pelada/contrato';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { auditorias, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * Rotas de lançamentos (financeiro T28; FIN-25 a FIN-31), com o app real como `pelada_app` e o relógio fixo em
 * 2026-10-15. G tem o lançamento do cenário (entrada de 5000 em 2026-01-05, mensalidade de Bira 01/2026); H ganha um
 * lançamento próprio no `beforeAll`. O `afterEach` restaura o caixa de G.
 *
 * Casos limite: descrição com 80 e 81 caracteres e só espaços; valor 0, decimal e acima do teto; data inválida; campo de
 * vínculo (`mensalidade`, `pagamentoId`) no corpo; mensalidade para saída; editar a mensalidade mantendo entrada;
 * excluir a mensalidade (409); id de H, inexistente e malformado (404 igual nos quatro métodos).
 */

let aberto: CenarioGruposAberto;
let deH = '';
let nomeC = '';

const VALIDO = { tipo: 'saida', data: '2026-10-10', descricao: 'Bola nova', valorCentavos: 12000 };

const base = () => `/grupos/${aberto.cenario.grupoG}/financeiro/lancamentos`;
const conta = () => aberto.cenario.contaC;
const criar = (corpo: unknown, c = conta()) =>
  pedir(aberto, { metodo: 'POST', caminho: base(), conta: c, corpo });
const ler = (id: string, c = conta()) =>
  pedir(aberto, { metodo: 'GET', caminho: `${base()}/${id}`, conta: c });
const editar = (id: string, corpo: unknown, c = conta()) =>
  pedir(aberto, { metodo: 'PUT', caminho: `${base()}/${id}`, conta: c, corpo });
const excluir = (id: string, c = conta()) =>
  pedir(aberto, { metodo: 'DELETE', caminho: `${base()}/${id}`, conta: c });

async function existe(id: string): Promise<boolean> {
  const r = await aberto.db.query('SELECT 1 FROM lancamentos WHERE id = $1', [id]);
  return r.rows.length > 0;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'entrada', '2026-10-01', 'Caixa de H', 777, $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoH, cenario.contaB],
  );
  deH = r.rows[0]!.id;
  const n = await db.query<{ nome: string }>('SELECT nome FROM contas WHERE id = $1', [
    cenario.contaC,
  ]);
  nomeC = n.rows[0]!.nome;
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await restaurarCaixa(aberto);
});

describe('POST …/financeiro/lancamentos', () => {
  it('FIN-25: 201 com o lançamento, mensalidade falso, quem alterou e quando; auditado', async () => {
    const antes = await auditorias(aberto, aberto.cenario.grupoG, 'lancamento_criado');
    const r = await criar({ ...VALIDO, descricao: '  Bola nova  ' });
    expect(r.status).toBe(201);
    const corpo = lancamentoResposta.parse(await r.json());
    expect(corpo).toMatchObject({
      tipo: 'saida',
      data: '2026-10-10',
      descricao: 'Bola nova',
      valorCentavos: 12000,
      mensalidade: false,
      alteradoPor: nomeC,
    });
    expect(Number.isNaN(Date.parse(corpo.alteradoEm))).toBe(false);
    expect(await existe(corpo.id)).toBe(true);
    expect(await auditorias(aberto, aberto.cenario.grupoG, 'lancamento_criado')).toBe(antes + 1);
  });

  it('FIN-25: descrição de 80 caracteres é aceita', async () => {
    expect((await criar({ ...VALIDO, descricao: 'a'.repeat(80) })).status).toBe(201);
  });

  it('FIN-26: descrição de 81 caracteres dá 422 com a mensagem, sem gravar', async () => {
    const antes = await aberto.db.query(
      'SELECT count(*)::int AS n FROM lancamentos WHERE grupo_id = $1',
      [aberto.cenario.grupoG],
    );
    const r = await criar({ ...VALIDO, descricao: 'a'.repeat(81) });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      campos: ['descricao'],
      mensagens: { descricao: MENSAGEM_DESCRICAO },
    });
    const depois = await aberto.db.query(
      'SELECT count(*)::int AS n FROM lancamentos WHERE grupo_id = $1',
      [aberto.cenario.grupoG],
    );
    expect(depois.rows[0]).toEqual(antes.rows[0]);
  });

  it.each([
    ['descrição só com espaços', { ...VALIDO, descricao: '   ' }, 'descricao'],
    ['valor zero', { ...VALIDO, valorCentavos: 0 }, 'valorCentavos'],
    ['valor decimal', { ...VALIDO, valorCentavos: 10.5 }, 'valorCentavos'],
    ['valor acima do teto', { ...VALIDO, valorCentavos: 100_000_000 }, 'valorCentavos'],
    ['valor em texto', { ...VALIDO, valorCentavos: '120,00' }, 'valorCentavos'],
    ['data inválida', { ...VALIDO, data: '2026-02-30' }, 'data'],
    ['tipo desconhecido', { ...VALIDO, tipo: 'transferencia' }, 'tipo'],
  ])('FIN-26: %s dá 422 no campo', async (_nome, corpo, campo) => {
    const r = await criar(corpo);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: expect.arrayContaining([campo]) });
  });

  it.each([
    ['mensalidade', true],
    ['pagamentoId', crypto.randomUUID()],
    ['lancamentoId', crypto.randomUUID()],
  ])('FIN-26: campo de vínculo %s no corpo dá 422', async (campo, valor) => {
    const r = await criar({ ...VALIDO, [campo]: valor });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos' });
  });
});

describe('GET …/financeiro/lancamentos/:id', () => {
  it('FIN-32: a mensalidade do cenário vem com mensalidade verdadeiro e o nome de quem alterou', async () => {
    const r = await ler(aberto.cenario.idsG.lancamento);
    expect(r.status).toBe(200);
    expect(lancamentoResposta.parse(await r.json())).toMatchObject({
      id: aberto.cenario.idsG.lancamento,
      tipo: 'entrada',
      descricao: 'Mensalidade',
      valorCentavos: 5000,
      mensalidade: true,
      alteradoPor: nomeC,
    });
  });
});

describe('PUT …/financeiro/lancamentos/:id', () => {
  it('FIN-27: grava, devolve 200 e audita o valor antes e depois', async () => {
    const criado = lancamentoResposta.parse(await (await criar(VALIDO)).json());
    const r = await editar(criado.id, {
      ...VALIDO,
      descricao: 'Bola e rede',
      valorCentavos: 15000,
    });
    expect(r.status).toBe(200);
    expect(lancamentoResposta.parse(await r.json())).toMatchObject({
      id: criado.id,
      descricao: 'Bola e rede',
      valorCentavos: 15000,
    });
    const ultima = await aberto.db.query<{ resumo: unknown }>(
      `SELECT resumo FROM auditoria WHERE grupo_id = $1 AND acao = 'lancamento_editado' AND entidade_id = $2
        ORDER BY momento DESC LIMIT 1`,
      [aberto.cenario.grupoG, criado.id],
    );
    expect(ultima.rows[0]?.resumo).toEqual({
      antes: { valorCentavos: 12000 },
      depois: { valorCentavos: 15000 },
    });
  });

  it('FIN-27: editar a mensalidade mantém o vínculo com o pagamento', async () => {
    const { idsG } = aberto.cenario;
    const r = await editar(idsG.lancamento, {
      tipo: 'entrada',
      data: '2026-01-06',
      descricao: 'Mensalidade Bira',
      valorCentavos: 4500,
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ mensalidade: true, valorCentavos: 4500 });
    const p = await aberto.db.query(
      'SELECT lancamento_id FROM pagamentos_mes WHERE jogador_id = $1 AND mes = $2',
      [idsG.jogadorHistorico, '2026-01'],
    );
    expect(p.rows).toEqual([{ lancamento_id: idsG.lancamento }]);
  });

  it('FIN-28: PUT de mensalidade para saída dá 422 no campo tipo, sem gravar', async () => {
    const { idsG } = aberto.cenario;
    const r = await editar(idsG.lancamento, {
      tipo: 'saida',
      data: '2026-01-05',
      descricao: 'Mensalidade',
      valorCentavos: 5000,
    });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      campos: ['tipo'],
      mensagens: { tipo: 'A mensalidade é sempre uma entrada.' },
    });
    const l = await aberto.db.query('SELECT tipo FROM lancamentos WHERE id = $1', [
      idsG.lancamento,
    ]);
    expect(l.rows).toEqual([{ tipo: 'entrada' }]);
  });

  it('FIN-26: PUT com corpo inválido dá 422', async () => {
    const r = await editar(aberto.cenario.idsG.lancamento, {
      ...VALIDO,
      tipo: 'entrada',
      descricao: '',
    });
    expect(r.status).toBe(422);
  });
});

describe('DELETE …/financeiro/lancamentos/:id', () => {
  it('FIN-29: avulso: 204, apagado e auditado', async () => {
    const criado = lancamentoResposta.parse(await (await criar(VALIDO)).json());
    const antes = await auditorias(aberto, aberto.cenario.grupoG, 'lancamento_excluido');
    const r = await excluir(criado.id);
    expect(r.status).toBe(204);
    expect(await existe(criado.id)).toBe(false);
    expect(await auditorias(aberto, aberto.cenario.grupoG, 'lancamento_excluido')).toBe(antes + 1);
  });

  it('FIN-30: DELETE da mensalidade dá 409 com a orientação e nada é apagado', async () => {
    const r = await excluir(aberto.cenario.idsG.lancamento);
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'Esta entrada é a mensalidade de Bira 01/2026. Desmarque o pagamento no mês para removê-la.',
      codigo: 'lancamento_vinculado',
    });
    expect(await existe(aberto.cenario.idsG.lancamento)).toBe(true);
  });
});

describe('FIN-31: lançamento inexistente, de outro grupo ou malformado', () => {
  const ids = () => [
    ['do grupo H', deH],
    ['inexistente', crypto.randomUUID()],
  ];

  it('GET, PUT e DELETE de id de H dão o mesmo 404 que o inexistente, e H fica intacto', async () => {
    const respostas: Array<{ status: number; corpo: unknown }> = [];
    for (const [, id] of ids()) {
      for (const r of [
        await ler(id!),
        await editar(id!, { ...VALIDO, tipo: 'entrada' }),
        await excluir(id!),
      ]) {
        respostas.push({ status: r.status, corpo: await r.json() });
      }
    }
    expect(respostas.every((r) => r.status === 404)).toBe(true);
    const [primeira, ...resto] = respostas;
    for (const r of resto) expect(r.corpo).toEqual(primeira!.corpo);
    const h = await aberto.db.query(
      'SELECT descricao, valor_centavos FROM lancamentos WHERE id = $1',
      [deH],
    );
    expect(h.rows).toEqual([{ descricao: 'Caixa de H', valor_centavos: 777 }]);
  });

  it('id malformado dá 404 nos três', async () => {
    expect((await ler('abc')).status).toBe(404);
    expect((await editar('abc', VALIDO)).status).toBe(404);
    expect((await excluir('abc')).status).toBe(404);
  });
});

describe('cadeia', () => {
  it('FIN-33: admin sem acesso recebe 403 em POST e GET', async () => {
    expect((await criar(VALIDO, aberto.cenario.contaO)).status).toBe(403);
    expect((await ler(aberto.cenario.idsG.lancamento, aberto.cenario.contaO)).status).toBe(403);
  });

  it('FIN-37: arquivado: escrita 409, leitura 200 para a criadora', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    expect((await criar(VALIDO)).status).toBe(409);
    expect((await ler(aberto.cenario.idsG.lancamento)).status).toBe(200);
  });
});
