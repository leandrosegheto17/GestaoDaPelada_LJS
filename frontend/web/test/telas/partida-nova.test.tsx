import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { InicioGrupo } from '../../src/telas/grupo/InicioGrupo.tsx';
import {
  contar,
  marcacoesDoCorpo,
  textoSalvar,
} from '../../src/telas/partida/FormularioPartida.tsx';
import { PaginaNovaPartida } from '../../src/telas/partida/PaginaNovaPartida.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import {
  abrirTela,
  erroApi,
  json,
  pendente,
  SESSAO_ANA,
  type Manipulador,
} from '../apoio/tela.tsx';

/**
 * Lançar partida (partidas-e-ranking T60; PAR-31 a PAR-36, PAR-147), a partir de `B:166-171`, `B:441` e do mockup t11.
 * O servidor falso de `apoio/tela.tsx` corta a query: `GET …/partidas/nova` responde em sequência.
 */

afterEach(() => {
  cleanup();
});

const ALEMAO = '00000000-0000-4000-8000-000000000001';
const BIGODE = '00000000-0000-4000-8000-000000000002';
const CARECA = '00000000-0000-4000-8000-000000000003';

const rotas = () => [
  { path: '/app/grupos/:grupoId/partidas/nova', element: <PaginaNovaPartida /> },
  { path: '/app/grupos/:grupoId', element: <InicioGrupo /> },
  { path: '*', element: <p>destino</p> },
];

const NOVA = 'GET /api/grupos/g-quinta/partidas/nova';
const LANCAR = 'POST /api/grupos/g-quinta/partidas';

function nova(extra: Record<string, unknown> = {}) {
  return {
    data: '2026-10-22',
    dataSugerida: '2026-10-22',
    hoje: '2026-10-22',
    choveu: false,
    preMarcadaPelaEscalacao: false,
    jogadores: [
      { id: ALEMAO, apelido: 'Alemão', situacao: 'ausente' },
      { id: BIGODE, apelido: 'Bigode', situacao: 'ausente' },
      { id: CARECA, apelido: 'Careca', situacao: 'ausente' },
    ],
    ...extra,
  };
}

function salva(data = '2026-10-22') {
  return {
    data,
    hoje: '2026-10-22',
    choveu: false,
    alteradaPor: 'Ana',
    alteradaEm: '2026-10-22T23:00:00.000Z',
    jogadores: [],
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

function emSequencia(...respostas: Array<() => Response | Promise<Response>>): Manipulador {
  let i = 0;
  return () => {
    const r = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    if (!r) throw new Error('sem resposta');
    return r();
  };
}

function situacaoDe(apelido: string) {
  return screen.getByRole('group', { name: `Situação de ${apelido}` });
}

function marcar(apelido: string, nome: 'Ausente' | 'Presente' | 'Lesionado' | 'Expulso') {
  fireEvent.click(within(situacaoDe(apelido)).getByRole('radio', { name: new RegExp(nome) }));
}

describe('regras do formulário', () => {
  it('PAR-31: contagem e texto do botão; só P, L e E vão no corpo', () => {
    expect(contar({ a: 'presente', b: 'lesionado', c: 'ausente', d: 'presente' })).toEqual({
      presentes: 2,
      lesionados: 1,
      expulsos: 0,
      ausentes: 1,
    });
    expect(textoSalvar(1)).toBe('Salvar partida (1 presente)');
    expect(textoSalvar(19)).toBe('Salvar partida (19 presentes)');
    const jogadores = [
      { id: ALEMAO, apelido: 'Alemão', situacao: 'ausente' as const },
      { id: BIGODE, apelido: 'Bigode', situacao: 'ausente' as const },
    ];
    expect(marcacoesDoCorpo(jogadores, { [ALEMAO]: 'presente', [BIGODE]: 'ausente' })).toEqual([
      { jogadorId: ALEMAO, situacao: 'presente' },
    ]);
  });
});

describe('Lançar partida (t11)', () => {
  it('PAR-31: data sugerida, "Choveu?" em Não, contadores, busca, ações, A/P/L/E e o botão de salvar', async () => {
    abrir({ [NOVA]: () => json(200, nova()) });
    const data = (await screen.findByLabelText('Data')) as HTMLInputElement;
    expect(data.value).toBe('2026-10-22');
    expect((screen.getByRole('switch', { name: /Choveu\?/ }) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByText('Presentes 0 · Lesionados 0 · Expulsos 0 · Ausentes 3')).toBeDefined();
    expect(screen.getByRole('searchbox', { name: 'Buscar jogador' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Marcar todos como presentes' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Limpar marcações' })).toBeDefined();
    const opcoes = within(situacaoDe('Alemão'))
      .getAllByRole('radio')
      .map((r) => (r as HTMLInputElement).value);
    expect(opcoes).toEqual(['ausente', 'presente', 'lesionado', 'expulso']);
    expect(screen.getByRole('button', { name: 'Salvar partida (0 presentes)' })).toBeDefined();
  });

  it('PAR-31: "Marcar todos como presentes" atualiza o contador e o botão "Salvar partida (N presentes)"', async () => {
    abrir({ [NOVA]: () => json(200, nova()) });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todos como presentes' }));
    expect(screen.getByText('Presentes 3 · Lesionados 0 · Expulsos 0 · Ausentes 0')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Salvar partida (3 presentes)' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar marcações' }));
    expect(screen.getByText('Presentes 0 · Lesionados 0 · Expulsos 0 · Ausentes 3')).toBeDefined();
  });

  it('PAR-31: marcar L e E muda a contagem; a busca filtra sem acento nem caixa', async () => {
    abrir({ [NOVA]: () => json(200, nova()) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    marcar('Alemão', 'Lesionado');
    marcar('Bigode', 'Expulso');
    marcar('Careca', 'Presente');
    expect(screen.getByText('Presentes 1 · Lesionados 1 · Expulsos 1 · Ausentes 0')).toBeDefined();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar jogador' }), {
      target: { value: 'ALEM' },
    });
    expect(screen.getByRole('group', { name: 'Situação de Alemão' })).toBeDefined();
    expect(screen.queryByRole('group', { name: 'Situação de Bigode' })).toBeNull();
    // Filtrar não muda a contagem.
    expect(screen.getByText('Presentes 1 · Lesionados 1 · Expulsos 1 · Ausentes 0')).toBeDefined();
  });

  it('PAR-32: trocar a data mostra "Carregando os jogadores ativos em dd/mm…" e recarrega a lista', async () => {
    const t = abrir({
      [NOVA]: emSequencia(
        () => json(200, nova()),
        () => pendente(),
      ),
    });
    const data = await screen.findByLabelText('Data');
    fireEvent.change(data, { target: { value: '2026-09-24' } });
    expect(await screen.findAllByText('Carregando os jogadores ativos em 24/09…')).not.toHaveLength(
      0,
    );
    expect(screen.queryByRole('group', { name: 'Situação de Alemão' })).toBeNull();
    expect(t.chamadasA('GET', '/api/grupos/g-quinta/partidas/nova')).toHaveLength(2);
  });

  it('PAR-33: sem ativos, "Ninguém estava ativo nessa data." e o envio desabilitado', async () => {
    abrir({ [NOVA]: () => json(200, nova({ jogadores: [] })) });
    expect(
      await screen.findByRole('heading', { name: 'Ninguém estava ativo nessa data.' }),
    ).toBeDefined();
    expect(
      screen.getByText('Escolha outra data ou confira as datas de entrada dos jogadores.'),
    ).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Salvar partida' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('data no futuro: "A data não pode ser no futuro." no campo, sem consultar', async () => {
    const t = abrir({ [NOVA]: () => json(200, nova()) });
    const data = await screen.findByLabelText('Data');
    fireEvent.change(data, { target: { value: '2026-10-29' } });
    expect(await screen.findByText('A data não pode ser no futuro.')).toBeDefined();
    expect(t.chamadasA('GET', '/api/grupos/g-quinta/partidas/nova')).toHaveLength(1);
  });

  it('PAR-34: 409 mostra "Já existe uma partida em dd/mm/aaaa." e o link "Editar a partida de dd/mm"', async () => {
    abrir({
      [NOVA]: () => json(200, nova({ data: '2026-10-15', dataSugerida: '2026-10-15' })),
      [LANCAR]: () =>
        json(409, {
          erro: 'Já existe uma partida nesta data.',
          codigo: 'partida_ja_existe',
          data: '2026-10-15',
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todos como presentes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (3 presentes)' }));
    expect(await screen.findByText('Já existe uma partida em 15/10/2026.')).toBeDefined();
    const editar = screen.getByRole('link', { name: 'Editar a partida de 15/10' });
    expect(editar.getAttribute('href')).toBe('/app/grupos/g-quinta/partidas/2026-10-15');
    expect((screen.getByLabelText('Data') as HTMLInputElement).getAttribute('aria-invalid')).toBe(
      'true',
    );
  });

  it('PAR-35: falha de rede mostra "Não salvou. Suas marcações continuam aqui." e as marcações ficam', async () => {
    const t = abrir({
      [NOVA]: () => json(200, nova()),
      [LANCAR]: emSequencia(
        () => Promise.reject(new TypeError('Failed to fetch')),
        () => json(201, salva()),
      ),
    });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    marcar('Alemão', 'Presente');
    marcar('Bigode', 'Expulso');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (1 presente)' }));

    expect(await screen.findByText('Não salvou. Suas marcações continuam aqui.')).toBeDefined();
    expect(screen.getByText('Presentes 1 · Lesionados 0 · Expulsos 1 · Ausentes 1')).toBeDefined();
    const presente = within(situacaoDe('Alemão')).getByRole('radio', {
      name: /Presente/,
    }) as HTMLInputElement;
    expect(presente.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(t.local()).toBe('/app/grupos/g-quinta'));
    const envios = t.chamadasA('POST', '/api/grupos/g-quinta/partidas');
    expect(envios).toHaveLength(2);
    expect(envios[1]?.corpo).toEqual(envios[0]?.corpo);
  });

  it('PAR-35: erro do servidor (500) também mantém as marcações', async () => {
    abrir({ [NOVA]: () => json(200, nova()), [LANCAR]: () => erroApi(500, 'erro_interno') });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    marcar('Careca', 'Lesionado');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (0 presentes)' }));
    expect(await screen.findByText('Não salvou. Suas marcações continuam aqui.')).toBeDefined();
    expect(screen.getByText('Presentes 0 · Lesionados 1 · Expulsos 0 · Ausentes 2')).toBeDefined();
  });

  it('PAR-22: o corpo leva a data, a chuva e só as marcações P, L e E', async () => {
    const t = abrir({ [NOVA]: () => json(200, nova()), [LANCAR]: () => json(201, salva()) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    marcar('Alemão', 'Presente');
    marcar('Careca', 'Lesionado');
    fireEvent.click(screen.getByRole('switch', { name: /Choveu\?/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (1 presente)' }));
    await waitFor(() =>
      expect(t.chamadasA('POST', '/api/grupos/g-quinta/partidas')).toHaveLength(1),
    );
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/partidas')[0]?.corpo).toEqual({
      data: '2026-10-22',
      choveu: true,
      marcacoes: [
        { jogadorId: ALEMAO, situacao: 'presente' },
        { jogadorId: CARECA, situacao: 'lesionado' },
      ],
    });
  });

  it('PAR-36: sucesso volta ao início do grupo com "Partida de dd/mm salva."', async () => {
    const t = abrir({ [NOVA]: () => json(200, nova()), [LANCAR]: () => json(201, salva()) });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todos como presentes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (3 presentes)' }));
    await waitFor(() => expect(t.local()).toBe('/app/grupos/g-quinta'));
    expect(await screen.findByText('Partida de 22/10 salva.')).toBeDefined();
  });

  it('PAR-147: 422 com campos mostra "Corrija 1 campo:" e a mensagem no campo', async () => {
    abrir({
      [NOVA]: () => json(200, nova()),
      [LANCAR]: () =>
        json(422, {
          erro: 'Dados inválidos.',
          codigo: 'dados_invalidos',
          campos: ['data'],
          mensagens: { data: 'Informe uma data válida.' },
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Marcar todos como presentes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar partida (3 presentes)' }));
    const resumo = await screen.findByText('Corrija 1 campo:');
    expect(resumo.closest('[role="alert"]')?.textContent).toContain('Data');
    expect(screen.getByText('Informe uma data válida.')).toBeDefined();
    expect(
      (screen.getByLabelText('Data') as HTMLInputElement).getAttribute('aria-describedby'),
    ).toBeTruthy();
  });

  it('axe sem violações', async () => {
    const { container } = abrir({ [NOVA]: () => json(200, nova()) });
    await screen.findByRole('group', { name: 'Situação de Alemão' });
    await esperarSemViolacoes(container);
  });
});
