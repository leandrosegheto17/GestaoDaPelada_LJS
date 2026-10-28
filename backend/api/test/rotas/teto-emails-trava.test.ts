import { env } from 'cloudflare:test';
import pg from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { capturarLog } from '../apoio/log.ts';
import { comoOwner } from '../apoio/owner-worker.ts';

// A reserva da cota não espera mais de 2 s pela trava da linha do dia (ACE-75; SEC-CA-13, T68): com outra transação
// segurando a linha (como uma requisição presa no Resend), "esqueci a senha" responde 503 email_indisponivel em cerca
// de 2 s, sem enviar e sem gastar a cota.

const { pedir, remetente, contaConfirmada } = cenarioDeAcesso();
const HOJE_SP = "(now() AT TIME ZONE 'America/Sao_Paulo')::date";

async function lerTotalHoje(): Promise<number> {
  const [linha] = await comoOwner<{ total: number }>(`SELECT total FROM envios_email_dia WHERE dia = ${HOJE_SP}`);
  return linha?.total ?? 0;
}

beforeEach(() => {
  remetente.mensagens.length = 0;
});

describe('POST /api/sessao/esqueci-senha com a linha do dia travada (ACE-75)', () => {
  it('503 email_indisponivel em cerca de 2 s, sem enviar e sem gastar a cota', async () => {
    const conta = await contaConfirmada();
    await comoOwner("DELETE FROM envios_email WHERE destino_hash = digest($1::text, 'sha256')", [conta.email]);
    remetente.mensagens.length = 0;

    const trava = new pg.Client({ connectionString: env.HYPERDRIVE_OWNER_TESTE.connectionString });
    trava.on('error', () => undefined);
    await trava.connect();
    try {
      await trava.query('BEGIN');
      await trava.query('SELECT email_cota_reservar_em(now(), 1000000)');
      const antes = await lerTotalHoje();

      const inicio = performance.now();
      const { resultado: r, log } = await capturarLog(() =>
        pedir('POST', '/api/sessao/esqueci-senha', { email: conta.email }),
      );
      const decorrido = performance.now() - inicio;

      expect(r.status).toBe(503);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'email_indisponivel' } });
      expect(decorrido).toBeLessThan(5_000);
      expect(remetente.mensagens).toHaveLength(0);
      expect(log).not.toContain(conta.email);

      await trava.query('ROLLBACK');
      expect(await lerTotalHoje()).toBe(antes);
    } finally {
      await trava.end();
    }
  });
});
