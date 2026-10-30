// Critérios: GEL-47 (ordem pelo apelido, sem acento e sem caixa) e GEL-48 (busca sem acento e sem caixa).
import { describe, expect, it } from 'vitest';
import { chaveBusca, compararApelido, compararApelidoBase } from '../../src/index.ts';

const j = (id: string, apelido: string) => ({ id, apelido });

describe('compararApelido: ordem da lista (GEL-47)', () => {
  it('põe "Álvaro" antes de "Beto", apesar do acento', () => {
    const lista = [j('1', 'Beto'), j('2', 'Álvaro')].sort(compararApelido);
    expect(lista.map((x) => x.apelido)).toEqual(['Álvaro', 'Beto']);
  });

  it('ignora a caixa: "beto" antes de "Carlos" e "zeca" depois de "Ana"', () => {
    const lista = [j('1', 'zeca'), j('2', 'Carlos'), j('3', 'beto'), j('4', 'Ana')].sort(compararApelido);
    expect(lista.map((x) => x.apelido)).toEqual(['Ana', 'beto', 'Carlos', 'zeca']);
  });

  it('acento no meio também não pesa: "Joãozinho" antes de "Joaquim"', () => {
    expect(compararApelidoBase('Joãozinho', 'Joaquim')).toBeLessThan(0);
    expect(compararApelidoBase('Éder', 'Edson')).toBeLessThan(0);
  });

  it('apelidos que só diferem por acento ou caixa empatam e o id desempata', () => {
    expect(compararApelidoBase('José', 'jose')).toBe(0);
    const lista = [j('b', 'José'), j('a', 'jose')].sort(compararApelido);
    expect(lista.map((x) => x.id)).toEqual(['a', 'b']);
    expect(compararApelido(j('a', 'Zé'), j('a', 'Zé'))).toBe(0);
  });
});

describe('chaveBusca: busca na lista (GEL-48)', () => {
  it('"José" e "jose" têm a mesma chave', () => {
    expect(chaveBusca('José')).toBe(chaveBusca('jose'));
    expect(chaveBusca('JOSÉ')).toBe('jose');
  });

  it('tira cedilha, til e trema e passa a minúsculas', () => {
    expect(chaveBusca('Conceição Müller')).toBe('conceicao muller');
  });

  it('vazio devolve vazio, sem quebrar', () => {
    expect(chaveBusca('')).toBe('');
  });

  it('a busca por trecho funciona comparando as chaves', () => {
    expect(chaveBusca('Zé Mané').includes(chaveBusca('MANE'))).toBe(true);
    expect(chaveBusca('Beto').includes(chaveBusca('jose'))).toBe(false);
  });
});
