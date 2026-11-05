import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RECURSOS_PRO } from '@pelada/dominio';
import {
  estadoDoPlano,
  recursoLiberadoPeloPlano,
} from '../../src/aplicacao/plano/recurso-liberado.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Ponto único ligado ao plano (planos-e-cobranca T21; PLA-07, PLA-23, PLA-24, PLA-28), como `pelada_app` contra o
 * cenário de grupos (C cria G, O admin convidada de G, B só vê H). A situação de G é posta como superusuário em cada
 * teste e volta à original no `afterEach`. Relógio fixo: 03:00Z = 00:00 de São Paulo.
 *
 * Evidência da rede (registrar na T21 do tasks.md, pelo /executar): voltar o corpo para `async () => true` deixa
 * vermelhos "trial vencido nega" e "inadimplente nega"; tirar o `if (estado === null) return false` deixa vermelho
 * "B recebe false".
 */

let aberto: CenarioGruposAberto;
let original: { situacao_comercial: string; trial_inicio: string | null };

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ situacao_comercial: string; trial_inicio: string | null }>(
    'SELECT situacao_comercial, trial_inicio::text FROM grupos WHERE id = $1',
    [aberto.cenario.grupoG],
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('G sem linha');
  original = linha;
});

afterEach(async () => {
  await situacaoDeG(original.situacao_comercial, original.trial_inicio);
});

afterAll(async () => {
  await aberto?.fechar();
});

/** Como superusuário (o CHECK `grupos_trial` exige `trial_inicio` só em `trial`). */
async function situacaoDeG(situacao: string, trialInicio: string | null): Promise<void> {
  await aberto.db.query(
    'UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1',
    [aberto.cenario.grupoG, situacao, trialInicio],
  );
}

async function liberado(
  conta: string,
  grupo: string,
  recurso: (typeof RECURSOS_PRO)[number],
  agora: string,
) {
  return comDb(aberto.url, conta, (db) =>
    recursoLiberadoPeloPlano(relogioFixo(agora))(db, grupo, recurso),
  );
}

describe('recursoLiberadoPeloPlano', () => {
  it('PLA-07: trial vencido nega o simulador (e todo recurso Pro)', async () => {
    const { cenario } = aberto;
    // Trial de 2026-11-01: último dia Pro 2026-11-14; 2026-11-15 00:00 de São Paulo já é Free.
    await situacaoDeG('trial', '2026-11-01');
    for (const recurso of RECURSOS_PRO) {
      expect(await liberado(cenario.contaC, cenario.grupoG, recurso, '2026-11-15T03:00:00Z')).toBe(
        false,
      );
    }
  });

  it('PLA-07: trial no último dia ainda libera', async () => {
    const { cenario } = aberto;
    await situacaoDeG('trial', '2026-11-01');
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'simulador', '2026-11-15T02:59:00Z'),
    ).toBe(true);
  });

  it('PLA-07: uso_proprio libera o simulador e o financeiro', async () => {
    const { cenario } = aberto;
    await situacaoDeG('uso_proprio', null);
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'simulador', '2026-11-15T03:00:00Z'),
    ).toBe(true);
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'financeiro', '2026-11-15T03:00:00Z'),
    ).toBe(true);
  });

  it('PLA-07: ativo libera o simulador', async () => {
    const { cenario } = aberto;
    await situacaoDeG('ativo', null);
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'simulador', '2027-06-01T12:00:00Z'),
    ).toBe(true);
  });

  it('PLA-24: inadimplente nega o financeiro e o simulador', async () => {
    const { cenario } = aberto;
    await situacaoDeG('inadimplente', null);
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'financeiro', '2026-11-15T03:00:00Z'),
    ).toBe(false);
    expect(
      await liberado(cenario.contaC, cenario.grupoG, 'simulador', '2026-11-15T03:00:00Z'),
    ).toBe(false);
  });

  it('PLA-28: a admin convidada recebe o mesmo resultado da criadora', async () => {
    const { cenario } = aberto;
    await situacaoDeG('inadimplente', null);
    expect(
      await liberado(cenario.contaO, cenario.grupoG, 'simulador', '2026-11-15T03:00:00Z'),
    ).toBe(false);
    await situacaoDeG('uso_proprio', null);
    expect(
      await liberado(cenario.contaO, cenario.grupoG, 'simulador', '2026-11-15T03:00:00Z'),
    ).toBe(true);
  });

  it('PLA-07: a conta B recebe false para G, mesmo com G em cortesia', async () => {
    const { cenario } = aberto;
    await situacaoDeG('uso_proprio', null);
    expect(
      await liberado(cenario.contaB, cenario.grupoG, 'simulador', '2026-11-15T03:00:00Z'),
    ).toBe(false);
  });
});

describe('estadoDoPlano', () => {
  it('PLA-07: devolve o plano e a linha da tabela de recursos', async () => {
    const { cenario } = aberto;
    await situacaoDeG('trial', '2026-11-01');
    const estado = await comDb(aberto.url, cenario.contaC, (db) =>
      estadoDoPlano(db, cenario.grupoG, '2026-11-15'),
    );
    expect(estado).toMatchObject({
      plano: 'free',
      situacaoComercial: 'trial',
      trialInicio: '2026-11-01',
      jogadoresAtivos: 2,
      recursosDoPlano: { limiteJogadores: 20, limiteGrupos: 1 },
    });
  });

  it('PLA-70: trial_inicio no futuro segue trial', async () => {
    const { cenario } = aberto;
    await situacaoDeG('trial', '2026-12-01');
    const estado = await comDb(aberto.url, cenario.contaC, (db) =>
      estadoDoPlano(db, cenario.grupoG, '2026-11-15'),
    );
    expect(estado?.plano).toBe('trial');
  });

  it('PLA-07: grupo não visível devolve nulo', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaB, (db) =>
        estadoDoPlano(db, cenario.grupoG, '2026-11-15'),
      ),
    ).toBeNull();
  });
});
