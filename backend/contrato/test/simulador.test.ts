import { describe, expect, it } from 'vitest';
import {
  avaliarCorpo,
  avaliarResposta,
  consultaContexto,
  contextoResposta,
  MENSAGEM_APTOS_INATIVOS,
  MENSAGEM_APTOS_REPETIDO,
  MENSAGEM_K,
  MENSAGEM_N,
  previaCorpo,
  previaResposta,
  sugerirCorpo,
  sugerirResposta,
} from '../src/simulador.ts';

/** Contrato do simulador (T21, T22; SIM-01, SIM-04, SIM-09, SIM-33, SIM-47, SIM-53, SIM-55, SIM-62, SIM-82). */

function mensagens(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
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

  it.each(['2026-02-30', '2026-1-1', '22/10/2026', ''])(
    'SIM-04: %j é recusada no campo data',
    (data) => {
      expect(mensagens(consultaContexto.safeParse({ data }))).toEqual({
        data: ['Informe uma data válida.'],
      });
    },
  );

  it('SIM-04: campo desconhecido é recusado', () => {
    expect(consultaContexto.safeParse({ data: '2026-10-22', formato: 'dois_times' }).success).toBe(
      false,
    );
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

  it.each(['telefone', 'anoNascimento', 'posicao', 'notas', 'pontos'])(
    'SIM-03: jogador com %s é recusado',
    (campo) => {
      const comExtra = { ...resposta, jogadores: [{ ...resposta.jogadores[0], [campo]: 1 }] };
      expect(contextoResposta.safeParse(comExtra).success).toBe(false);
    },
  );

  it('SIM-01: nível decimal (6.8) é recusado: o contrato é inteiro × 100', () => {
    expect(
      contextoResposta.safeParse({
        ...resposta,
        jogadores: [{ ...resposta.jogadores[0], nivel: 6.8 }],
      }).success,
    ).toBe(false);
  });
});

describe('previaCorpo', () => {
  it('SIM-09: 2 times e 3 ou mais válidos são aceitos', () => {
    expect(previaCorpo.safeParse(PREVIA_DOIS).success).toBe(true);
    expect(
      previaCorpo.safeParse({ formato: 'varios_times', n: 4, aptos: [{ id: ID_A }] }).success,
    ).toBe(true);
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
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos }))).toEqual({
      aptos: [MENSAGEM_APTOS_REPETIDO],
    });
  });

  it('SIM-80: id que não é UUID é recusado no campo aptos sem revelar nada', () => {
    const aptos = [{ id: 'j-toninho', so1oTempo: false }];
    expect(mensagens(previaCorpo.safeParse({ ...PREVIA_DOIS, aptos }))).toEqual({
      aptos: [MENSAGEM_APTOS_INATIVOS],
    });
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
      {
        formato: 'dois_times',
        valida: true,
        descricao: '2 times de 7 · 5 reservas',
        times: 2,
        reservas: 5,
      },
      {
        formato: 'dois_times',
        valida: false,
        motivo: 'aptos_insuficientes',
        descricao: 'Faltam aptos para 2 times.',
        maiorNPossivel: null,
      },
      {
        formato: 'varios_times',
        valida: true,
        descricao: '4 times de 4 + 1 time incompleto de 2',
        times: 5,
        timesCompletos: 4,
        tamanhoIncompleto: 2,
      },
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
    expect(
      previaResposta.safeParse({ formato: 'dois_times', valida: true, times: 2, reservas: 5 })
        .success,
    ).toBe(false);
  });
});

/** UUIDs v4 distintos para os aptos: `u(1)` … `u(70)`. */
function u(i: number): string {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

const SUGERIR_DOIS = {
  formato: 'dois_times',
  data: '2026-10-22',
  n: 2,
  k: 1,
  aptos: [1, 2, 3, 4, 5].map((i) => ({ id: u(i), so1oTempo: false })),
};
const SUGERIR_VARIOS = {
  formato: 'varios_times',
  data: '2026-10-22',
  n: 2,
  aptos: [1, 2, 3, 4, 5].map((i) => ({ id: u(i) })),
};

const COMPOSICAO_DOIS = {
  times: [
    {
      titulares: [
        { id: u(1), so1oTempo: false },
        { id: u(4), so1oTempo: false },
      ],
      entramNo2oTempo: [{ id: u(5), so1oTempo: false }],
    },
    {
      titulares: [
        { id: u(2), so1oTempo: false },
        { id: u(3), so1oTempo: false },
      ],
      entramNo2oTempo: [],
    },
  ],
  naoEntra: [],
};

describe('sugerirCorpo', () => {
  it('SIM-47: 2 times e 3 ou mais válidos são aceitos', () => {
    expect(sugerirCorpo.safeParse(SUGERIR_DOIS).success).toBe(true);
    expect(sugerirCorpo.safeParse(SUGERIR_VARIOS).success).toBe(true);
  });

  it('SIM-55: data ausente ou inválida é recusada no campo data', () => {
    const { data: _data, ...semData } = SUGERIR_DOIS;
    expect(Object.keys(mensagens(sugerirCorpo.safeParse(semData)))).toEqual(['data']);
    expect(mensagens(sugerirCorpo.safeParse({ ...SUGERIR_DOIS, data: '2026-02-30' }))).toEqual({
      data: ['Informe uma data válida.'],
    });
  });

  it('SIM-33: 3 ou mais com k é recusado', () => {
    expect(sugerirCorpo.safeParse({ ...SUGERIR_VARIOS, k: 2 }).success).toBe(false);
  });

  it('SIM-33: 3 ou mais com so1oTempo num apto é recusado', () => {
    const aptos = [{ id: u(1), so1oTempo: false }, ...SUGERIR_VARIOS.aptos.slice(1)];
    expect(sugerirCorpo.safeParse({ ...SUGERIR_VARIOS, aptos }).success).toBe(false);
  });

  it('SIM-33: 2 times sem k é recusado no campo k', () => {
    const { k: _k, ...semK } = SUGERIR_DOIS;
    expect(Object.keys(mensagens(sugerirCorpo.safeParse(semK)))).toEqual(['k']);
  });

  it('SIM-53: 61 aptos são recusados com "Há jogador repetido nos aptos." no campo aptos', () => {
    const aptos = Array.from({ length: 61 }, (_, i) => ({ id: u(i + 1), so1oTempo: false }));
    expect(mensagens(sugerirCorpo.safeParse({ ...SUGERIR_DOIS, aptos }))).toEqual({
      aptos: [MENSAGEM_APTOS_REPETIDO],
    });
  });

  it('SIM-53: 60 aptos são aceitos', () => {
    const aptos = Array.from({ length: 60 }, (_, i) => ({ id: u(i + 1), so1oTempo: false }));
    expect(sugerirCorpo.safeParse({ ...SUGERIR_DOIS, aptos }).success).toBe(true);
  });

  it('SIM-53: id repetido é recusado com "Há jogador repetido nos aptos." no campo aptos', () => {
    const aptos = [...SUGERIR_VARIOS.aptos, { id: u(1) }];
    expect(mensagens(sugerirCorpo.safeParse({ ...SUGERIR_VARIOS, aptos }))).toEqual({
      aptos: [MENSAGEM_APTOS_REPETIDO],
    });
  });
});

describe('avaliarCorpo', () => {
  it('SIM-62: a entrada mais a composição é aceita', () => {
    expect(avaliarCorpo.safeParse({ ...SUGERIR_DOIS, composicao: COMPOSICAO_DOIS }).success).toBe(
      true,
    );
    const composicao = {
      times: [{ jogadores: [u(1), u(2)] }, { jogadores: [u(3), u(4)] }, { jogadores: [u(5)] }],
    };
    expect(avaliarCorpo.safeParse({ ...SUGERIR_VARIOS, composicao }).success).toBe(true);
  });

  it('SIM-63: jogador repetido na composição é recusado no campo composicao', () => {
    const composicao = { ...COMPOSICAO_DOIS, naoEntra: [u(1)] };
    expect(mensagens(avaliarCorpo.safeParse({ ...SUGERIR_DOIS, composicao }))).toEqual({
      composicao: ['Há jogador repetido na composição.'],
    });
  });

  it('SIM-63: jogador fora dos aptos na composição é recusado no campo composicao', () => {
    const composicao = { ...COMPOSICAO_DOIS, naoEntra: [u(9)] };
    expect(mensagens(avaliarCorpo.safeParse({ ...SUGERIR_DOIS, composicao }))).toEqual({
      composicao: ['Há jogador fora dos aptos na composição.'],
    });
  });

  it('SIM-63 (AD-123): composição sem algum dos aptos é recusada no campo composicao', () => {
    const composicao = {
      ...COMPOSICAO_DOIS,
      times: [{ ...COMPOSICAO_DOIS.times[0], entramNo2oTempo: [] }, COMPOSICAO_DOIS.times[1]],
    };
    expect(mensagens(avaliarCorpo.safeParse({ ...SUGERIR_DOIS, composicao }))).toEqual({
      composicao: ['A composição precisa incluir todos os aptos.'],
    });
  });

  it('SIM-82: jogador da composição com apelido ou nível é recusado', () => {
    const titulares = [
      { id: u(1), so1oTempo: false, apelido: 'Toninho' },
      COMPOSICAO_DOIS.times[0]!.titulares[1],
    ];
    const composicao = {
      ...COMPOSICAO_DOIS,
      times: [{ ...COMPOSICAO_DOIS.times[0], titulares }, COMPOSICAO_DOIS.times[1]],
    };
    expect(avaliarCorpo.safeParse({ ...SUGERIR_DOIS, composicao }).success).toBe(false);
  });
});

const JOGADOR = { id: 'j1', apelido: 'Toninho', nivel: 683, semNota: false, semAno: false };
const INDICADORES_DOIS = {
  jogadores1oTempo: 2,
  jogadores2oTempo: 2,
  nivelSoma1oTempo: 1366,
  nivelMedio1oTempo: 683,
  nivelSoma2oTempo: 1366,
  nivelMedio2oTempo: 683,
  idadeMedia: null,
  substituicoes: 0,
};
const TIME_DOIS = {
  nome: 'Time A',
  titulares: [{ ...JOGADOR, so1oTempo: false, saiNoIntervalo: false }],
  entramNo2oTempo: [],
  trocas: [],
  saiSemPar: [],
  entraSemPar: [],
  indicadores: INDICADORES_DOIS,
};
const RESULTADO_DOIS = {
  formato: 'dois_times',
  data: '2026-10-22',
  n: 7,
  k: 'ilimitado',
  descricao: '2 times de 7',
  avisos: [{ tipo: 'sem_nota', texto: 'Juca não tem nota: usamos nível 5,5.' }],
  ordemPrioridade: ['j1'],
  times: [TIME_DOIS, { ...TIME_DOIS, nome: 'Time B' }],
  naoEntra: [{ ...JOGADOR, id: 'j9', so1oTempo: true }],
};
const RESULTADO_VARIOS = {
  formato: 'varios_times',
  data: '2026-10-22',
  n: 4,
  descricao: '5 times de 4',
  avisos: [],
  times: [
    {
      nome: 'Time 1',
      incompleto: false,
      jogadores: [JOGADOR],
      indicadores: { jogadores: 1, nivelSoma: 683, nivelMedio: 683, idadeMedia: 3600 },
    },
  ],
};

describe('respostas do simulador', () => {
  it('SIM-47: as respostas de 2 times e de 3 ou mais são aceitas', () => {
    expect(sugerirResposta.safeParse(RESULTADO_DOIS).success).toBe(true);
    expect(sugerirResposta.safeParse(RESULTADO_VARIOS).success).toBe(true);
  });

  it.each(['telefone', 'anoNascimento', 'idade', 'posicao', 'notas', 'pontos'])(
    'SIM-82: titular, reserva, "não entra" ou jogador de 3+ com %s é recusado',
    (campo) => {
      const titular = { ...RESULTADO_DOIS.times[0]!.titulares[0], [campo]: 1 };
      const dois = {
        ...RESULTADO_DOIS,
        times: [{ ...TIME_DOIS, titulares: [titular] }, RESULTADO_DOIS.times[1]],
      };
      expect(sugerirResposta.safeParse(dois).success).toBe(false);
      const reserva = { ...JOGADOR, so1oTempo: false, [campo]: 1 };
      const comReserva = {
        ...RESULTADO_DOIS,
        times: [{ ...TIME_DOIS, entramNo2oTempo: [reserva] }, RESULTADO_DOIS.times[1]],
      };
      expect(sugerirResposta.safeParse(comReserva).success).toBe(false);
      const naoEntra = {
        ...RESULTADO_DOIS,
        naoEntra: [{ ...RESULTADO_DOIS.naoEntra[0], [campo]: 1 }],
      };
      expect(sugerirResposta.safeParse(naoEntra).success).toBe(false);
      const varios = {
        ...RESULTADO_VARIOS,
        times: [{ ...RESULTADO_VARIOS.times[0], jogadores: [{ ...JOGADOR, [campo]: 1 }] }],
      };
      expect(sugerirResposta.safeParse(varios).success).toBe(false);
    },
  );

  it('SIM-82: nível decimal na resposta é recusado', () => {
    const titular = { ...RESULTADO_DOIS.times[0]!.titulares[0], nivel: 6.83 };
    const dois = {
      ...RESULTADO_DOIS,
      times: [{ ...TIME_DOIS, titulares: [titular] }, RESULTADO_DOIS.times[1]],
    };
    expect(sugerirResposta.safeParse(dois).success).toBe(false);
  });

  it('SIM-62: a resposta de avaliar não tem ordem de prioridade', () => {
    const { ordemPrioridade: _ordem, ...semOrdem } = RESULTADO_DOIS;
    expect(avaliarResposta.safeParse(semOrdem).success).toBe(true);
    expect(avaliarResposta.safeParse(RESULTADO_DOIS).success).toBe(false);
  });
});
