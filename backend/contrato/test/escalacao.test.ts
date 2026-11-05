import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import {
  composicaoGravada,
  escalacaoCorpo,
  escalacaoResposta,
  lerComposicao,
} from '../src/escalacao.ts';
import { idsDaComposicao } from '../src/simulador.ts';

/** Contrato da escalação (T23; SIM-67, SIM-82, SIM-94). */

const u = (i: number): string => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const j = (i: number, so1oTempo = false) => ({ id: u(i), so1oTempo });

const DOIS: z.infer<typeof composicaoGravada.dois_times> = {
  times: [
    { titulares: [j(1), j(4)], entramNo2oTempo: [j(5, true)] },
    { titulares: [j(2), j(3)], entramNo2oTempo: [] },
  ],
  naoEntra: [u(6)],
};
const VARIOS = {
  times: [{ jogadores: [u(1), u(2)] }, { jogadores: [u(3), u(4)] }, { jogadores: [u(5)] }],
};

function mensagens(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? [])
    (porCampo[String(problema.path[0] ?? '')] ??= []).push(problema.message);
  return porCampo;
}

describe('lerComposicao', () => {
  it('SIM-94: composição de 2 times válida é lida', () => {
    expect(lerComposicao('dois_times', DOIS)).toEqual({ formato: 'dois_times', composicao: DOIS });
  });

  it('SIM-94: composição de 3 ou mais válida é lida', () => {
    expect(lerComposicao('varios_times', VARIOS)).toEqual({
      formato: 'varios_times',
      composicao: VARIOS,
    });
  });

  it.each([
    ['sem times', 'dois_times', { naoEntra: [] }],
    ['tipo errado', 'dois_times', 'texto'],
    ['nulo', 'varios_times', null],
    ['campo extra', 'varios_times', { ...VARIOS, extra: 1 }],
    ['formato trocado', 'varios_times', DOIS],
    ['2 times com 1 time só', 'dois_times', { times: [DOIS.times[0]], naoEntra: [] }],
  ] as const)('SIM-94: %s dá nulo, sem lançar', (_, formato, json) => {
    expect(() => lerComposicao(formato, json)).not.toThrow();
    expect(lerComposicao(formato, json)).toBeNull();
  });
});

describe('composicaoGravada', () => {
  it.each(['apelido', 'nivel', 'telefone'])('SIM-82: jogador com %s é recusado', (campo) => {
    const comExtra = {
      ...DOIS,
      times: [{ titulares: [{ ...j(1), [campo]: 'x' }], entramNo2oTempo: [] }, DOIS.times[1]],
    };
    expect(composicaoGravada.dois_times.safeParse(comExtra).success).toBe(false);
  });

  it('SIM-82: 3 ou mais só guarda ids', () => {
    expect(
      composicaoGravada.varios_times.safeParse({
        times: [{ jogadores: [{ id: u(1), apelido: 'A' }] }],
      }).success,
    ).toBe(false);
  });
});

describe('idsDaComposicao', () => {
  it('SIM-67: 2 times inclui titulares, reservas e "não entra"', () => {
    expect(idsDaComposicao({ formato: 'dois_times', composicao: DOIS }).sort()).toEqual(
      [1, 2, 3, 4, 5, 6].map(u),
    );
  });

  it('SIM-67: 3 ou mais inclui todos os times', () => {
    expect(idsDaComposicao({ formato: 'varios_times', composicao: VARIOS }).sort()).toEqual(
      [1, 2, 3, 4, 5].map(u),
    );
  });
});

describe('escalacaoCorpo', () => {
  it('SIM-67: 2 times com K e 3 ou mais sem K são aceitos', () => {
    expect(
      escalacaoCorpo.safeParse({
        formato: 'dois_times',
        data: '2026-10-22',
        n: 2,
        k: 'ilimitado',
        composicao: DOIS,
      }).success,
    ).toBe(true);
    expect(
      escalacaoCorpo.safeParse({
        formato: 'varios_times',
        data: '2026-10-22',
        n: 2,
        composicao: VARIOS,
      }).success,
    ).toBe(true);
  });

  it('SIM-72: 3 ou mais com K é recusado; 2 times sem K é recusado no campo k', () => {
    expect(
      escalacaoCorpo.safeParse({
        formato: 'varios_times',
        data: '2026-10-22',
        n: 2,
        k: 1,
        composicao: VARIOS,
      }).success,
    ).toBe(false);
    expect(
      Object.keys(
        mensagens(
          escalacaoCorpo.safeParse({
            formato: 'dois_times',
            data: '2026-10-22',
            n: 2,
            composicao: DOIS,
          }),
        ),
      ),
    ).toEqual(['k']);
  });

  it('SIM-71: jogador repetido na composição é recusado no campo composicao', () => {
    const repetido = { ...DOIS, naoEntra: [u(1)] };
    expect(
      mensagens(
        escalacaoCorpo.safeParse({
          formato: 'dois_times',
          data: '2026-10-22',
          n: 2,
          k: 1,
          composicao: repetido,
        }),
      ),
    ).toEqual({
      composicao: ['Há jogador repetido na composição.'],
    });
  });

  it('SIM-67: data inválida é recusada no campo data', () => {
    expect(
      mensagens(
        escalacaoCorpo.safeParse({
          formato: 'varios_times',
          data: '2026-02-30',
          n: 2,
          composicao: VARIOS,
        }),
      ),
    ).toEqual({ data: ['Informe uma data válida.'] });
  });
});

describe('escalacaoResposta', () => {
  it('SIM-67: aceita data e momento ISO e recusa campo extra', () => {
    expect(
      escalacaoResposta.safeParse({ data: '2026-10-22', confirmadaEm: '2026-10-20T15:30:00.000Z' })
        .success,
    ).toBe(true);
    expect(
      escalacaoResposta.safeParse({
        data: '2026-10-22',
        confirmadaEm: '2026-10-20T15:30:00.000Z',
        confirmadaPor: 'x',
      }).success,
    ).toBe(false);
  });
});
