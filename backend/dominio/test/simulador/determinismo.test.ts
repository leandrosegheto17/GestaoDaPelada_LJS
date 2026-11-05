import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sugerir, type EntradaSimulador } from '../../src/simulador/sugerir.ts';
import { aptosFixos, DATA, historicoFixo } from './apoio.ts';

/**
 * Determinismo e módulo sem aleatoriedade nem relógio (T17; SIM-48, SIM-49, SIM-50; AD-028). Lê os fontes de
 * `backend/dominio/src/simulador/` e reprova qualquer uso de `Math.random`, `crypto`, `Date` ou `performance`, inclusive
 * em comentário (a regra é por texto, a mais simples de manter); depois repete `sugerir` 20 vezes com a mesma entrada.
 *
 * Evidência (registrar na T17 do tasks.md, pelo /executar): um arquivo de prova `src/simulador/prova.ts` com
 * `export const x = Math.random();` deixa vermelho "SIM-50: nenhum fonte do simulador usa …"; o arquivo é removido.
 */

const PASTA = join(import.meta.dirname, '..', '..', 'src', 'simulador');
const PROIBIDOS: readonly [string, RegExp][] = [
  ['Math.random', /\bMath\s*\.\s*random\b/],
  ['crypto', /\bcrypto\b/],
  ['Date', /\bDate\b/],
  ['performance', /\bperformance\b/],
];

/** Os nomes proibidos que aparecem no texto. */
export function proibidosEm(texto: string): string[] {
  return PROIBIDOS.filter(([, padrao]) => padrao.test(texto)).map(([nome]) => nome);
}

describe('módulo do simulador sem aleatoriedade nem relógio', () => {
  it('SIM-50: a regra pega cada nome proibido', () => {
    expect(proibidosEm('export const x = Math.random();')).toEqual(['Math.random']);
    expect(proibidosEm('const id = crypto.randomUUID();')).toEqual(['crypto']);
    expect(proibidosEm('const d = new Date(2026, 0, 1);')).toEqual(['Date']);
    expect(proibidosEm('const t = performance.now();')).toEqual(['performance']);
    expect(proibidosEm('export const dobro = (n: number): number => n * 2;')).toEqual([]);
  });

  it('SIM-50: nenhum fonte do simulador usa Math.random, crypto, Date ou performance', () => {
    const arquivos = readdirSync(PASTA).filter((nome) => nome.endsWith('.ts'));
    expect(arquivos.length).toBeGreaterThan(0);
    const achados = arquivos.flatMap((nome) =>
      proibidosEm(readFileSync(join(PASTA, nome), 'utf8')).map((proibido) => `${nome}: ${proibido}`),
    );
    expect(achados).toEqual([]);
  });
});

describe('sugerir é determinístico', () => {
  const casos: [string, EntradaSimulador][] = [
    ['2 times', { formato: 'dois_times', data: DATA, n: 7, k: 2, aptos: aptosFixos(19, [4, 16]) }],
    ['3 ou mais', { formato: 'varios_times', data: DATA, n: 4, k: 'ilimitado', aptos: aptosFixos(22) }],
  ];

  it.each(casos)('SIM-48: 20 chamadas iguais dão respostas iguais (%s)', (_, entrada) => {
    const primeira = sugerir(entrada, historicoFixo());
    for (let i = 0; i < 20; i += 1) expect(sugerir(entrada, historicoFixo())).toStrictEqual(primeira);
  });
});
