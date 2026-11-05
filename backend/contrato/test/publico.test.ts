import { describe, expect, it } from 'vitest';
import {
  CAMPOS_PROIBIDOS_PUBLICO,
  camposProibidosEm,
  consultaMesPublico,
  eventoPublicoCorpo,
  MAX_COLUNAS_PDF,
  MENSAGEM_MES_PUBLICO,
  pdfPublico,
  rankingPublico,
} from '../src/publico.ts';

/** Contrato público: ranking, PDF e evento (T19; PAR-64, PAR-70, PAR-76, PAR-95, PAR-101, PAR-128). */

const rodada = { situacao: 'presente', pontos: 1 };
const linha = (rodadas: unknown[]) => ({ posicao: 1, apelido: 'Ana', ptsInicial: 5, rodadas, ptsFinal: 6 });

const ranking = () => ({
  grupo: { nome: 'Pelada de Quinta', slug: 'pelada-de-quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' },
  mes: '2026-10',
  hoje: '2026-10-16',
  geradoEm: '2026-10-16T12:00:00-03:00',
  navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
  resumoMes: { partidas: 1, comChuva: 0 },
  partidas: [{ data: '2026-10-15', choveu: false }],
  linhas: [linha([rodada])],
  // planos-e-cobranca T27 (PLA-25, AD-095): campo novo obrigatório do contrato.
  pdfLiberado: true,
});

const colunas = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ data: `2026-10-${String(i + 1).padStart(2, '0')}`, choveu: false, doMesExibido: true }));

const pdf = (n = 1, rodadas = n) => ({
  grupo: { nome: 'Pelada de Quinta', slug: 'pelada-de-quinta' },
  mes: '2026-10',
  geradoEm: '2026-10-16T12:00:00-03:00',
  urlPublica: 'https://pelada.example/g/pelada-de-quinta',
  semPartidasNoMes: false,
  colunas: colunas(n),
  linhas: [linha(Array.from({ length: rodadas }, () => rodada))],
});

describe('rankingPublico', () => {
  it('PAR-64, PAR-70: a projeção da spec passa como veio', () => {
    expect(rankingPublico.parse(ranking())).toEqual(ranking());
  });

  it('PAR-76: a resposta válida não tem nenhum campo proibido', () => {
    expect(camposProibidosEm(ranking())).toEqual([]);
  });

  it('PLA-25: pdfLiberado é obrigatório e booleano (AD-095)', () => {
    const { pdfLiberado: _fora, ...semCampo } = ranking();
    void _fora;
    expect(rankingPublico.safeParse(semCampo).success).toBe(false);
    expect(rankingPublico.safeParse({ ...ranking(), pdfLiberado: 'sim' }).success).toBe(false);
    expect(rankingPublico.parse({ ...ranking(), pdfLiberado: false }).pdfLiberado).toBe(false);
  });

  it.each([...CAMPOS_PROIBIDOS_PUBLICO])('PAR-76: o campo proibido %s é recusado em todos os níveis', (campo) => {
    const r = ranking();
    expect(rankingPublico.safeParse({ ...r, [campo]: 'x' }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...r, grupo: { ...r.grupo, [campo]: 'x' } }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...r, partidas: [{ ...r.partidas[0], [campo]: 'x' }] }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...r, linhas: [{ ...r.linhas[0], [campo]: 'x' }] }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...r, linhas: [linha([{ ...rodada, [campo]: 'x' }])] }).success).toBe(false);
  });

  it('PAR-76: camposProibidosEm acha o campo no caminho, em objeto e lista', () => {
    const r = ranking();
    const com = { ...r, linhas: [{ ...r.linhas[0], jogadorId: 'j1', rodadas: [{ ...rodada, nota: 7 }] }] };
    expect(camposProibidosEm(com)).toEqual(['linhas.0.jogadorId', 'linhas.0.rodadas.0.nota']);
  });

  it('PAR-76: posicao (colocação) é permitida; a posição em campo não tem nome aceito', () => {
    expect(CAMPOS_PROIBIDOS_PUBLICO).not.toContain('posicao');
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [{ ...linha([rodada]), posicao: 'goleiro' }] }).success).toBe(false);
  });

  it('PAR-70: linha com rodadas diferentes das partidas do mês é recusada', () => {
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [linha([rodada, rodada])] }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [linha([])] }).success).toBe(false);
  });

  it('PAR-73: rodada "fora" tem pontos nulos e a outra, número', () => {
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [linha([{ situacao: 'fora', pontos: null }])] }).success).toBe(true);
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [linha([{ situacao: 'fora', pontos: 0 }])] }).success).toBe(false);
    expect(rankingPublico.safeParse({ ...ranking(), linhas: [linha([{ situacao: 'falta', pontos: null }])] }).success).toBe(false);
  });
});

describe('pdfPublico', () => {
  it('PAR-95: a projeção da spec passa e não tem campo proibido', () => {
    expect(pdfPublico.parse(pdf())).toEqual(pdf());
    expect(camposProibidosEm(pdf())).toEqual([]);
  });

  it('PAR-101: 12 colunas passam e 13 são recusadas', () => {
    expect(pdfPublico.safeParse(pdf(MAX_COLUNAS_PDF)).success).toBe(true);
    expect(pdfPublico.safeParse(pdf(MAX_COLUNAS_PDF + 1)).success).toBe(false);
  });

  it('PAR-101: linha com rodadas diferentes das colunas é recusada', () => {
    expect(pdfPublico.safeParse(pdf(3, 2)).success).toBe(false);
    expect(pdfPublico.safeParse(pdf(3, 4)).success).toBe(false);
  });

  it('PAR-97: sem coluna e sem rodada é aceito', () => {
    expect(pdfPublico.safeParse({ ...pdf(0), semPartidasNoMes: true }).success).toBe(true);
  });

  it.each([...CAMPOS_PROIBIDOS_PUBLICO])('PAR-76: o campo proibido %s é recusado no PDF', (campo) => {
    const p = pdf();
    expect(pdfPublico.safeParse({ ...p, [campo]: 'x' }).success).toBe(false);
    expect(pdfPublico.safeParse({ ...p, colunas: [{ ...p.colunas[0], [campo]: 'x' }] }).success).toBe(false);
    expect(pdfPublico.safeParse({ ...p, linhas: [{ ...p.linhas[0], [campo]: 'x' }] }).success).toBe(false);
  });
});

describe('eventoPublicoCorpo', () => {
  const DISPOSITIVO = '3f2b8c1e-5a7d-4e9f-8b1a-2c4d6e8f0a1b';

  it('PAR-124, PAR-125: abertura com dispositivo e PDF com mês passam', () => {
    expect(eventoPublicoCorpo.parse({ tipo: 'ranking_aberto', dispositivoId: DISPOSITIVO })).toEqual({
      tipo: 'ranking_aberto',
      dispositivoId: DISPOSITIVO,
    });
    expect(eventoPublicoCorpo.parse({ tipo: 'pdf_exportado', mes: '2026-10' })).toEqual({ tipo: 'pdf_exportado', mes: '2026-10' });
  });

  it('PAR-128: ranking_aberto com mes é recusado', () => {
    expect(eventoPublicoCorpo.safeParse({ tipo: 'ranking_aberto', dispositivoId: DISPOSITIVO, mes: '2026-10' }).success).toBe(false);
  });

  it('PAR-128: pdf_exportado com dispositivoId é recusado', () => {
    expect(eventoPublicoCorpo.safeParse({ tipo: 'pdf_exportado', mes: '2026-10', dispositivoId: DISPOSITIVO }).success).toBe(false);
  });

  it.each(['partida_lancada', 'escalacao_confirmada', 'outro', '', undefined])('PAR-128: tipo %j é recusado', (tipo) => {
    expect(eventoPublicoCorpo.safeParse({ tipo, dispositivoId: DISPOSITIVO }).success).toBe(false);
  });

  it('PAR-128: campo extra ou que falta é recusado', () => {
    expect(eventoPublicoCorpo.safeParse({ tipo: 'ranking_aberto', dispositivoId: DISPOSITIVO, ip: '1.2.3.4' }).success).toBe(false);
    expect(eventoPublicoCorpo.safeParse({ tipo: 'ranking_aberto' }).success).toBe(false);
    expect(eventoPublicoCorpo.safeParse({ tipo: 'pdf_exportado' }).success).toBe(false);
  });

  it.each(['abc', '', '3f2b8c1e-5a7d-1e9f-8b1a-2c4d6e8f0a1b'])('PAR-123: dispositivoId %j que não é UUID v4 é recusado', (dispositivoId) => {
    expect(eventoPublicoCorpo.safeParse({ tipo: 'ranking_aberto', dispositivoId }).success).toBe(false);
  });

  it.each(['2026-13', '2026-00', '2026-1', ''])('PAR-125: mes %j fora de AAAA-MM é recusado', (mes) => {
    expect(eventoPublicoCorpo.safeParse({ tipo: 'pdf_exportado', mes }).success).toBe(false);
  });
});

describe('consultaMesPublico', () => {
  it('PAR-65: sem mes passa; mes malformado dá "Mês inválido."', () => {
    expect(consultaMesPublico.parse({})).toEqual({});
    const r = consultaMesPublico.safeParse({ mes: '2026-13' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => [i.path.join('.'), i.message])).toEqual([['mes', MENSAGEM_MES_PUBLICO]]);
    expect(MENSAGEM_MES_PUBLICO).toBe('Mês inválido.');
  });
});
