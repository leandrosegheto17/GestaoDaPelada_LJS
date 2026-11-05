import { describe, expect, it } from 'vitest';
import { CODIGOS_ERRO, corpoErro, MENSAGENS_ERRO } from '../src/acesso.ts';
import { mensagemPartidaJaExiste } from '../src/partidas.ts';

/** O 409 `partida_ja_existe` (partidas-e-ranking T39; PAR-21, PAR-34): código, mensagem com a data e `dataExistente`. */

describe('partida_ja_existe', () => {
  it('PAR-21: a mensagem traz a data como dd/mm/aaaa', () => {
    expect(mensagemPartidaJaExiste('2026-01-08')).toBe('Já existe uma partida em 08/01/2026.');
    expect(mensagemPartidaJaExiste('2025-12-31')).toBe('Já existe uma partida em 31/12/2025.');
  });

  it('PAR-21: o código existe e tem mensagem padrão', () => {
    expect(CODIGOS_ERRO).toContain('partida_ja_existe');
    expect(MENSAGENS_ERRO.partida_ja_existe.length).toBeGreaterThan(0);
  });

  it('PAR-21: o corpo de erro aceita dataExistente AAAA-MM-DD', () => {
    const corpo = { erro: mensagemPartidaJaExiste('2026-01-08'), codigo: 'partida_ja_existe', dataExistente: '2026-01-08' };
    expect(corpoErro.parse(corpo)).toEqual(corpo);
  });

  it('PAR-21: dataExistente fora do formato é recusada', () => {
    expect(corpoErro.safeParse({ erro: 'x', codigo: 'partida_ja_existe', dataExistente: '08/01/2026' }).success).toBe(false);
  });
});
