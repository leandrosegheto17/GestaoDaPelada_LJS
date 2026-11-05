import { describe, expect, it } from 'vitest';
import { sugerir } from '../../src/simulador/sugerir.ts';
import { aptosFixos, DATA, embaralhar, embaralharHistorico, historicoFixo } from './apoio.ts';

/**
 * sugerir (T15; SIM-19, SIM-47, SIM-48, SIM-49).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - Aptos, jogadores, partidas e presenças em outra ordem: o mesmo resultado, campo a campo.
 * - 3 ou mais: sem ordem de prioridade; "só 1º" que chegasse é ignorado.
 * - Aptos insuficientes nos dois formatos: inválida com a descrição da prévia.
 * - Válida: todo apto aparece uma vez na composição (2 times: times + "não entra"; 3 ou mais: os times).
 */

describe('sugerir em 2 times', () => {
  it('SIM-49: aptos, jogadores, partidas e presenças embaralhados dão o mesmo resultado', () => {
    const entrada = { formato: 'dois_times' as const, data: DATA, n: 7, k: 2, aptos: aptosFixos(19, [4, 16]) };
    const normal = sugerir(entrada, historicoFixo());
    const embaralhado = sugerir({ ...entrada, aptos: embaralhar(entrada.aptos) }, embaralharHistorico(historicoFixo()));
    expect(embaralhado).toStrictEqual(normal);
  });

  it('SIM-47: devolve composição, indicadores, avisos, ordem de prioridade e a descrição', () => {
    const r = sugerir({ formato: 'dois_times', data: DATA, n: 7, k: 2, aptos: aptosFixos(19) }, historicoFixo());
    expect(r.valida).toBe(true);
    if (!r.valida || r.formato !== 'dois_times') return;
    expect(r.descricao).toBe('2 times de 7 · 5 reservas');
    expect(r.ordemPrioridade).toHaveLength(19);
    expect(r.indicadores).toHaveLength(2);
    const todos = [...r.composicao.times.flatMap((t) => [...t.titulares, ...t.entram]), ...r.composicao.naoEntra];
    expect([...todos].sort()).toEqual(aptosFixos(19).map((a) => a.id).sort());
    expect(r.avisos.map((a) => a.tipo)).toContain('sem_nota');
  });

  it('SIM-47: aptos insuficientes devolvem a prévia inválida e a descrição', () => {
    const r = sugerir({ formato: 'dois_times', data: DATA, n: 11, k: 2, aptos: aptosFixos(19) }, historicoFixo());
    expect(r).toMatchObject({ valida: false, descricao: 'Faltam aptos para 2 times de 11. Maior N possível: 9.' });
  });
});

describe('sugerir em 3 ou mais times', () => {
  it('SIM-19: o resultado não tem ordem de prioridade', () => {
    const r = sugerir({ formato: 'varios_times', data: DATA, n: 4, k: 'ilimitado', aptos: aptosFixos(22) }, historicoFixo());
    expect(r.valida).toBe(true);
    expect(r).not.toHaveProperty('ordemPrioridade');
  });

  it('SIM-19: o histórico não muda a sugestão de 3 ou mais', () => {
    const entrada = { formato: 'varios_times' as const, data: DATA, n: 4, k: 'ilimitado' as const, aptos: aptosFixos(22) };
    const semHistorico = { ...historicoFixo(), partidas: [], presencas: [] };
    expect(sugerir(entrada, semHistorico)).toStrictEqual(sugerir(entrada, historicoFixo()));
  });

  it('SIM-49: aptos em outra ordem dão o mesmo resultado', () => {
    const entrada = { formato: 'varios_times' as const, data: DATA, n: 4, k: 'ilimitado' as const, aptos: aptosFixos(22) };
    expect(sugerir({ ...entrada, aptos: embaralhar(entrada.aptos) }, historicoFixo())).toStrictEqual(
      sugerir(entrada, historicoFixo()),
    );
  });

  it('SIM-47: 22 aptos com N = 4: 5 times de 4 e o incompleto de 2, com a descrição', () => {
    const r = sugerir({ formato: 'varios_times', data: DATA, n: 4, k: 'ilimitado', aptos: aptosFixos(22) }, historicoFixo());
    if (!r.valida || r.formato !== 'varios_times') throw new Error('esperava 3 ou mais válida');
    expect(r.descricao).toBe('5 times de 4 + 1 time incompleto de 2');
    expect(r.times.map((t) => t.length)).toEqual([4, 4, 4, 4, 4, 2]);
    expect(r.incompleto).toBe(5);
  });

  it('SIM-47: aptos insuficientes devolvem a descrição da prévia', () => {
    const r = sugerir({ formato: 'varios_times', data: DATA, n: 4, k: 'ilimitado', aptos: aptosFixos(8) }, historicoFixo(8));
    expect(r).toMatchObject({
      valida: false,
      descricao: 'Com 8 aptos e N = 4 não há 3 times. Use N menor ou o formato 2 times.',
    });
  });
});
