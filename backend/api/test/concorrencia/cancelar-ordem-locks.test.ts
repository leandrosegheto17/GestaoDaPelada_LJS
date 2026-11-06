import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Ordem dos locks de `assinatura_cancelar` (planos-e-cobranca R1, A-05; PLA-44, PLA-56).
 * O webhook trava `assinaturas` e depois `grupos`. O cancelar tem de seguir a mesma ordem; na ordem invertida, um
 * cancelar e um evento do mesmo grupo se cruzam e dão deadlock (40P01).
 *
 * Prova determinística, sem depender de sorte de tempo: uma transação (o "webhook") segura o FOR UPDATE da assinatura;
 * o cancelar, como `pelada_app` e criadora, para nessa assinatura; enquanto espera, o grupo NÃO pode estar travado por
 * ele (`FOR UPDATE NOWAIT` do grupo tem de passar). Na ordem antiga o cancelar já segurava o grupo e o NOWAIT falhava.
 *
 * Casos limite: cancelar a assinatura pendente (a que o teste cria) e liberar o lock do "webhook" no fim, para o
 * cancelar terminar e o banco do teste ser removido sem conexão presa.
 */

const PRAZO_MS = 5000;
let aberto: CenarioGruposAberto;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

async function cliente(url: string): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  return c;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('assinatura_cancelar: ordem dos locks', () => {
  it('PLA-56 (A-05): esperando a assinatura travada, o cancelar ainda não travou o grupo', async () => {
    const { db, url, cenario } = aberto;
    await db.query(
      `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, criada_por,
         criada_em)
       VALUES ($1, 'cus_r1', 'sub_r1_lock', 990, 'aguardando_pagamento', $2, now())`,
      [cenario.grupoH, cenario.contaB],
    );
    const webhook = await cliente(url);
    const cancelar = await cliente(url);
    let cancelando: Promise<unknown> | undefined;
    try {
      await webhook.query('BEGIN');
      await webhook.query(
        `SELECT 1 FROM assinaturas WHERE asaas_assinatura_id = 'sub_r1_lock' FOR UPDATE`,
      );

      await cancelar.query('BEGIN');
      await cancelar.query('SET LOCAL ROLE pelada_app');
      await cancelar.query(`SELECT set_config('app.conta_id', $1, true)`, [cenario.contaB]);
      cancelando = cancelar.query('SELECT assinatura_cancelar($1)', [cenario.grupoH]);

      const limite = Date.now() + PRAZO_MS;
      let parado = false;
      while (Date.now() < limite && !parado) {
        const r = await db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query LIKE '%assinatura_cancelar%'`,
        );
        parado = (r.rows[0]?.n ?? 0) > 0;
        if (!parado) await esperar(20);
      }
      expect(parado).toBe(true);

      // O grupo está livre para o webhook travar depois da assinatura: NOWAIT falha se o cancelar o segura.
      await db.query('BEGIN');
      try {
        await expect(
          db.query('SELECT 1 FROM grupos WHERE id = $1 FOR UPDATE NOWAIT', [cenario.grupoH]),
        ).resolves.toBeDefined();
      } finally {
        await db.query('ROLLBACK');
      }
    } finally {
      await webhook.query('ROLLBACK').catch(() => undefined);
      if (cancelando) await cancelando.catch(() => undefined);
      await cancelar.query('ROLLBACK').catch(() => undefined);
      await webhook.end();
      await cancelar.end();
      await db.query(`DELETE FROM assinaturas WHERE asaas_assinatura_id = 'sub_r1_lock'`);
    }
  });
});
