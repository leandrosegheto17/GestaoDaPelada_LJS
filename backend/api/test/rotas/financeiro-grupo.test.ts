import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { grupoDetalhe } from '@pelada/contrato';
import { abrirCenarioGrupos, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { pedir, restaurarCaixa, saldoDe } from './apoio-financeiro.ts';

/**
 * Saldo no `GET /api/grupos/:grupoId` (financeiro T30; FIN-34; AD-079), com o app real como `pelada_app` e o relógio
 * fixo em 2026-10-15 (São Paulo). G: saldo inicial 0 desde 2026-01-01 e uma entrada de 5000 em 2026-01-05, então o
 * saldo é 5000. C tem acesso; O não. O `afterEach` restaura o caixa.
 *
 * Casos limite: criadora com configuração (inteiro), sem configuração (nulo), lançamento depois de hoje (não conta),
 * saída (desconta), admin sem acesso (chave ausente, não nula), convidada que ganha o acesso (passa a ver), PATCH do
 * grupo (formato do PATCH sem a chave).
 */

let aberto: CenarioGruposAberto;

const detalhe = (conta: string) => pedir(aberto, { metodo: 'GET', caminho: `/grupos/${aberto.cenario.grupoG}`, conta });

async function lancar(tipo: 'entrada' | 'saida', data: string, valor: number): Promise<void> {
  const { db, cenario } = aberto;
  await db.query(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, 'Teste', $4, $5, now(), $5, now())`,
    [cenario.grupoG, tipo, data, valor, cenario.contaC],
  );
}

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

describe('GET /api/grupos/:grupoId com o saldo do caixa', () => {
  it('FIN-34: a criadora recebe o saldo atual', async () => {
    const r = await detalhe(aberto.cenario.contaC);
    expect(r.status).toBe(200);
    expect(await saldoDe(r)).toBe(5000);
  });

  it('FIN-34, FIN-10: saída desconta; lançamento depois de hoje não conta', async () => {
    await lancar('saida', '2026-10-10', 1500);
    await lancar('entrada', '2026-10-16', 99999);
    expect(await saldoDe(await detalhe(aberto.cenario.contaC))).toBe(3500);
  });

  it('FIN-34: sem configuração, a chave vem com null', async () => {
    await aberto.db.query('DELETE FROM config_financeira WHERE grupo_id = $1', [aberto.cenario.grupoG]);
    const corpo = (await (await detalhe(aberto.cenario.contaC)).json()) as Record<string, unknown>;
    expect('saldoFinanceiroCentavos' in corpo).toBe(true);
    expect(corpo['saldoFinanceiroCentavos']).toBeNull();
  });

  it('FIN-34: a convidada sem acesso recebe o detalhe sem a chave saldoFinanceiroCentavos', async () => {
    const r = await detalhe(aberto.cenario.contaO);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as Record<string, unknown>;
    expect('saldoFinanceiroCentavos' in corpo).toBe(false);
    // O resto do detalhe vem igual (o GET também traz o início do grupo da partidas-e-ranking, T43).
    expect(corpo).toMatchObject({ id: aberto.cenario.grupoG, souCriador: false });
  });

  it('FIN-34: a convidada que ganha o acesso passa a ver o saldo', async () => {
    await aberto.db.query('UPDATE vinculos_admin SET acessa_financeiro = true WHERE grupo_id = $1 AND conta_id = $2', [
      aberto.cenario.grupoG,
      aberto.cenario.contaO,
    ]);
    expect(await saldoDe(await detalhe(aberto.cenario.contaO))).toBe(5000);
  });

  it('o PATCH do grupo continua respondendo o detalhe sem a chave do saldo', async () => {
    const r = await pedir(aberto, {
      metodo: 'PATCH',
      caminho: `/grupos/${aberto.cenario.grupoG}`,
      conta: aberto.cenario.contaC,
      corpo: { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' },
    });
    expect(r.status).toBe(200);
    expect(grupoDetalhe.safeParse(await r.json()).success).toBe(true);
  });
});
