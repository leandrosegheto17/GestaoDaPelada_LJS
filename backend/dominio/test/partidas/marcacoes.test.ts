import { describe, expect, it } from 'vitest';
import {
  ativosNaData,
  contagemDaPartida,
  MENSAGEM_JOGADOR_INATIVO,
  MENSAGEM_JOGADOR_REPETIDO,
  MENSAGEM_SITUACAO,
  validarMarcacoes,
} from '../../src/partidas/marcacoes.ts';

/** Validação das marcações e contagem da partida (T8; PAR-23, PAR-24, PAR-25, PAR-27). */

const DATA = '2026-10-15';
const JOGADORES = [
  { id: 'j-ativo', periodos: [{ inicio: '2026-01-01', fim: null }] },
  { id: 'j-saiu-hoje', periodos: [{ inicio: '2026-01-01', fim: DATA }] },
  { id: 'j-entra-hoje', periodos: [{ inicio: DATA, fim: null }] },
  { id: 'j-outro', periodos: [{ inicio: '2026-01-01', fim: null }] },
];
const ATIVOS = ativosNaData(JOGADORES, DATA);

describe('ativosNaData (PAR-27)', () => {
  it('PAR-27: jogador com período [início, fim) que termina na data não está ativo nela', () => {
    expect(ATIVOS.map((j) => j.id)).not.toContain('j-saiu-hoje');
  });

  it('PAR-27: o período que começa na data o deixa ativo nela', () => {
    expect(ATIVOS.map((j) => j.id)).toEqual(['j-ativo', 'j-entra-hoje', 'j-outro']);
  });
});

describe('validarMarcacoes', () => {
  it.each([
    ['inativo na data', 'j-saiu-hoje'],
    ['inexistente', '00000000-0000-4000-8000-000000000000'],
    ['de outro grupo (fora da lista de ativos deste)', 'j-de-outro-grupo'],
  ])(
    'PAR-24: jogador %s dá "Jogador não está ativo nesta data." em marcacoes.<i>.jogadorId',
    (_caso, jogadorId) => {
      const r = validarMarcacoes(ATIVOS, [
        { jogadorId: 'j-ativo', situacao: 'presente' },
        { jogadorId, situacao: 'presente' },
      ]);
      expect(r).toEqual({
        ok: false,
        campos: { 'marcacoes.1.jogadorId': MENSAGEM_JOGADOR_INATIVO },
      });
    },
  );

  it('PAR-25: jogador repetido dá "Há jogador repetido nas marcações." em marcacoes', () => {
    const r = validarMarcacoes(ATIVOS, [
      { jogadorId: 'j-ativo', situacao: 'presente' },
      { jogadorId: 'j-ativo', situacao: 'ausente' },
    ]);
    expect(r).toEqual({ ok: false, campos: { marcacoes: MENSAGEM_JOGADOR_REPETIDO } });
  });

  it('PAR-26: situação fora das quatro é recusada no campo da marcação', () => {
    const r = validarMarcacoes(ATIVOS, [{ jogadorId: 'j-ativo', situacao: 'atrasado' }]);
    expect(r).toEqual({ ok: false, campos: { 'marcacoes.0.situacao': MENSAGEM_SITUACAO } });
  });

  it('PAR-23: ausente não entra na lista de presenças a gravar', () => {
    const r = validarMarcacoes(ATIVOS, [
      { jogadorId: 'j-ativo', situacao: 'presente' },
      { jogadorId: 'j-entra-hoje', situacao: 'ausente' },
      { jogadorId: 'j-outro', situacao: 'expulso' },
    ]);
    expect(r).toEqual({
      ok: true,
      presencas: [
        { jogadorId: 'j-ativo', situacao: 'presente' },
        { jogadorId: 'j-outro', situacao: 'expulso' },
      ],
      contagem: { presentes: 1, lesionados: 0, expulsos: 1 },
    });
  });

  it('PAR-23: sem marcações, nada a gravar', () => {
    expect(validarMarcacoes(ATIVOS, [])).toEqual({
      ok: true,
      presencas: [],
      contagem: { presentes: 0, lesionados: 0, expulsos: 0 },
    });
  });
});

describe('contagemDaPartida', () => {
  it('PAR-23: conta presentes, lesionados e expulsos; ausente não entra', () => {
    expect(
      contagemDaPartida([
        { situacao: 'presente' },
        { situacao: 'presente' },
        { situacao: 'lesionado' },
        { situacao: 'ausente' },
        { situacao: 'expulso' },
      ]),
    ).toEqual({ presentes: 2, lesionados: 1, expulsos: 1 });
  });
});
