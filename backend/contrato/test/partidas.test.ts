import { describe, expect, it } from 'vitest';
import {
  consultaData,
  consultaMes,
  MENSAGEM_JOGADOR_INATIVO,
  MENSAGEM_MES,
  MENSAGEM_SITUACAO,
  partidaCorpo,
  partidaNova,
  partidaResposta,
  partidasDoMes,
} from '../src/partidas.ts';

/** Contrato das partidas (T18; PAR-19, PAR-26, PAR-39). */

function mensagens(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = problema.path.map(String).join('.');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

const BETO = '0b6f1f9e-2f7c-4f8a-9a59-4f6c2c7b1d01';
const GIL = '0b6f1f9e-2f7c-4f8a-9a59-4f6c2c7b1d02';

const corpo = (extra: Record<string, unknown> = {}) => ({
  data: '2026-10-15',
  choveu: false,
  marcacoes: [
    { jogadorId: BETO, situacao: 'presente' },
    { jogadorId: GIL, situacao: 'ausente' },
  ],
  ...extra,
});

describe('partidaCorpo', () => {
  it('PAR-22: corpo válido passa como veio', () => {
    expect(partidaCorpo.parse(corpo())).toEqual(corpo());
  });

  it.each([
    '2026-02-29',
    '2026-13-01',
    '2026-10-32',
    '15/10/2026',
    '2026-10-1',
    '',
    20261015,
    null,
    undefined,
  ])('PAR-19: data %j que não é data real dá "Informe uma data válida."', (data) => {
    expect(mensagens(partidaCorpo.safeParse(corpo({ data })))).toEqual({
      data: ['Informe uma data válida.'],
    });
  });

  it('PAR-19: 2028-02-29 é data real', () => {
    expect(partidaCorpo.safeParse(corpo({ data: '2028-02-29' })).success).toBe(true);
  });

  it.each(['falta', 'fora', 'PRESENTE', '', null, undefined])(
    'PAR-26: situação %j é recusada no campo da marcação',
    (situacao) => {
      const r = partidaCorpo.safeParse(corpo({ marcacoes: [{ jogadorId: BETO, situacao }] }));
      expect(mensagens(r)).toEqual({ 'marcacoes.0.situacao': [MENSAGEM_SITUACAO] });
    },
  );

  it.each(['ausente', 'presente', 'lesionado', 'expulso'])(
    'PAR-26: situação %s é aceita',
    (situacao) => {
      expect(
        partidaCorpo.safeParse(corpo({ marcacoes: [{ jogadorId: BETO, situacao }] })).success,
      ).toBe(true);
    },
  );

  it('PAR-24: jogadorId que não é UUID dá a mensagem do jogador inativo no campo do índice', () => {
    const r = partidaCorpo.safeParse(
      corpo({ marcacoes: [corpo().marcacoes[0], { jogadorId: 'j-beto', situacao: 'presente' }] }),
    );
    expect(mensagens(r)).toEqual({ 'marcacoes.1.jogadorId': [MENSAGEM_JOGADOR_INATIVO] });
    expect(MENSAGEM_JOGADOR_INATIVO).toBe('Jogador não está ativo nesta data.');
  });

  it('PAR-26: marcação com campo a mais é recusada', () => {
    const r = partidaCorpo.safeParse(
      corpo({ marcacoes: [{ jogadorId: BETO, situacao: 'presente', pontos: 1 }] }),
    );
    expect(r.success).toBe(false);
  });

  it('PAR-22: choveu é obrigatório e booleano; campo a mais no corpo é recusado', () => {
    expect(partidaCorpo.safeParse(corpo({ choveu: 'sim' })).success).toBe(false);
    const semChuva = { data: '2026-10-15', marcacoes: [] };
    expect(partidaCorpo.safeParse(semChuva).success).toBe(false);
    expect(partidaCorpo.safeParse(corpo({ grupoId: BETO })).success).toBe(false);
  });

  it('PAR-23: lista de marcações vazia é aceita (ninguém marcado)', () => {
    expect(partidaCorpo.safeParse(corpo({ marcacoes: [] })).success).toBe(true);
  });
});

describe('consultaData e consultaMes', () => {
  it('PAR-17: sem data é aceita; PAR-19: data irreal dá a mensagem', () => {
    expect(consultaData.parse({})).toEqual({});
    expect(mensagens(consultaData.safeParse({ data: '2026-02-30' }))).toEqual({
      data: ['Informe uma data válida.'],
    });
  });

  it.each(['2026-13', '2026-00', '2026-1', '10-2026', '2026-10-01', ''])(
    'PAR-39: mes %j fora de AAAA-MM dá "Informe o mês como AAAA-MM."',
    (mes) => {
      expect(mensagens(consultaMes.safeParse({ mes }))).toEqual({ mes: [MENSAGEM_MES] });
      expect(MENSAGEM_MES).toBe('Informe o mês como AAAA-MM.');
    },
  );

  it('PAR-38: sem mes é aceita; PAR-37: 2026-10 passa', () => {
    expect(consultaMes.parse({})).toEqual({});
    expect(consultaMes.parse({ mes: '2026-10' })).toEqual({ mes: '2026-10' });
  });

  it('consulta com parâmetro a mais é recusada', () => {
    expect(consultaMes.safeParse({ mes: '2026-10', grupo: 'x' }).success).toBe(false);
  });
});

describe('respostas', () => {
  const jogadores = [{ id: BETO, apelido: 'Beto', situacao: 'ausente' }];

  // Mudança autorizada (`## Autorizações`, 2026-11-04): a T24 da simulador acrescenta `preMarcadaPelaEscalacao`.
  const nova = {
    data: '2026-10-15',
    dataSugerida: '2026-10-15',
    hoje: '2026-10-16',
    choveu: false,
    preMarcadaPelaEscalacao: false,
    jogadores,
  };

  it('PAR-17: partidaNova', () => {
    expect(partidaNova.parse(nova)).toEqual(nova);
  });

  it('SIM-75: partidaNova sem preMarcadaPelaEscalacao é recusada', () => {
    const { preMarcadaPelaEscalacao: _fora, ...sem } = nova;
    expect(partidaNova.safeParse(sem).success).toBe(false);
    expect(partidaNova.safeParse({ ...nova, preMarcadaPelaEscalacao: 'sim' }).success).toBe(false);
    expect(
      partidaNova.parse({ ...nova, preMarcadaPelaEscalacao: true }).preMarcadaPelaEscalacao,
    ).toBe(true);
  });

  it('PAR-44: partidaResposta com alteradaPor e alteradaEm', () => {
    const r = {
      data: '2026-10-15',
      hoje: '2026-10-16',
      choveu: true,
      alteradaPor: 'Lia',
      alteradaEm: '2026-10-15T23:10:00-03:00',
      jogadores,
    };
    expect(partidaResposta.parse(r)).toEqual(r);
    expect(partidaResposta.safeParse({ ...r, telefone: '11999999999' }).success).toBe(false);
  });

  it('PAR-37: partidasDoMes com navegação nula e contagens', () => {
    const r = {
      mes: '2026-10',
      hoje: '2026-10-16',
      navegacao: { mesAnterior: null, mesSeguinte: null },
      partidas: [
        {
          data: '2026-10-15',
          choveu: false,
          contagem: { presentes: 15, lesionados: 0, expulsos: 1 },
        },
      ],
    };
    expect(partidasDoMes.parse(r)).toEqual(r);
  });
});
