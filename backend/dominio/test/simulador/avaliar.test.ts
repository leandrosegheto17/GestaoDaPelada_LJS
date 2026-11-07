import { describe, expect, it } from 'vitest';
import type { Apto } from '../../src/simulador/base.ts';
import { avaliar, type ComposicaoEntrada } from '../../src/simulador/avaliar.ts';
import {
  sugerir,
  type EntradaSimulador,
  type SugestaoDois,
  type SugestaoVarios,
} from '../../src/simulador/sugerir.ts';
import { aptosFixos, DATA, historicoFixo } from './apoio.ts';

/**
 * avaliar (T16; SIM-62, SIM-63).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - A própria sugestão avaliada dá os mesmos indicadores e avisos (2 times e 3 ou mais).
 * - Mover um titular de A para B: muda somas e pares dos dois times, o resto da composição fica igual, e o aviso de
 *   composição diferente aparece (A sem N titulares).
 * - Marcar "só 1º" na composição vale mais que o da entrada.
 * - Repetido e fora dos aptos: mensagem no campo `composicao`; repetido é conferido antes.
 */

const historico = historicoFixo();
const APTOS = aptosFixos(19);
const ENTRADA_DOIS: EntradaSimulador = {
  formato: 'dois_times',
  data: DATA,
  n: 7,
  k: 2,
  aptos: APTOS,
};
const ENTRADA_VARIOS: EntradaSimulador = {
  formato: 'varios_times',
  data: DATA,
  n: 4,
  k: 'ilimitado',
  aptos: aptosFixos(22),
};

function sugestaoDois(): SugestaoDois {
  const s = sugerir(ENTRADA_DOIS, historico);
  if (!s.valida || s.formato !== 'dois_times') throw new Error('esperava 2 times válida');
  return s;
}

function sugestaoVarios(): SugestaoVarios {
  const s = sugerir(ENTRADA_VARIOS, historicoFixo(22));
  if (!s.valida || s.formato !== 'varios_times') throw new Error('esperava 3 ou mais válida');
  return s;
}

function so1oDe(aptos: readonly Apto[]) {
  const mapa = new Map(aptos.map((a) => [a.id, a.so1oTempo]));
  return (id: string) => ({ id, so1oTempo: mapa.get(id) ?? false });
}

function entradaDe(
  s: SugestaoDois,
  aptos: readonly Apto[] = APTOS,
): ComposicaoEntrada & { formato: 'dois_times' } {
  const j = so1oDe(aptos);
  return {
    formato: 'dois_times',
    times: [
      {
        titulares: s.composicao.times[0].titulares.map(j),
        entram: s.composicao.times[0].entram.map(j),
      },
      {
        titulares: s.composicao.times[1].titulares.map(j),
        entram: s.composicao.times[1].entram.map(j),
      },
    ],
    naoEntra: [...s.composicao.naoEntra],
  };
}

describe('avaliar em 2 times', () => {
  it('SIM-62: avaliar a própria sugestão devolve os mesmos indicadores e avisos de sugerir', () => {
    const s = sugestaoDois();
    const r = avaliar(ENTRADA_DOIS, entradaDe(s), historico);
    expect(r).toMatchObject({
      ok: true,
      indicadores: s.indicadores,
      avisos: s.avisos,
      composicao: s.composicao,
    });
  });

  it('SIM-62: mover um titular de A para B muda somas e pares e mantém o resto da composição', () => {
    const s = sugestaoDois();
    const comp = entradaDe(s);
    const movido = comp.times[0].titulares.at(-1)!;
    const ajustada: ComposicaoEntrada = {
      formato: 'dois_times',
      times: [
        { titulares: comp.times[0].titulares.slice(0, -1), entram: comp.times[0].entram },
        { titulares: [...comp.times[1].titulares, movido], entram: comp.times[1].entram },
      ],
      naoEntra: comp.naoEntra,
    };
    const r = avaliar(ENTRADA_DOIS, ajustada, historico);
    if (!r.ok || r.formato !== 'dois_times') throw new Error('esperava avaliação de 2 times');
    const nivel = APTOS.find((a) => a.id === movido.id)!.nivel;
    expect(r.indicadores[0].nivelSoma1oTempo).toBe(s.indicadores[0].nivelSoma1oTempo - nivel);
    expect(r.indicadores[1].nivelSoma1oTempo).toBe(s.indicadores[1].nivelSoma1oTempo + nivel);
    // O movido era o pior titular de A, logo um dos que saíam no intervalo: os pares de A mudam.
    expect(r.indicadores[0].pares).not.toEqual(s.indicadores[0].pares);
    expect(r.composicao.times[0].entram).toEqual(s.composicao.times[0].entram);
    expect(r.composicao.times[1].entram).toEqual(s.composicao.times[1].entram);
    expect(r.composicao.naoEntra).toEqual(s.composicao.naoEntra);
    expect(r.avisos.map((a) => a.texto)).toContain(
      'A composição difere da prevista: confira Time A e Time B.',
    );
  });

  it('SIM-62: o "só 1º" marcado na composição vale mais que o da entrada', () => {
    const s = sugestaoDois();
    const comp = entradaDe(s);
    const marcado = comp.times[0].titulares[0]!;
    const ajustada: ComposicaoEntrada = {
      ...comp,
      times: [
        {
          titulares: [{ ...marcado, so1oTempo: true }, ...comp.times[0].titulares.slice(1)],
          entram: comp.times[0].entram,
        },
        comp.times[1],
      ],
    };
    const r = avaliar(ENTRADA_DOIS, ajustada, historico);
    if (!r.ok || r.formato !== 'dois_times') throw new Error('esperava avaliação de 2 times');
    expect(r.indicadores[0].saem).toContain(marcado.id);
  });

  it('SIM-63: jogador repetido dá "Há jogador repetido na composição."', () => {
    const comp = entradaDe(sugestaoDois());
    const repetido: ComposicaoEntrada = {
      ...comp,
      naoEntra: [...comp.naoEntra, comp.times[0].titulares[0]!.id],
    };
    expect(avaliar(ENTRADA_DOIS, repetido, historico)).toEqual({
      ok: false,
      campo: 'composicao',
      mensagem: 'Há jogador repetido na composição.',
    });
  });

  it('SIM-63: jogador fora dos aptos dá "Há jogador fora dos aptos na composição."', () => {
    const comp = entradaDe(sugestaoDois());
    const fora: ComposicaoEntrada = { ...comp, naoEntra: [...comp.naoEntra, 'de-outro-grupo'] };
    expect(avaliar(ENTRADA_DOIS, fora, historico)).toEqual({
      ok: false,
      campo: 'composicao',
      mensagem: 'Há jogador fora dos aptos na composição.',
    });
  });

  it('SIM-63: repetido é conferido antes de fora dos aptos', () => {
    const comp = entradaDe(sugestaoDois());
    const ambos: ComposicaoEntrada = { ...comp, naoEntra: [...comp.naoEntra, 'x', 'x'] };
    expect(avaliar(ENTRADA_DOIS, ambos, historico)).toMatchObject({
      mensagem: 'Há jogador repetido na composição.',
    });
  });
});

describe('avaliar em 3 ou mais times', () => {
  it('SIM-62: avaliar a própria sugestão devolve os mesmos indicadores e avisos', () => {
    const s = sugestaoVarios();
    const r = avaliar(
      ENTRADA_VARIOS,
      { formato: 'varios_times', times: s.times },
      historicoFixo(22),
    );
    expect(r).toMatchObject({
      ok: true,
      indicadores: s.indicadores,
      avisos: s.avisos,
      times: s.times,
      incompleto: 5,
    });
  });

  it('SIM-37 (A-10): depois de mover jogadores, o incompleto é o time que ficou abaixo de N, não o último', () => {
    const s = sugestaoVarios();
    expect(s.times.map((t) => t.length)).toEqual([4, 4, 4, 4, 4, 2]);
    // Três do primeiro time vão para o último: 1, 4, 4, 4, 4, 5.
    const mover = s.times[0]!.slice(1);
    const times = s.times.map((t, i) =>
      i === 0 ? t.slice(0, 1) : i === 5 ? [...t, ...mover] : [...t],
    );
    const r = avaliar(ENTRADA_VARIOS, { formato: 'varios_times', times }, historicoFixo(22));
    expect(r).toMatchObject({ ok: true, incompleto: 0 });
  });

  it('SIM-37 (A-10): o time que ficou vazio depois de mover é o incompleto', () => {
    const s = sugestaoVarios();
    // Os dois do último time vão um para cada um dos dois primeiros: 5, 5, 4, 4, 4, 0.
    const [a, b] = s.times[5]!;
    const times = s.times.map((t, i) =>
      i === 0 ? [...t, a!] : i === 1 ? [...t, b!] : i === 5 ? [] : [...t],
    );
    expect(
      avaliar(ENTRADA_VARIOS, { formato: 'varios_times', times }, historicoFixo(22)),
    ).toMatchObject({ ok: true, incompleto: 5 });
  });

  it('SIM-63: jogador fora dos aptos em 3 ou mais é recusado', () => {
    const s = sugestaoVarios();
    const times = s.times.map((t, i) => (i === 0 ? [...t.slice(1), 'de-outro-grupo'] : t));
    expect(
      avaliar(ENTRADA_VARIOS, { formato: 'varios_times', times }, historicoFixo(22)),
    ).toMatchObject({
      ok: false,
      mensagem: 'Há jogador fora dos aptos na composição.',
    });
  });
  it('SIM-63 (AD-123): composição sem algum dos aptos é recusada, em 2 times e em 3 ou mais', () => {
    const s = sugestaoDois();
    const e = entradaDe(s);
    const faltando = {
      ...e,
      naoEntra: e.naoEntra.slice(1),
    };
    expect(e.naoEntra.length).toBeGreaterThan(0);
    expect(avaliar(ENTRADA_DOIS, faltando, historico)).toEqual({
      ok: false,
      campo: 'composicao',
      mensagem: 'A composição precisa incluir todos os aptos.',
    });
    const v = sugestaoVarios();
    const times = v.times.map((t, i) => (i === 0 ? t.slice(1) : t));
    expect(
      avaliar(ENTRADA_VARIOS, { formato: 'varios_times', times }, historicoFixo(22)),
    ).toMatchObject({ ok: false, mensagem: 'A composição precisa incluir todos os aptos.' });
  });
});
