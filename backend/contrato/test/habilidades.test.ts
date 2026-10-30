// Critérios: GEL-90 (nome da habilidade de 2 a 30 sem os espaços das pontas), GEL-97 e GEL-98 (nota de 1 a 10 ou null)
// e GEL-99 (nota não inteira ou fora da faixa, erro no campo nota).
import { describe, expect, it } from 'vitest';
import { habilidadeCorpo, habilidadeItem, listaHabilidades, notaCorpo, notaResposta } from '../src/habilidades.ts';
import { camposDe } from './apoio.ts';

const MSG_NOME = 'O nome precisa ter de 2 a 30 caracteres.';

describe('habilidadeCorpo (GEL-90)', () => {
  it('nome de 1 e 31 caracteres é recusado com a mensagem no campo nome', () => {
    expect(camposDe(habilidadeCorpo, { nome: 'A' })).toEqual({ nome: MSG_NOME });
    expect(camposDe(habilidadeCorpo, { nome: 'a'.repeat(31) })).toEqual({ nome: MSG_NOME });
    expect(camposDe(habilidadeCorpo, { nome: '  A  ' })).toEqual({ nome: MSG_NOME });
    expect(camposDe(habilidadeCorpo, {})).toEqual({ nome: MSG_NOME });
  });

  it('nome de 2 e 30 caracteres passa, sem os espaços das pontas', () => {
    expect(habilidadeCorpo.parse({ nome: ' Drible curto ' })).toEqual({ nome: 'Drible curto' });
    expect(habilidadeCorpo.safeParse({ nome: 'ab' }).success).toBe(true);
    expect(habilidadeCorpo.safeParse({ nome: 'a'.repeat(30) }).success).toBe(true);
  });

  it('recusa campo extra', () => {
    expect(habilidadeCorpo.safeParse({ nome: 'Passe', ordem: 1 }).success).toBe(false);
  });
});

describe('notaCorpo (GEL-97 a GEL-99)', () => {
  it.each([1, 10, 5, null])('aceita %j', (nota) => {
    expect(notaCorpo.parse({ nota })).toEqual({ nota });
  });

  it.each([0, 11, 5.5, '7', -1, undefined])('recusa %j no campo nota', (nota) => {
    expect(Object.keys(camposDe(notaCorpo, { nota }))).toEqual(['nota']);
  });

  it('recusa campo extra', () => {
    expect(notaCorpo.safeParse({ nota: 7, habilidadeId: 'h1' }).success).toBe(false);
  });
});

describe('respostas', () => {
  it('habilidadeItem e listaHabilidades', () => {
    const item = { id: 'h1', nome: 'Passe' };
    expect(habilidadeItem.parse(item)).toEqual(item);
    expect(listaHabilidades.parse({ habilidades: [item] })).toEqual({ habilidades: [item] });
    expect(habilidadeItem.safeParse({ id: 'h1' }).success).toBe(false);
  });

  it('notaResposta traz o nível recalculado e semNota (GEL-97, GEL-102)', () => {
    expect(notaResposta.parse({ nivel: 683, semNota: false })).toEqual({ nivel: 683, semNota: false });
    expect(notaResposta.parse({ nivel: 550, semNota: true })).toEqual({ nivel: 550, semNota: true });
    expect(notaResposta.safeParse({ nivel: 683 }).success).toBe(false);
  });
});
