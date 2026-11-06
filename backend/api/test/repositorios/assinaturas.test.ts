import { sql } from 'kysely';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { assinaturas } from '../../src/infraestrutura/db/repositorios/assinaturas.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de assinaturas (planos-e-cobranca T31; PLA-30, PLA-33; AD-096, AD-097), como `pelada_app` contra o
 * cenário de grupos: C cria G (que tem a assinatura cancelada `sub_g`, cliente do cenário), O é admin convidada de G,
 * B só vê H. Cada teste roda numa transação desfeita (`comDb` sem `confirmar`), salvo o de concorrência, que não grava.
 *
 * Evidência da rede (registrar na T31 do tasks.md, pelo /executar): tirar o `pg_advisory_xact_lock` de `travarGrupo`
 * deixa vermelho "a segunda espera a primeira"; trocar o `case '23505'` por `throw` deixa vermelho "assinatura_vigente".
 */

let aberto: CenarioGruposAberto;

const PRAZO_MS = 5000;
const SEGURAR_MS = 250;
const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar: () => void = () => undefined;
  const promessa = new Promise<void>((ok) => {
    disparar = ok;
  });
  return { promessa, disparar };
}

const DADOS = {
  clienteId: 'cus_t31',
  assinaturaId: 'sub_t31',
  valorCentavos: 990,
  faturaUrl: 'https://sandbox.asaas.com/i/t31',
};

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('registrar e pendenteOuAtiva', () => {
  it('PLA-30: registrar grava e pendenteOuAtiva a devolve com faturaUrl', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, async (db) => {
      expect(await assinaturas.pendenteOuAtiva(db, cenario.grupoG)).toBeNull();
      const r = await assinaturas.registrar(db, cenario.grupoG, DADOS);
      expect(r.resultado).toBe('ok');
      expect(await assinaturas.pendenteOuAtiva(db, cenario.grupoG)).toEqual({
        id: r.resultado === 'ok' ? r.id : '',
        situacao: 'aguardando_pagamento',
        faturaUrl: DADOS.faturaUrl,
        asaasAssinaturaId: DADOS.assinaturaId,
      });
      // `auditoria` é só de escrita para a aplicação: a leitura vem do dono, dentro da mesma transação.
      await sql`RESET ROLE`.execute(db);
      const auditoria = await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = ${cenario.grupoG} AND acao = 'plano_assinado'`.execute(
        db,
      );
      expect(auditoria.rows[0]?.n).toBeGreaterThanOrEqual(1);
      await sql`SET ROLE pelada_app`.execute(db);
    });
  });

  it('PLA-33: com uma pendente, registrar de novo devolve assinatura_vigente e a transação segue utilizável', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, async (db) => {
      expect((await assinaturas.registrar(db, cenario.grupoG, DADOS)).resultado).toBe('ok');
      const segunda = await assinaturas.registrar(db, cenario.grupoG, {
        ...DADOS,
        assinaturaId: 'sub_t31_b',
      });
      expect(segunda).toEqual({ resultado: 'assinatura_vigente' });
      expect((await assinaturas.pendenteOuAtiva(db, cenario.grupoG))?.asaasAssinaturaId).toBe(
        'sub_t31',
      );
    });
  });

  it('PLA-30: a admin convidada recebe so_quem_criou e nada é gravado', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaO, async (db) => {
      expect(await assinaturas.registrar(db, cenario.grupoG, DADOS)).toEqual({
        resultado: 'so_quem_criou',
      });
      expect(await assinaturas.pendenteOuAtiva(db, cenario.grupoG)).toBeNull();
    });
  });

  it('PLA-30: a conta B não lê a assinatura de G', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, (db) => assinaturas.registrar(db, cenario.grupoG, DADOS), {
      confirmar: true,
    });
    try {
      expect(
        await comDb(url, cenario.contaB, (db) => assinaturas.pendenteOuAtiva(db, cenario.grupoG)),
      ).toBeNull();
      expect(
        await comDb(url, cenario.contaC, (db) => assinaturas.pendenteOuAtiva(db, cenario.grupoG)),
      ).not.toBeNull();
    } finally {
      await aberto.db.query(
        `DELETE FROM auditoria WHERE grupo_id = $1 AND acao = 'plano_assinado' AND entidade_id IN
                               (SELECT id::text FROM assinaturas WHERE asaas_assinatura_id = 'sub_t31')`,
        [cenario.grupoG],
      );
      await aberto.db.query(`DELETE FROM assinaturas WHERE asaas_assinatura_id = 'sub_t31'`);
    }
  });
});

describe('cancelar', () => {
  it('PLA-30: cancelar a pendente devolve aguardando_pagamento e libera um novo registro', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, async (db) => {
      await assinaturas.registrar(db, cenario.grupoG, DADOS);
      expect(await assinaturas.cancelar(db, cenario.grupoG)).toEqual({
        resultado: 'ok',
        situacaoAnterior: 'aguardando_pagamento',
      });
      expect(await assinaturas.pendenteOuAtiva(db, cenario.grupoG)).toBeNull();
      expect(
        (await assinaturas.registrar(db, cenario.grupoG, { ...DADOS, assinaturaId: 'sub_t31_c' }))
          .resultado,
      ).toBe('ok');
    });
  });

  it('PLA-30: cancelar sem assinatura vigente devolve sem_assinatura', async () => {
    const { url, cenario } = aberto;
    expect(
      await comDb(url, cenario.contaC, (db) => assinaturas.cancelar(db, cenario.grupoG)),
    ).toEqual({
      resultado: 'sem_assinatura',
    });
  });

  it('PLA-30: a admin convidada não cancela', async () => {
    const { url, cenario } = aberto;
    expect(
      await comDb(url, cenario.contaO, (db) => assinaturas.cancelar(db, cenario.grupoG)),
    ).toEqual({
      resultado: 'so_quem_criou',
    });
  });
});

describe('clienteDaConta', () => {
  it('PLA-30: devolve o cliente mais recente dos grupos que a conta criou', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaC, async (db) => {
      const antes = await assinaturas.clienteDaConta(db, cenario.contaC);
      expect(antes).not.toBeNull();
      await assinaturas.registrar(db, cenario.grupoG, { ...DADOS, clienteId: 'cus_t31_novo' });
      expect(await assinaturas.clienteDaConta(db, cenario.contaC)).toBe('cus_t31_novo');
    });
  });

  it('PLA-30: conta que nunca assinou recebe null', async () => {
    const { url, cenario } = aberto;
    expect(
      await comDb(url, cenario.contaO, (db) => assinaturas.clienteDaConta(db, cenario.contaO)),
    ).toBeNull();
  });
});

describe('travarGrupo', () => {
  it('PLA-33: com duas conexões, a segunda travarGrupo espera o fim da primeira transação', async () => {
    const { url, cenario } = aberto;
    const ordem: string[] = [];
    const primeiraTravou = sinal();
    const soltar = sinal();

    const primeira = comDb(url, cenario.contaC, async (db) => {
      await assinaturas.travarGrupo(db, cenario.grupoG);
      ordem.push('primeira travou');
      primeiraTravou.disparar();
      await soltar.promessa;
      ordem.push('primeira terminou');
    });

    await primeiraTravou.promessa;
    const segunda = comDb(url, cenario.contaC, async (db) => {
      await assinaturas.travarGrupo(db, cenario.grupoG);
      ordem.push('segunda travou');
    });

    const limite = Date.now() + PRAZO_MS;
    let esperando = false;
    while (Date.now() < limite && !esperando) {
      const r = await aberto.db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND query LIKE '%pg_advisory_xact_lock%'`,
      );
      esperando = (r.rows[0]?.n ?? 0) > 0;
      if (!esperando) await esperar(20);
    }
    expect(esperando).toBe(true);
    await esperar(SEGURAR_MS);
    expect(ordem).toEqual(['primeira travou']);
    soltar.disparar();
    await Promise.all([primeira, segunda]);
    expect(ordem).toEqual(['primeira travou', 'primeira terminou', 'segunda travou']);
  });

  it('PLA-33: grupos diferentes não esperam um ao outro', async () => {
    const { url, cenario } = aberto;
    const soltar = sinal();
    const primeira = comDb(url, cenario.contaC, async (db) => {
      await assinaturas.travarGrupo(db, cenario.grupoG);
      await soltar.promessa;
    });
    const outra = await Promise.race([
      comDb(url, cenario.contaB, async (db) => {
        await assinaturas.travarGrupo(db, cenario.grupoH);
        return 'travou';
      }),
      esperar(PRAZO_MS).then(() => 'esperou'),
    ]);
    soltar.disparar();
    await primeira;
    expect(outra).toBe('travou');
  });
});
