import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { configFinanceiraResposta } from '@pelada/contrato';
import { MENSAGEM_DATA_SALDO_FUTURA } from '../../src/entrada/rotas/financeiro-config.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { auditorias, configDe, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * `PUT /api/grupos/:grupoId/financeiro/config` (financeiro T25; FIN-01 a FIN-04), com o app real como `pelada_app` e
 * o relógio fixo em 2026-10-15 (São Paulo). G nasce com mensalidade 5000, saldo 0 desde 2026-01-01; o `afterEach`
 * restaura. O reflexo no `GET …/financeiro/mes` é provado na T26 (a rota nasce lá); aqui, a linha gravada.
 *
 * Casos limite: mensalidade nula; data igual a hoje (aceita) e amanhã (recusada); valor decimal, texto, acima do teto
 * e campo extra; JSON inválido; admin sem acesso (403), conta de outro grupo (404) e grupo arquivado (409).
 */

let aberto: CenarioGruposAberto;

const VALIDO = { mensalidadeCentavos: 6000, saldoInicialCentavos: -1500, dataSaldoInicial: '2026-02-01' };
const ORIGINAL = { mensalidade_centavos: 5000, saldo_inicial_centavos: 0, data_saldo_inicial: '2026-01-01' };

const caminho = () => `/grupos/${aberto.cenario.grupoG}/financeiro/config`;
const salvar = (corpo: unknown, conta = aberto.cenario.contaC) => pedir(aberto, { metodo: 'PUT', caminho: caminho(), conta, corpo });
const auditadas = () => auditorias(aberto, aberto.cenario.grupoG, 'financeiro_config_alterada');

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await restaurarCaixa(aberto);
});

describe('PUT …/financeiro/config', () => {
  it('FIN-01: 200 com os três campos e a linha gravada', async () => {
    const r = await salvar(VALIDO);
    expect(r.status).toBe(200);
    expect(configFinanceiraResposta.parse(await r.json())).toEqual(VALIDO);
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual({
      mensalidade_centavos: 6000,
      saldo_inicial_centavos: -1500,
      data_saldo_inicial: '2026-02-01',
    });
  });

  it('FIN-01: mensalidade nula é aceita (caixa sem mensalidade)', async () => {
    const r = await salvar({ ...VALIDO, mensalidadeCentavos: null });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ mensalidadeCentavos: null });
    expect((await configDe(aberto, aberto.cenario.grupoG))?.mensalidade_centavos).toBeNull();
  });

  it('FIN-01: data igual a hoje é aceita', async () => {
    const r = await salvar({ ...VALIDO, dataSaldoInicial: '2026-10-15' });
    expect(r.status).toBe(200);
  });

  it('FIN-04: a gravação audita financeiro_config_alterada com antes e depois', async () => {
    const antes = await auditadas();
    expect((await salvar(VALIDO)).status).toBe(200);
    expect(await auditadas()).toBe(antes + 1);
    const ultima = await aberto.db.query<{ resumo: unknown }>(
      `SELECT resumo FROM auditoria WHERE grupo_id = $1 AND acao = 'financeiro_config_alterada' ORDER BY momento DESC, id DESC LIMIT 1`,
      [aberto.cenario.grupoG],
    );
    expect(ultima.rows[0]?.resumo).toEqual({
      antes: { mensalidadeCentavos: 5000, saldoInicialCentavos: 0, dataSaldoInicial: '2026-01-01' },
      depois: VALIDO,
    });
  });

  it('FIN-02: data do saldo inicial amanhã dá 422 no campo e nada gravado nem auditado', async () => {
    const antes = await auditadas();
    const r = await salvar({ ...VALIDO, dataSaldoInicial: '2026-10-16' });
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      codigo: 'dados_invalidos',
      campos: ['dataSaldoInicial'],
      mensagens: { dataSaldoInicial: MENSAGEM_DATA_SALDO_FUTURA },
    });
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual(ORIGINAL);
    expect(await auditadas()).toBe(antes);
  });

  it.each([
    ['valor decimal', { ...VALIDO, mensalidadeCentavos: 50.5 }, 'mensalidadeCentavos'],
    ['valor em texto', { ...VALIDO, saldoInicialCentavos: '100' }, 'saldoInicialCentavos'],
    ['acima do teto', { ...VALIDO, mensalidadeCentavos: 100_000_000 }, 'mensalidadeCentavos'],
    ['mensalidade zero', { ...VALIDO, mensalidadeCentavos: 0 }, 'mensalidadeCentavos'],
    ['data inválida', { ...VALIDO, dataSaldoInicial: '2026-02-30' }, 'dataSaldoInicial'],
    ['campo extra', { ...VALIDO, saldoAtualCentavos: 10 }, 'corpo'],
  ])('FIN-03: %s dá 422 com o campo, sem gravar', async (_nome, corpo, campo) => {
    const r = await salvar(corpo);
    expect(r.status).toBe(422);
    const json = (await r.json()) as { codigo: string; campos: string[] };
    expect(json.codigo).toBe('dados_invalidos');
    expect(json.campos).toContain(campo);
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual(ORIGINAL);
  });

  it('FIN-03: mensalidade ausente (não nula) dá 422 no campo', async () => {
    const { mensalidadeCentavos: _sem, ...semMensalidade } = VALIDO;
    const r = await salvar(semMensalidade);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: expect.arrayContaining(['mensalidadeCentavos']) });
  });

  it('FIN-03: JSON inválido dá 422 no campo corpo', async () => {
    const r = await salvar('{ não é json');
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ campos: ['corpo'] });
  });

  it('FIN-33: admin sem acesso recebe 403 e nada é gravado', async () => {
    const r = await salvar(VALIDO, aberto.cenario.contaO);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual(ORIGINAL);
  });

  it('conta de outro grupo recebe 404 e nada é gravado', async () => {
    const r = await salvar(VALIDO, aberto.cenario.contaB);
    expect(r.status).toBe(404);
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual(ORIGINAL);
  });

  it('FIN-37: grupo arquivado dá 409 grupo_arquivado para a criadora', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await salvar(VALIDO);
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await configDe(aberto, aberto.cenario.grupoG)).toEqual(ORIGINAL);
  });
});
