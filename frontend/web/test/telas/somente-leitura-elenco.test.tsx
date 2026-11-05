import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TITULO_SOMENTE_LEITURA } from '../../src/componentes/FaixaSomenteLeitura.tsx';
import { abrirTela, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Somente leitura nas telas do elenco e do grupo (planos-e-cobranca T48; PLA-22): com `somenteLeitura` no plano, a
 * faixa no topo e os botões de escrita desabilitados em Dados do grupo, Jogadores, Novo jogador, Ficha (menos
 * "Inativar") e Habilidades. Sem `somenteLeitura`, os mesmos botões ficam habilitados (o controle que mostra que o
 * desabilitado vem do plano). Rotas reais do app (T47 e anteriores).
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

const QUINTA = {
  id: 'g-quinta',
  nome: 'Pelada de Quinta',
  slug: 'pelada-de-quinta',
  linkPublico: 'https://exemplo.test/g/pelada-de-quinta',
  diaSemana: 'quinta',
  frequencia: 'semanal',
  horario: '20:00',
  jogadoresAtivos: 21,
  habilidades: 1,
  admins: 1,
  souCriador: true,
  dataSugeridaPartida: '2026-10-22',
  partidaNaDataSugerida: false,
  partidasNoMes: 3,
  pesosVigentesDesde: '2026-09-01',
  pesosPadrao: false,
  aparelhosNaSemana: 12,
  proximoDiaDeJogo: '2026-10-22',
  escalacaoNoProximoDia: false,
};

const TONINHO = {
  id: 'j-toninho',
  apelido: 'Toninho',
  posicao: 'atacante',
  situacao: 'ativo',
  desde: '2026-02-05',
  nivel: 550,
  semNota: true,
  anoNascimento: 1978,
  telefone: '11987654321',
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-02-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
  notas: [{ habilidadeId: 'h1', habilidade: 'Passe', nota: null }],
};

const LISTA = {
  jogadores: [
    {
      id: 'j-toninho',
      apelido: 'Toninho',
      posicao: 'atacante',
      situacao: 'ativo',
      desde: '2026-02-05',
      nivel: 550,
      semNota: false,
    },
  ],
};

function abrir(caminho: string, plano: unknown, extra: Record<string, Manipulador> = {}) {
  return abrirTela(caminho, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => json(200, QUINTA),
    'GET /api/grupos/g-quinta/plano': () => json(200, plano),
    'GET /api/grupos/g-quinta/jogadores': () => json(200, LISTA),
    'GET /api/grupos/g-quinta/jogadores/j-toninho': () => json(200, TONINHO),
    'GET /api/grupos/g-quinta/habilidades': () =>
      json(200, { habilidades: [{ id: 'h1', nome: 'Passe' }] }),
    ...extra,
  });
}

/**
 * Botão com `disabled` calculado pela regra do HTML: o próprio atributo ou um `fieldset[disabled]` acima (o
 * `TrechoSomenteLeitura`). A propriedade `disabled` do DOM só reflete o atributo do próprio botão.
 */
function botao(nome: string | RegExp): { disabled: boolean } {
  const el = screen.getByRole('button', { name: nome }) as HTMLButtonElement;
  return { disabled: el.disabled || el.closest('fieldset[disabled]') !== null };
}

async function esperarFaixa() {
  expect(await screen.findByText(TITULO_SOMENTE_LEITURA)).toBeDefined();
}

describe('somente leitura no elenco e no grupo (T48)', () => {
  it('PLA-22: Jogadores mostra a faixa e "Novo jogador" desabilitado; a lista continua', async () => {
    abrir('/app/grupos/g-quinta/jogadores', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    expect(botao('Novo jogador').disabled).toBe(true);
    expect(screen.queryByRole('link', { name: 'Novo jogador' })).toBeNull();
    expect(screen.getByRole('link', { name: /Toninho/ })).toBeDefined();
  });

  it('PLA-22: sem somente leitura, "Novo jogador" é link e não há faixa', async () => {
    abrir('/app/grupos/g-quinta/jogadores', PLANO_EDITAVEL);
    expect(await screen.findByRole('link', { name: 'Novo jogador' })).toBeDefined();
    // O plano já chegou (a faixa sairia junto com ele): espera a lista e confere a ausência.
    await screen.findByRole('link', { name: /Toninho/ });
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });

  it('PLA-22: Novo jogador mostra a faixa e "Salvar" desabilitado', async () => {
    abrir('/app/grupos/g-quinta/jogadores/novo', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await waitFor(() => expect(botao('Salvar').disabled).toBe(true));
  });

  it('PLA-22: Dados do grupo mostra a faixa e "Salvar" desabilitado; "Arquivar grupo" segue habilitado', async () => {
    abrir('/app/grupos/g-quinta/dados', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await waitFor(() => expect(botao('Salvar').disabled).toBe(true));
    expect(botao('Arquivar grupo').disabled).toBe(false);
  });

  it('PLA-22: Ficha mostra a faixa, "Salvar" e "Excluir jogador" desabilitados e "Inativar" habilitado', async () => {
    abrir('/app/grupos/g-quinta/jogadores/j-toninho', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await waitFor(() => expect(botao('Salvar').disabled).toBe(true));
    expect(botao('Excluir jogador').disabled).toBe(true);
    expect(botao('Inativar').disabled).toBe(false);
  });

  it('PLA-22: Ficha sem somente leitura tem "Salvar" e "Excluir jogador" habilitados', async () => {
    abrir('/app/grupos/g-quinta/jogadores/j-toninho', PLANO_EDITAVEL);
    await screen.findByRole('heading', { level: 1, name: 'Toninho' });
    await waitFor(() => expect(botao('Salvar').disabled).toBe(false));
    expect(botao('Excluir jogador').disabled).toBe(false);
    expect(screen.queryByText(TITULO_SOMENTE_LEITURA)).toBeNull();
  });

  it('PLA-22: Ficha de jogador inativo em somente leitura tem "Reativar" desabilitado', async () => {
    abrir('/app/grupos/g-quinta/jogadores/j-toninho', PLANO_SOMENTE_LEITURA, {
      'GET /api/grupos/g-quinta/jogadores/j-toninho': () =>
        json(200, {
          ...TONINHO,
          situacao: 'inativo',
          desde: '2026-09-01',
          periodos: [{ id: 'p1', inicio: '2026-02-05', fim: '2026-09-01' }],
        }),
    });
    await esperarFaixa();
    await waitFor(() => expect(botao('Reativar').disabled).toBe(true));
  });

  it('PLA-22: Habilidades mostra a faixa e "Adicionar" e "Excluir" desabilitados', async () => {
    abrir('/app/grupos/g-quinta/habilidades', PLANO_SOMENTE_LEITURA);
    await esperarFaixa();
    await waitFor(() => expect(botao('Adicionar').disabled).toBe(true));
    expect(botao(/Excluir/).disabled).toBe(true);
  });
});
