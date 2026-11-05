import { describe, expect, it } from 'vitest';
import {
  consultaContexto,
  contextoResposta,
  MENSAGEM_APTOS_INATIVOS,
  MENSAGEM_APTOS_REPETIDO,
  MENSAGEM_K,
  MENSAGEM_N,
  previaCorpo,
  previaResposta,
} from '../src/simulador.ts';

/** Contrato do simulador (T21; SIM-01, SIM-04, SIM-09, SIM-55). */

function mensagens(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = String(problema.path[0] ?? '');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

const ID_A = '0d2a7d4e-8f3b-4c1a-9e5d-1a2b3c4d5e6f';
const ID_B = '1e3b8e5f-9a4c-4d2b-8f6e-2b3c4d5e6f70';

const PREVIA_DOIS = { formato: 'dois_times', n: 7, k: 2, aptos: [{ id: ID_A, so1oTempo: false }] };

describe('consultaContexto', () => {
  it('SIM-01: sem data é aceita', () => {
    expect(consultaContexto.parse({})).toEqual({});
  });

  it('SIM-02: data válida passa como veio', () => {
    expect(consultaContexto.parse({ data: '2026-10-22' })).toEqual({ data: '2026-10-22' });
  });

  it.each(['2026-02-30', '2026-1-1', '22/10/2026', ''])('SIM-04: %j é recusada no campo data', (data) => {
    expect(mensagens(consultaContexto.safeParse({ data }))).toEqual({ data: ['Informe uma data válida.'] });
  });

  it('SIM-04: campo desconhecido é recusado', () => {
    expect(consultaContexto.safeParse({ data: '2026-10-22', formato: 'dois_times' }).success).toBe(false);
  });
});

describe('contextoResposta', () => {
  const resposta = {
    dataSugerida: '2026-10-22',
    hoje: '2026-10-20',
    jogadores: [{ id: 'j1', apelido: 'Toninho', nivel: 683, semNota: false, semAno: false }],
  };

  it('SIM-01: aceita a resposta com id, apelido, nível inteiro, semNota e semAno', () => {
    expect(contextoResposta.parse(resposta)).toEqual(resposta);
  });

  it.each(['telefone', 'anoNascimento', 'posicao', 'notas', 'pontos'])('SIM-03: jogador com %s é recusado', (campo) => {
    const comExtra = { ...resposta, jogadores: [{ ...resposta.jogadores[0], [campo]: 1 }] };
    expect(contextoResposta.safeParse(comExtra).success).toBe(false);
  });

  it('SIM-01: nível decimal (6.8) é recusado: o contrato é inteiro × 100', () => {
    expect(contextoResposta.safeParse({ ...resposta, jogadores: [{ ...resposta.jogadores[0], nivel: 6.8 }] }).success).toBe(false);
  });
});

describe('previaCorpo', () => {
  it('SIM-09: 2 times e 3 ou mais válidos são aceitos', () => {
    expect(previaCorpo.safeParse(PREVIA_DOIS).success).toBe(true);
    expect(previaCorpo.safeParse({ formato: 'varios_times', n: 4, aptos: [{ id: ID_A }] }).success).toBe(true);
  });

  it('SIM-09: aptos vazios são aceitos (a prévia descreve como insuficiente)', () => {
    expect(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos: [] }).success).toBe(true);
  });

  it.each([1, 12, 7.5, '7'])('SIM-55: N %j é recusado no campo n', (n) => {
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, n }))).toEqual({ n: [MENSAGEM_N] });
  });

  it.each([21, -1, 'infinito', 2.5])('SIM-55: K %j é recusado no campo k', (k) => {
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, k }))).toEqual({ k: [MENSAGEM_K] });
  });

  it.each([0, 20, 'ilimitado'])('SIM-55: K %j é aceito', (k) => {
    expect(previaCorpo.safeParse({ ...PREVIA_DOIS, k }).success).toBe(true);
  });

  it.each(['n', 'k', 'aptos'])('SIM-55: campo %s ausente é recusado no campo', (campo) => {
    const corpo: Record<string, unknown> = { ...PREVIA_DOIS };
    delete corpo[campo];
    expect(Object.keys(mensagens(previaCorpo.safeParse(corpo)))).toEqual([campo]);
  });

  it('SIM-55: formato ausente ou desconhecido é recusado', () => {
    expect(previaCorpo.safeParse({ n: 7, k: 2, aptos: [] }).success).toBe(false);
    expect(previaCorpo.safeParse({ ...PREVIA_DOIS, formato: 'tres_times' }).success).toBe(false);
  });

  it('SIM-09: campo desconhecido é recusado', () => {
    expect(previaCorpo.safeParse({ ...PREVIA_DOIS, data: '2026-10-22' }).success).toBe(false);
  });

  it('SIM-55: id repetido é recusado com a mensagem no campo aptos', () => {
    const aptos = [
      { id: ID_A, so1oTempo: false },
      { id: ID_A, so1oTempo: true },
    ];
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos }))).toEqual({ aptos: [MENSAGEM_APTOS_REPETIDO] });
  });

  it('SIM-80: id que não é UUID é recusado no campo aptos sem revelar nada', () => {
    const aptos = [{ id: 'j-toninho', so1oTempo: false }];
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos }))).toEqual({ aptos: [MENSAGEM_APTOS_INATIVOS] });
  });

  it('SIM-09: dois aptos distintos passam', () => {
    const aptos = [
      { id: ID_A, so1oTempo: false },
      { id: ID_B, so1oTempo: true },
    ];
    expect(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos }).success).toBe(true);
  });
});

describe('previaResposta', () => {
  it('SIM-10 a SIM-13: aceita as quatro formas', () => {
    for (const previa of [
      { formato: 'dois_times', valida: true, descricao: '2 times de 7 · 5 reservas', times: 2, reservas: 5 },
      { formato: 'dois_times', valida: false, motivo: 'aptos_insuficientes', descricao: 'Faltam aptos para 2 times.', maiorNPossivel: null },
      { formato: 'varios_times', valida: true, descricao: '4 times de 4 + 1 time incompleto de 2', times: 5, timesCompletos: 4, tamanhoIncompleto: 2 },
      {
        formato: 'varios_times',
        valida: false,
        motivo: 'aptos_insuficientes',
        descricao: 'Com 8 aptos e N = 4 não há 3 times. Use N menor ou o formato 2 times.',
        nSugerido: 3,
        doisTimesPossivel: true,
      },
    ]) {
      expect(previaResposta.safeParse(previa).success).toBe(true);
    }
  });

  it('SIM-09: prévia sem descrição é recusada', () => {
    expect(previaResposta.safeParse({ formato: 'dois_times', valida: true, times: 2, reservas: 5 }).success).toBe(false);
  });
});
