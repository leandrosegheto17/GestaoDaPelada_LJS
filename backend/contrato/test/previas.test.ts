import { describe, expect, it } from 'vitest';
import { grupoDetalhe } from '../src/grupo.ts';
import { grupoDetalheComPartidas, previaInicioResposta, previaResposta, usoResposta } from '../src/previas.ts';

/** Contrato das prévias, do uso e do início do grupo (T20; PAR-109, PAR-111, PAR-132, PAR-155). */

const previa = {
  acumuladoAntes: 2,
  acumuladoDepois: 0,
  posicaoAntes: null,
  posicaoDepois: 6,
  rodadasQuePassamAConstar: [{ data: '2026-10-08', situacao: 'falta' }],
  rodadasQueDeixamDeConstar: [{ data: '2026-10-01' }],
  aviso: 'Ela vale 0 ponto até você lançar a presença em Editar partida.',
};

describe('previaResposta', () => {
  it('PAR-109: aceita posicaoDepois nula e posicaoAntes nula', () => {
    expect(previaResposta.parse({ ...previa, posicaoAntes: 3, posicaoDepois: null })).toMatchObject({ posicaoDepois: null });
    expect(previaResposta.parse(previa)).toEqual(previa);
  });

  it('PAR-109: recusa campo extra, no topo e nas rodadas', () => {
    expect(previaResposta.safeParse({ ...previa, jogadorId: 'x' }).success).toBe(false);
    expect(
      previaResposta.safeParse({ ...previa, rodadasQuePassamAConstar: [{ data: '2026-10-08', situacao: 'falta', pontos: 0 }] })
        .success,
    ).toBe(false);
  });

  it('PAR-116: aviso é texto ou nulo, e é obrigatório', () => {
    expect(previaResposta.safeParse({ ...previa, aviso: null }).success).toBe(true);
    const { aviso: _aviso, ...semAviso } = previa;
    expect(previaResposta.safeParse(semAviso).success).toBe(false);
  });

  it('PAR-114: situação "fora" não pode constar; a data é AAAA-MM-DD', () => {
    expect(previaResposta.safeParse({ ...previa, rodadasQuePassamAConstar: [{ data: '2026-10-08', situacao: 'fora' }] }).success).toBe(false);
    expect(previaResposta.safeParse({ ...previa, rodadasQueDeixamDeConstar: [{ data: '08/10' }] }).success).toBe(false);
  });
});

describe('previaInicioResposta', () => {
  const inicio = { acumuladoAntes: 0, acumuladoDepois: 11, posicaoAntes: 6, posicaoDepois: 1, rodadasQuePassamAConstar: 6 };

  it('PAR-111: aceita o número de rodadas que passam a constar', () => {
    expect(previaInicioResposta.parse(inicio)).toEqual(inicio);
  });

  it('PAR-111: a lista de rodadas e campo extra são recusados', () => {
    expect(previaInicioResposta.safeParse({ ...inicio, rodadasQuePassamAConstar: [] }).success).toBe(false);
    expect(previaInicioResposta.safeParse({ ...inicio, aviso: null }).success).toBe(false);
  });
});

describe('usoResposta', () => {
  const semana = {
    inicio: '2026-10-12',
    fim: '2026-10-18',
    aparelhosRanking: 2,
    pdfsExportados: 1,
    partidasLancadas: 2,
    partidasEm48h: 1,
    escalacoesConfirmadas: 0,
  };

  it('PAR-155: aceita semanas com os cinco contadores', () => {
    expect(usoResposta.parse({ semanas: [semana] })).toEqual({ semanas: [semana] });
    expect(usoResposta.parse({ semanas: [] })).toEqual({ semanas: [] });
  });

  it('PAR-155: contador negativo, que falta ou campo extra é recusado', () => {
    expect(usoResposta.safeParse({ semanas: [{ ...semana, partidasEm48h: -1 }] }).success).toBe(false);
    const { escalacoesConfirmadas: _e, ...falta } = semana;
    expect(usoResposta.safeParse({ semanas: [falta] }).success).toBe(false);
    expect(usoResposta.safeParse({ semanas: [{ ...semana, ip: '1.2.3.4' }] }).success).toBe(false);
  });
});

describe('grupoDetalheComPartidas', () => {
  const base = {
    id: 'g1',
    nome: 'Pelada de Quinta',
    slug: 'pelada-de-quinta',
    linkPublico: 'https://pelada.example/g/pelada-de-quinta',
    diaSemana: 'quinta',
    frequencia: 'semanal',
    horario: '20:00',
    jogadoresAtivos: 15,
    habilidades: 4,
    admins: 2,
    souCriador: true,
  };
  const novos = {
    dataSugeridaPartida: '2026-10-15',
    partidaNaDataSugerida: false,
    partidasNoMes: 2,
    pesosVigentesDesde: '2026-02-05',
    pesosPadrao: true,
    aparelhosNaSemana: 3,
  };

  it('PAR-132: aceita a resposta com os 6 campos novos', () => {
    expect(grupoDetalheComPartidas.parse({ ...base, ...novos })).toEqual({ ...base, ...novos });
  });

  it.each(Object.keys(novos))('PAR-132: exige o campo %s', (campo) => {
    const completo: Record<string, unknown> = { ...base, ...novos };
    delete completo[campo];
    expect(grupoDetalheComPartidas.safeParse(completo).success).toBe(false);
  });

  it('PAR-132: os 6 campos novos não entram no grupoDetalhe da grupos-e-elenco (PATCH continua igual)', () => {
    expect(grupoDetalhe.safeParse({ ...base, ...novos }).success).toBe(false);
    expect(grupoDetalhe.safeParse(base).success).toBe(true);
  });

  it('PAR-132: tipos errados são recusados', () => {
    expect(grupoDetalheComPartidas.safeParse({ ...base, ...novos, pesosPadrao: 'sim' }).success).toBe(false);
    expect(grupoDetalheComPartidas.safeParse({ ...base, ...novos, aparelhosNaSemana: -1 }).success).toBe(false);
  });
});
