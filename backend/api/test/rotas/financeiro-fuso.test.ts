import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { grupoDetalheComSaldo, mesFinanceiroResposta } from '@pelada/contrato';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { appFinanceiro, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * Virada de mês no fuso de São Paulo (financeiro T34; FIN-49), com o app real como `pelada_app` e dois relógios fixos:
 * - 2026-11-01T02:30:00Z = 31/10/2026 23:30 em São Paulo (UTC−3, sem horário de verão): ainda é outubro;
 * - 2026-11-01T03:05:00Z = 01/11/2026 00:05 em São Paulo: já é novembro.
 * G: saldo inicial 0 desde 2026-01-01 e a entrada de 5000 do cenário; o teste do saldo põe uma entrada de 1000 em
 * 2026-11-01. O `afterEach` restaura o caixa.
 */

let aberto: CenarioGruposAberto;

const ANTES_DA_VIRADA = appFinanceiro('2026-11-01T02:30:00.000Z');
const DEPOIS_DA_VIRADA = appFinanceiro('2026-11-01T03:05:00.000Z');

type App = ReturnType<typeof appFinanceiro>;

const g = () => `/grupos/${aberto.cenario.grupoG}`;
const lerMes = (app: App) => pedir(aberto, { metodo: 'GET', caminho: `${g()}/financeiro/mes`, conta: aberto.cenario.contaC, app });
const marcarNovembro = (app: App) =>
  pedir(aberto, {
    metodo: 'POST',
    caminho: `${g()}/financeiro/pagamentos`,
    conta: aberto.cenario.contaC,
    corpo: { jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-11' },
    app,
  });

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await restaurarCaixa(aberto);
});

describe('virada de mês em São Paulo (FIN-49)', () => {
  it('FIN-49: às 23:30 de 31/10 em São Paulo o mês padrão é outubro e hoje é 31/10', async () => {
    const corpo = mesFinanceiroResposta.parse(await (await lerMes(ANTES_DA_VIRADA)).json());
    expect(corpo.mes).toBe('2026-10');
    expect(corpo.hoje).toBe('2026-10-31');
    expect(corpo.navegacao.mesSeguinte).toBeNull();
  });

  it('FIN-49: às 23:30 de 31/10, marcar novembro dá 422 de mês futuro e nada é gravado', async () => {
    const r = await marcarNovembro(ANTES_DA_VIRADA);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({
      campos: ['mes'],
      mensagens: { mes: 'Não dá para marcar o pagamento de um mês que ainda não começou.' },
    });
    const p = await aberto.db.query('SELECT 1 FROM pagamentos_mes WHERE grupo_id = $1 AND mes = $2', [aberto.cenario.grupoG, '2026-11']);
    expect(p.rows).toEqual([]);
  });

  it('FIN-49: às 00:05 de 01/11 o mês padrão é novembro e marcar novembro passa', async () => {
    const corpo = mesFinanceiroResposta.parse(await (await lerMes(DEPOIS_DA_VIRADA)).json());
    expect(corpo.mes).toBe('2026-11');
    expect(corpo.hoje).toBe('2026-11-01');
    expect((await marcarNovembro(DEPOIS_DA_VIRADA)).status).toBe(204);
  });

  it('FIN-49: lançamento de 01/11 não entra no saldo às 23:30 de 31/10 e entra às 00:05', async () => {
    const { db, cenario } = aberto;
    await db.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'entrada', '2026-11-01', 'Rifa', 1000, $2, now(), $2, now())`,
      [cenario.grupoG, cenario.contaC],
    );

    const antes = mesFinanceiroResposta.parse(await (await lerMes(ANTES_DA_VIRADA)).json());
    expect(antes.saldoAtualCentavos).toBe(5000);
    const depois = mesFinanceiroResposta.parse(await (await lerMes(DEPOIS_DA_VIRADA)).json());
    expect(depois.saldoAtualCentavos).toBe(6000);

    // O mesmo fim do saldo no início do grupo (FIN-34).
    const detalhe = (app: App) => pedir(aberto, { metodo: 'GET', caminho: g(), conta: cenario.contaC, app });
    expect(grupoDetalheComSaldo.parse(await (await detalhe(ANTES_DA_VIRADA)).json()).saldoFinanceiroCentavos).toBe(5000);
    expect(grupoDetalheComSaldo.parse(await (await detalhe(DEPOIS_DA_VIRADA)).json()).saldoFinanceiroCentavos).toBe(6000);
  });
});
