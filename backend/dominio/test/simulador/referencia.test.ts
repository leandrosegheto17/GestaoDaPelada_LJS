import { describe, expect, it } from 'vitest';
import type { Formato, Limite } from '../../src/simulador/base.ts';
import type { HistoricoSim } from '../../src/simulador/prioridade.ts';
import { sugerir, type EntradaSimulador } from '../../src/simulador/sugerir.ts';
import { aptosFixos, DATA, historicoFixo } from './apoio.ts';
import referencia from './referencia-legado.json' with { type: 'json' };

/**
 * Casos de referência do simulador conferidos contra o legado (T18; SIM-52; Goal `S:25`; AD-046). Entradas fixas nos
 * dois formatos, escritas a partir dos critérios; o esperado de cada uma é a saída do domínio do legado
 * (`C:\Leandro\Projetos\GestaodaPelada` @ `ece227e0`, numa cópia fora do projeto, só leitura) com as mesmas entradas,
 * gravada como dado em `referencia-legado.json` (como a AD-041). Divergência = pare e pergunte, sem ajustar o esperado.
 *
 * Evidência (preencher no /executar, ao rodar o legado): comando usado, commit `ece227e0` e a saída de cada caso, no
 * JSON (`comando`, `conferidoEm`, `casos`). Conversão da entrada para o legado: nível v2 = nível do legado × 100
 * (GEL-101), mesmo id, apelido, ano de nascimento, "só 1º" e histórico (partidas, presenças e pesos de `apoio.ts`).
 * Enquanto o caso não tiver a saída do legado registrada, o teste do caso falha (não passa em branco).
 *
 * Casos limite cobertos: K = 2 com reservas "não entra"; "só 1º" entre titulares e reservas; K ilimitado com N = 11;
 * K = 0; 3+ com incompleto de 2; 3+ com incompleto de 1 (aviso de N alternativos, SIM-45); 3+ sem incompleto.
 */

const ANO_SEM_ANO = 1990;

interface SaidaDois {
  ordemPrioridade: string[];
  times: { titulares: string[]; entram: string[] }[];
  naoEntra: string[];
  avisos: string[];
}

interface SaidaVarios {
  times: string[][];
  incompleto: number | null;
  avisos: string[];
}

interface Caso {
  formato: Formato;
  quantos: number;
  n: number;
  k: Limite;
  so1o?: readonly number[];
}

const CASOS: Record<keyof typeof referencia.casos, Caso> = {
  'dois-19-n7-k2': { formato: 'dois_times', quantos: 19, n: 7, k: 2 },
  'dois-19-n7-k2-so1o': { formato: 'dois_times', quantos: 19, n: 7, k: 2, so1o: [3, 15] },
  'dois-22-n11-ilimitado': { formato: 'dois_times', quantos: 22, n: 11, k: 'ilimitado' },
  'dois-16-n7-k0': { formato: 'dois_times', quantos: 16, n: 7, k: 0 },
  'varios-22-n4': { formato: 'varios_times', quantos: 22, n: 4, k: 'ilimitado' },
  'varios-13-n4': { formato: 'varios_times', quantos: 13, n: 4, k: 'ilimitado' },
  'varios-20-n5': { formato: 'varios_times', quantos: 20, n: 5, k: 'ilimitado' },
};

function historicoSemNulos(): HistoricoSim {
  const h = historicoFixo(22);
  return {
    ...h,
    jogadores: h.jogadores.map((j) => ({ ...j, anoNascimento: j.anoNascimento ?? ANO_SEM_ANO })),
  };
}

function entradaDe(caso: Caso): EntradaSimulador {
  return {
    formato: caso.formato,
    data: DATA,
    n: caso.n,
    k: caso.k,
    // O legado não tem "sem ano" (SIM-95 é da v2): na comparação, quem não tem ano nasceu em 1990 nos dois lados.
    aptos: aptosFixos(caso.quantos, caso.so1o ?? []).map((a) => ({
      ...a,
      anoNascimento: a.anoNascimento ?? ANO_SEM_ANO,
    })),
  };
}

describe('casos de referência conferidos contra o legado (SIM-52)', () => {
  it('SIM-52: a referência registra o comando e o commit do legado', () => {
    expect(referencia.commit).toBe('ece227e0');
    expect(referencia.comando, 'rodar o legado e registrar o comando (Evidência da T18)').toEqual(
      expect.any(String),
    );
    expect(referencia.conferidoEm).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
  });

  for (const [nome, caso] of Object.entries(CASOS) as [keyof typeof referencia.casos, Caso][]) {
    it(`SIM-52: ${nome} dá a composição, a ordem e os avisos do legado`, () => {
      const esperado = referencia.casos[nome] as SaidaDois | SaidaVarios | null;
      expect(esperado, `saída do legado para ${nome} não registrada`).not.toBeNull();
      const sugestao = sugerir(entradaDe(caso), historicoSemNulos());
      expect(sugestao.valida).toBe(true);
      if (!sugestao.valida) return;

      if (sugestao.formato === 'dois_times') {
        const obtido: SaidaDois = {
          ordemPrioridade: sugestao.ordemPrioridade,
          times: sugestao.composicao.times.map((t) => ({
            titulares: t.titulares,
            entram: t.entram,
          })),
          naoEntra: sugestao.composicao.naoEntra,
          avisos: sugestao.avisos.map((a) => a.texto),
        };
        expect(obtido).toStrictEqual(esperado);
      } else {
        const obtido: SaidaVarios = {
          times: sugestao.times,
          incompleto: sugestao.incompleto,
          avisos: sugestao.avisos.map((a) => a.texto),
        };
        expect(obtido).toStrictEqual(esperado);
      }
    });
  }
});
