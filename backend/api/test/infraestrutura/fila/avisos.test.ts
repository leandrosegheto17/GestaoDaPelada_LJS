import type { MensagemAviso } from '@pelada/contrato/fila-avisos';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  agendarAviso,
  ATRASO_MAXIMO_S,
  ErroFilaIndisponivel,
  filaMemoria,
  type FilaAvisos,
} from '../../../src/infraestrutura/fila/avisos.ts';

/** Produtor da fila `avisos` (notificacoes T16; NOT-22, NOT-43). */

const RANKING: MensagemAviso = {
  tipo: 'ranking',
  grupoId: '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21',
  dataPartida: '2026-11-05',
  criadoEm: '2026-11-05T12:00:00.000Z',
  aposId: '0',
  tentativa: 1,
};

const COBRANCA: MensagemAviso = {
  tipo: 'cobranca',
  idExterno: 'pay_080225913252',
  aviso: 'pagamento_confirmado',
  grupoId: '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21',
  valorCentavos: 990,
  vencimento: '2026-11-10',
  tentativa: 1,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('agendarAviso', () => {
  it('NOT-22: o produtor só enfileira, sem esperar envio: nenhum fetch, uma mensagem na fila', async () => {
    const buscar = vi.spyOn(globalThis, 'fetch');
    const fila = filaMemoria();
    await agendarAviso({ FILA_AVISOS: fila }, RANKING);
    expect(fila.enviadas).toEqual([{ corpo: RANKING }]);
    expect(buscar).not.toHaveBeenCalled();
  });

  it('NOT-22: resolve assim que a fila aceita, sem depender de nada além do send', async () => {
    let liberar!: () => void;
    const send = vi.fn<FilaAvisos['send']>(() => new Promise<void>((r) => (liberar = r)));
    const andamento = agendarAviso({ FILA_AVISOS: { send } }, COBRANCA);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[1]).toEqual({ contentType: 'json' });
    liberar();
    await expect(andamento).resolves.toBeUndefined();
  });

  it('NOT-43: a mensagem de cobrança com e-mail ou nome é recusada antes de chegar à fila', async () => {
    const fila = filaMemoria();
    for (const extra of [{ email: 'criadora@exemplo.com' }, { nome: 'Criadora' }]) {
      await expect(
        agendarAviso({ FILA_AVISOS: fila }, { ...COBRANCA, ...extra } as unknown as MensagemAviso),
      ).rejects.toThrow();
    }
    expect(fila.enviadas).toEqual([]);
  });

  it('atraso: arredonda para cima, limita a 12 h e omite o zero', async () => {
    const fila = filaMemoria();
    await agendarAviso({ FILA_AVISOS: fila }, RANKING, { aposSegundos: 59.2 });
    await agendarAviso({ FILA_AVISOS: fila }, RANKING, { aposSegundos: ATRASO_MAXIMO_S * 2 });
    await agendarAviso({ FILA_AVISOS: fila }, RANKING, { aposSegundos: 0 });
    expect(fila.enviadas.map((e) => e.delaySeconds)).toEqual([60, ATRASO_MAXIMO_S, undefined]);
  });

  it('sem o binding FILA_AVISOS: ErroFilaIndisponivel', async () => {
    await expect(agendarAviso({}, RANKING)).rejects.toBeInstanceOf(ErroFilaIndisponivel);
  });
});
