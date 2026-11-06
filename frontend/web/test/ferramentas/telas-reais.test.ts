// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adaptarCorpo,
  entradasAtivas,
  recorteDe,
  seletorDoApp,
  type MapaTelas,
} from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Funções puras das telas reais da comparação visual (T54; ACE-54, ACE-55; AD-021). O que
 * precisa de navegador (respostas servidas, passos, recorte) está em `e2e/visual-runner.spec.ts`.
 */

const MAPA = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../../.specs/mockup/telas.json', import.meta.url)),
    'utf8',
  ),
) as MapaTelas;
const ATIVAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../e2e/telas-ativas.json', import.meta.url)), 'utf8'),
) as {
  telas: { id: string; estado: string }[];
};

describe('adaptarCorpo', () => {
  it('ACE-54: converte o erro antigo do mockup no corpoErro do contrato', () => {
    const antigo = JSON.stringify({
      erro: { codigo: 'senha_atual_incorreta', mensagem: 'Senha atual incorreta.' },
    });
    expect(JSON.parse(adaptarCorpo(antigo))).toEqual({
      erro: 'Senha atual incorreta.',
      codigo: 'senha_atual_incorreta',
    });
  });

  it('ACE-54: leva os grupos do único admin e troca nao_autenticado por sem_sessao', () => {
    const grupos = [{ id: 'g-quinta', nome: 'Pelada de Quinta' }];
    expect(
      JSON.parse(
        adaptarCorpo(JSON.stringify({ erro: { codigo: 'unico_admin', mensagem: 'x', grupos } })),
      ),
    ).toEqual({
      erro: 'x',
      codigo: 'unico_admin',
      grupos,
    });
    expect(
      JSON.parse(
        adaptarCorpo(JSON.stringify({ erro: { codigo: 'nao_autenticado', mensagem: 'Entre.' } })),
      ).codigo,
    ).toBe('sem_sessao');
  });

  it('ACE-54: corpo que não é erro antigo passa igual', () => {
    const sessao = JSON.stringify({ id: 'c1', nome: 'Leandro', grupos: [] });
    expect(adaptarCorpo(sessao)).toBe(sessao);
    expect(adaptarCorpo('{}')).toBe('{}');
    expect(adaptarCorpo('')).toBe('');
    expect(adaptarCorpo(JSON.stringify({ erro: 'já no formato novo', codigo: 'sem_sessao' }))).toBe(
      JSON.stringify({ erro: 'já no formato novo', codigo: 'sem_sessao' }),
    );
  });
});

describe('seletorDoApp', () => {
  it('ACE-54: a classe casa a global e a do CSS Module do build visual', () => {
    expect(seletorDoApp('.faixa--erro')).toBe(
      ':is(.faixa--erro, [class^="faixa--erro--m-"], [class*=" faixa--erro--m-"])',
    );
  });

  it('ACE-54: role=, text=, id e atributo ficam como estão; partes de >> são tratadas uma a uma', () => {
    expect(seletorDoApp("role=button[name='Trocar senha']")).toBe(
      "role=button[name='Trocar senha']",
    );
    expect(seletorDoApp('text=Senha trocada. Outros aparelhos')).toBe(
      'text=Senha trocada. Outros aparelhos',
    );
    expect(seletorDoApp('#nova')).toBe('#nova');
    expect(seletorDoApp('[role=dialog]')).toBe('[role=dialog]');
    expect(seletorDoApp(".dialogo >> role=button[name='Arquivar grupo']")).toBe(
      ':is(.dialogo, [class^="dialogo--m-"], [class*=" dialogo--m-"]) >> role=button[name=\'Arquivar grupo\']',
    );
  });
});

describe('entradasAtivas', () => {
  it('ACE-55: acha a entrada real pelo id e estado, na ordem da lista', () => {
    const r = entradasAtivas(MAPA, {
      telas: [
        { id: 'T25', estado: 'erro' },
        { id: 'T04', estado: 'vazio' },
      ],
    });
    expect(r.map((e) => `${e.id} ${e.estado}`)).toEqual(['T25 erro', 'T04 vazio']);
    expect(r[0]?.rota).toBe('/app/conta/senha');
  });

  it('ACE-55: estado que não existe, ou entrada sem real: true, falha com mensagem clara', () => {
    expect(() => entradasAtivas(MAPA, { telas: [{ id: 'T25', estado: 'inexistente' }] })).toThrow(
      'T25 inexistente',
    );
    // T01 instalar-iphone é uma entrada do mockup sem `real: true` (a T01 sucesso passou a real na partidas-e-ranking
    // T75, com o telas.json do LJS; a escolhida segue sem `real`, como a P26 do LJS).
    expect(() =>
      entradasAtivas(MAPA, { telas: [{ id: 'T01', estado: 'instalar-iphone' }] }),
    ).toThrow('real: true');
  });

  it('ACE-55: todas as entradas do telas-ativas.json existem no telas.json', () => {
    expect(() => entradasAtivas(MAPA, ATIVAS)).not.toThrow();
  });

  it('ACE-54, ACE-55: todos os estados reais das telas públicas de acesso estão ativos (T55)', () => {
    const publicas = ['T04', 'T05', 'T06', 'T07', 'T29', 'T30', 'T31', 'T33'];
    const esperados = (MAPA.telas ?? [])
      .filter((t) => t.real === true && publicas.includes(t.id))
      .map((t) => `${t.id} ${t.estado}`);
    const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);
    expect(esperados.length).toBeGreaterThan(0);
    for (const e of esperados) expect(ativos).toContain(e);
  });

  it('ACE-54, ACE-55: os estados reais das telas com sessão estão ativos; as T08 passaram para a T71 da grupos-e-elenco (T56, AD-031)', () => {
    const comSessao = ['T19', 'T25', 'T32'];
    const esperados = (MAPA.telas ?? [])
      .filter((t) => t.real === true && comSessao.includes(t.id))
      .map((t) => `${t.id} ${t.estado}`);
    const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);
    for (const e of [...esperados, 'T09 menu-conta']) expect(ativos).toContain(e);
    // AD-031: as T08 ficaram de fora da T56 e entraram na T71 da grupos-e-elenco, que as ativou todas.
    const t08Reais = (MAPA.telas ?? [])
      .filter((t) => t.real === true && t.id === 'T08')
      .map((t) => `${t.id} ${t.estado}`);
    expect(t08Reais.length).toBeGreaterThan(0);
    for (const e of t08Reais) expect(ativos).toContain(e);
  });
});

describe('recorteDe', () => {
  it('ACE-54: o recorte do app é reescrito; o do mockup não', () => {
    const entrada = {
      id: 'X',
      estado: 'y',
      mockup: 'm.html',
      recorte: { mockup: '.faixa--erro', app: ['#nova', '.faixa'] },
    };
    expect(recorteDe(entrada, 'mockup')).toBe('.faixa--erro');
    expect(recorteDe(entrada, 'app')).toEqual(['#nova', seletorDoApp('.faixa')]);
    expect(recorteDe({ id: 'X', estado: 'y', mockup: 'm.html' }, 'app')).toBeUndefined();
  });
});
