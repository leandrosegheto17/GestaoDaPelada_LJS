import { describe, expect, it } from 'vitest';
import {
  grupoFreeEditavel,
  somenteLeitura,
  type EntradaExcedente,
} from '../../src/plano/excedente.ts';

/**
 * Regra do excedente do Free (T5; PLA-15, PLA-16, PLA-17).
 *
 * Casos limite listados antes do código: 19, 20 e 21 ativos; plano não Free com 30; dois grupos Free com o mesmo
 * `criado_em`; grupo arquivado (fora da lista); inativar com 25.
 */

const SO_ESTE = [{ id: 'g-a', criadoEm: '2026-01-01T10:00:00Z' }];

function entrada(extra: Partial<EntradaExcedente>): EntradaExcedente {
  return {
    plano: 'free',
    jogadoresAtivos: 10,
    gruposFreeDaCriadora: SO_ESTE,
    grupoId: 'g-a',
    operacao: 'escrita',
    ...extra,
  };
}

describe('somenteLeitura: limite de jogadores', () => {
  it('PLA-15: Free com 21 ativos → limite_jogadores para escrita, cadastrar e reativar', () => {
    expect(somenteLeitura(entrada({ jogadoresAtivos: 21 }))).toBe('limite_jogadores');
    expect(somenteLeitura(entrada({ jogadoresAtivos: 21, operacao: 'cadastrar_jogador' }))).toBe(
      'limite_jogadores',
    );
    expect(somenteLeitura(entrada({ jogadoresAtivos: 21, operacao: 'reativar_jogador' }))).toBe(
      'limite_jogadores',
    );
  });

  it('PLA-15: Free com 21 ou 25 ativos ainda inativa jogador', () => {
    expect(
      somenteLeitura(entrada({ jogadoresAtivos: 21, operacao: 'inativar_jogador' })),
    ).toBeNull();
    expect(
      somenteLeitura(entrada({ jogadoresAtivos: 25, operacao: 'inativar_jogador' })),
    ).toBeNull();
  });

  it('PLA-16: Free com 20 → cadastrar e reativar dão limite_jogadores; escrita passa', () => {
    expect(somenteLeitura(entrada({ jogadoresAtivos: 20, operacao: 'cadastrar_jogador' }))).toBe(
      'limite_jogadores',
    );
    expect(somenteLeitura(entrada({ jogadoresAtivos: 20, operacao: 'reativar_jogador' }))).toBe(
      'limite_jogadores',
    );
    expect(somenteLeitura(entrada({ jogadoresAtivos: 20, operacao: 'escrita' }))).toBeNull();
  });

  it('PLA-16: Free com 19 cadastra e reativa', () => {
    expect(
      somenteLeitura(entrada({ jogadoresAtivos: 19, operacao: 'cadastrar_jogador' })),
    ).toBeNull();
    expect(
      somenteLeitura(entrada({ jogadoresAtivos: 19, operacao: 'reativar_jogador' })),
    ).toBeNull();
  });

  it.each(['trial', 'pro', 'cortesia'] as const)(
    'PLA-15: %s com 30 ativos não trava nada',
    (plano) => {
      for (const operacao of [
        'escrita',
        'cadastrar_jogador',
        'reativar_jogador',
        'inativar_jogador',
      ] as const) {
        expect(somenteLeitura(entrada({ plano, jogadoresAtivos: 30, operacao }))).toBeNull();
      }
    },
  );
});

describe('somenteLeitura: limite de grupos', () => {
  const DOIS = [
    { id: 'g-b', criadoEm: '2026-03-01T10:00:00Z' },
    { id: 'g-a', criadoEm: '2026-01-01T10:00:00Z' },
  ];

  it('PLA-17: dois grupos Free da criadora → o mais antigo segue editável, o outro limite_grupos', () => {
    expect(somenteLeitura(entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-a' }))).toBeNull();
    expect(somenteLeitura(entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-b' }))).toBe(
      'limite_grupos',
    );
    expect(
      somenteLeitura(
        entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-b', operacao: 'cadastrar_jogador' }),
      ),
    ).toBe('limite_grupos');
  });

  it('PLA-17: mesmo criado_em → o de menor id segue editável', () => {
    const empate = [
      { id: 'g-z', criadoEm: '2026-01-01T10:00:00Z' },
      { id: 'g-m', criadoEm: '2026-01-01T10:00:00Z' },
    ];
    expect(grupoFreeEditavel(empate)?.id).toBe('g-m');
    expect(somenteLeitura(entrada({ gruposFreeDaCriadora: empate, grupoId: 'g-m' }))).toBeNull();
    expect(somenteLeitura(entrada({ gruposFreeDaCriadora: empate, grupoId: 'g-z' }))).toBe(
      'limite_grupos',
    );
  });

  it('PLA-17: um grupo Free só (o arquivado não entra na lista) → editável', () => {
    expect(somenteLeitura(entrada({ gruposFreeDaCriadora: SO_ESTE }))).toBeNull();
  });

  it('PLA-17: inativar jogador no grupo que não é o mais antigo continua permitido', () => {
    expect(
      somenteLeitura(
        entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-b', operacao: 'inativar_jogador' }),
      ),
    ).toBeNull();
  });

  it('PLA-17: os dois motivos ao mesmo tempo → limite_grupos', () => {
    expect(
      somenteLeitura(entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-b', jogadoresAtivos: 25 })),
    ).toBe('limite_grupos');
  });

  it('PLA-17: o grupo mais antigo com 21 ativos ainda trava por jogadores', () => {
    expect(
      somenteLeitura(entrada({ gruposFreeDaCriadora: DOIS, grupoId: 'g-a', jogadoresAtivos: 21 })),
    ).toBe('limite_jogadores');
  });

  it('PLA-17: lista vazia não tem grupo editável', () => {
    expect(grupoFreeEditavel([])).toBeNull();
  });
});
