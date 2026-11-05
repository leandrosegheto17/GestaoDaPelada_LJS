import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TITULO_SOMENTE_LEITURA } from '../../src/componentes/FaixaSomenteLeitura.tsx';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Somente leitura nas telas de partidas e pesos (planos-e-cobranca T49; PLA-22): com `somenteLeitura` no plano, a faixa
 * no topo e a escrita desabilitada em Partidas do mês ("Nova partida", o "Lançar partida" do critério), Lançar e Editar
 * partida (salvar e "Excluir partida") e Pontuação ("Salvar nova configuração", o "Salvar pesos" do critério). Sem
 * `somenteLeitura`, os mesmos controles ficam habilitados. Rotas reais do app.
 */

afterEach(() => {
  cleanup();
});

const PLANO_EDITAVEL = {
  plano: 'free',
  situacao: 'inadimplente',
  trialFimEm: null,
  pagoAte: null,
  jogadoresAtivos: 20,
  limiteJogadores: 20,
  somenteLeitura: null,
  recursos: ['partidas', 'ranking'],
  podeAssinar: true,
  assinatura: null,
};

const PLANO_SOMENTE_LEITURA = {
  ...PLANO_EDITAVEL,
  jogadoresAtivos: 21,
  somenteLeitura: { motivo: 'limite_jogadores' },
};

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';

const MES = {
  mes: '2026-10',
  hoje: '2026-10-22',
  navegacao: { mesAnterior: null, mesSeguinte: null },
  partidas: [
    { data: '2026-10-15', choveu: false, contagem: { presentes: 2, lesionados: 0, expulsos: 0 } },
  ],
};

const NOVA = {
  data: '2026-10-22',
  dataSugerida: '2026-10-22',
  hoje: '2026-10-22',
  choveu: false,
  preMarcadaPelaEscalacao: false,
  jogadores: [
    { id: ALEMAO, apelido: 'Alemão', situacao: 'ausente' },
    { id: BIGODE, apelido: 'Bigode', situacao: 'ausente' },
  ],
};

const PARTIDA = {
  data: '2026-10-15',
  hoje: '2026-10-22',
  choveu: false,
  alteradaPor: 'Leandro',
  alteradaEm: '2026-10-16T01:41:00.000Z',
  jogadores: [
    { id: ALEMAO, apelido: 'Alemão', situacao: 'presente' },
    { id: BIGODE, apelido: 'Bigode', situacao: 'presente' },
  ],
};

const PESOS = {
  presencaSemChuva: 1,
  presencaComChuva: 2,
  lesionadoSemChuva: 1,
  lesionadoComChuva: 1,
  expulsoSemChuva: -1,
  expulsoComChuva: -1,
};

const PAINEL = {
  hoje: '2026-10-22',
  vigente: { ...PESOS, vigenteDesde: '2026-09-01', registradoPor: 'Leandro' },
  historico: [],
};

function abrir(caminho: string, plano: unknown) {
  return abrirTela(caminho, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    'GET /api/grupos/g-quinta/plano': () => json(200, plano),
    'GET /api/grupos/g-quinta/partidas': () => json(200, MES),
    'GET /api/grupos/g-quinta/partidas/nova': () => json(200, NOVA),
    'GET /api/grupos/g-quinta/partidas/2026-10-15': () => json(200, PARTIDA),
    'GET /api/grupos/g-quinta/pesos': () => json(200, PAINEL),
  });
}

/** `disabled` pela regra do HTML: o próprio atributo ou um `fieldset[disabled]` acima (o `TrechoSomenteLeitura`). */
function desabilitado(nome: string | RegExp): boolean {
  const el = screen.getByRole('button', { name: nome }) as HTMLButtonElement;
  return el.disabled || el.closest('fieldset[disabled]') !== null;
}

async function esperarFaixa() {
  expect(await screen.findByText(TITULO_SOMENTE_LEITURA)).toBeDefined();
}

describe('somente leitura nas partidas e nos pesos (T49)', () => {
  it('PLA-22: Partidas do mês mostra a faixa e "Nova partida" desabilitado; a lista continua', async () => {
    abrir('/app/grupos/g-quinta/partidas', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    expect(desabilitado('Nova partida')).toBe(true);
    expect(screen.queryByRole('link', { name: 'Nova partida' })).toBeNull();
    expect(await screen.findByText('Quinta, 15/10/2026')).toBeDefined();
  });

  it('PLA-22: Partidas do mês sem somente leitura tem "Nova partida" como link', async () => {
    abrir('/app/grupos/g-quinta/partidas', PLANO_EDITAVEL);
    expect(await screen.findByRole('link', { name: 'Nova partida' })).toBeDefined();
    await screen.findByText('Quinta, 15/10/2026');
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });

  it('PLA-22: Lançar partida mostra a faixa e salvar e as marcações desabilitados', async () => {
    abrir('/app/grupos/g-quinta/partidas/nova', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await screen.findByText('Alemão');
    await waitFor(() => expect(desabilitado(/^Salvar/)).toBe(true));
    expect(desabilitado('Marcar todos como presentes')).toBe(true);
  });

  it('PLA-22: Lançar partida sem somente leitura tem salvar habilitado', async () => {
    abrir('/app/grupos/g-quinta/partidas/nova', PLANO_EDITAVEL);
    await screen.findByText('Alemão');
    await waitFor(() => expect(desabilitado('Marcar todos como presentes')).toBe(false));
  });

  it('PLA-22: Editar partida mostra a faixa e salvar e "Excluir partida" desabilitados', async () => {
    abrir('/app/grupos/g-quinta/partidas/2026-10-15', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await screen.findByText('Alemão');
    await waitFor(() => expect(desabilitado(/^Salvar/)).toBe(true));
    expect(desabilitado('Excluir partida')).toBe(true);
  });

  it('PLA-22: Pontuação mostra a faixa e "Salvar nova configuração" desabilitado; os pesos vigentes continuam', async () => {
    abrir('/app/grupos/g-quinta/pontuacao', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await screen.findByText('Vigente desde 01/09/2026');
    await waitFor(() => expect(desabilitado('Salvar nova configuração')).toBe(true));
  });

  it('PLA-22: Pontuação sem somente leitura tem "Salvar nova configuração" habilitado', async () => {
    abrir('/app/grupos/g-quinta/pontuacao', PLANO_EDITAVEL);
    await screen.findByText('Vigente desde 01/09/2026');
    await waitFor(() => expect(desabilitado('Salvar nova configuração')).toBe(false));
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });
});
