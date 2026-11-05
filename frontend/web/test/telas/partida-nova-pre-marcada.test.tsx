import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaNovaPartida, textoPreMarcada } from '../../src/telas/partida/PaginaNovaPartida.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Faixa de pré-marcação no lançamento (simulador T52; SIM-77), de `t11-partida--pre-marcada.html:22`: com
 * `preMarcadaPelaEscalacao`, a faixa aparece abaixo da data e as marcações vindas da escalação continuam editáveis antes
 * de salvar; sem a marca, não aparece. Molde: `partida-nova.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';
const CARECA = '00000000-0000-4000-8000-000000000003';

const TEXTO = 'Pré-marcado pela escalação de 22/10 (inclui quem ficou como “não entra”).';

const rotas = () => [
  { path: '/app/grupos/:grupoId/partidas/nova', element: <PaginaNovaPartida /> },
  { path: '*', element: <p>destino</p> },
];

const NOVA = 'GET /api/grupos/g-quinta/partidas/nova';
const LANCAR = 'POST /api/grupos/g-quinta/partidas';

/** Resposta da escalação de 22/10: Alemão e Bigode presentes (Bigode ficou como "não entra"), Careca ausente. */
function novaPreMarcada(extra: Record<string, unknown> = {}) {
  return {
    data: '2026-10-22',
    dataSugerida: '2026-10-22',
    hoje: '2026-10-22',
    choveu: false,
    preMarcadaPelaEscalacao: true,
    jogadores: [
      { id: ALEMAO, apelido: 'Alemão', situacao: 'presente' },
      { id: BIGODE, apelido: 'Bigode', situacao: 'presente' },
      { id: CARECA, apelido: 'Careca', situacao: 'ausente' },
    ],
    ...extra,
  };
}

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/partidas/nova',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      ...api,
    },
    rotas,
  );
}

function situacaoDe(apelido: string) {
  return screen.getByRole('group', { name: `Situação de ${apelido}` });
}

function radio(apelido: string, nome: 'Ausente' | 'Presente') {
  return within(situacaoDe(apelido)).getByRole('radio', {
    name: new RegExp(nome),
  }) as HTMLInputElement;
}

describe('faixa de pré-marcação (t11 pre-marcada)', () => {
  it('texto da faixa com a data da escalação', () => {
    expect(textoPreMarcada('2026-10-22')).toBe(TEXTO);
    expect(textoPreMarcada('2026-11-05')).toBe(
      'Pré-marcado pela escalação de 05/11 (inclui quem ficou como “não entra”).',
    );
  });

  it('SIM-77: com a marca, a faixa aparece e as situações vêm da escalação; axe sem violação', async () => {
    const { container } = abrir({ [NOVA]: () => json(200, novaPreMarcada()) });
    expect(await screen.findByText(TEXTO)).toBeDefined();
    expect(radio('Alemão', 'Presente').checked).toBe(true);
    expect(radio('Bigode', 'Presente').checked).toBe(true);
    expect(radio('Careca', 'Ausente').checked).toBe(true);
    expect(screen.getByText('Presentes 2 · Lesionados 0 · Expulsos 0 · Ausentes 1')).toBeDefined();
    await esperarSemViolacoes(container);
  });

  it('SIM-77: a faixa fica abaixo da data, antes da contagem (ordem no documento)', async () => {
    abrir({ [NOVA]: () => json(200, novaPreMarcada()) });
    const faixa = await screen.findByText(TEXTO);
    const data = screen.getByLabelText('Data');
    const contagem = screen.getByText('Presentes 2 · Lesionados 0 · Expulsos 0 · Ausentes 1');
    expect(data.compareDocumentPosition(faixa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(faixa.compareDocumentPosition(contagem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('SIM-77: trocar um pré-marcado para ausente funciona e o corpo do envio segue a troca', async () => {
    const t = abrir({ [NOVA]: () => json(200, novaPreMarcada()), [LANCAR]: () => pendente() });
    await screen.findByText(TEXTO);
    fireEvent.click(radio('Bigode', 'Ausente'));
    expect(radio('Bigode', 'Ausente').checked).toBe(true);
    expect(screen.getByText('Presentes 1 · Lesionados 0 · Expulsos 0 · Ausentes 2')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (1 presente)' }));
    await waitFor(() =>
      expect(t.chamadasA('POST', '/api/grupos/g-quinta/partidas')).toHaveLength(1),
    );
    const [chamada] = t.chamadasA('POST', '/api/grupos/g-quinta/partidas');
    expect(chamada?.corpo).toEqual({
      data: '2026-10-22',
      choveu: false,
      marcacoes: [{ jogadorId: ALEMAO, situacao: 'presente' }],
    });
  });

  it('SIM-77: sem a marca, a faixa não aparece', async () => {
    abrir({ [NOVA]: () => json(200, novaPreMarcada({ preMarcadaPelaEscalacao: false })) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    expect(screen.queryByText(/Pré-marcado pela escalação/)).toBeNull();
  });

  it('SIM-77: com a marca mas sem ativos na data, não há faixa (só o vazio)', async () => {
    abrir({ [NOVA]: () => json(200, novaPreMarcada({ jogadores: [] })) });
    expect(await screen.findByText('Ninguém estava ativo nessa data.')).toBeDefined();
    expect(screen.queryByText(/Pré-marcado pela escalação/)).toBeNull();
  });
});
