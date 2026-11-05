import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FichaJogador,
  TEXTO_DADOS_SALVOS,
  telefoneNaTela,
} from '../../src/telas/jogador/FichaJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Ficha do jogador: dados e notas (T64; GEL-41, GEL-97, GEL-98, GEL-103, GEL-114), de `t16-jogador--edicao.html` e
 * `t16-jogador--carregando.html`. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
  { path: '*', element: <p>destino</p> },
];

const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];

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
  notas: HABILIDADES.map((habilidade, i) => ({
    habilidadeId: `h${i + 1}`,
    habilidade,
    nota: null,
  })),
};

const CAMINHO = '/app/grupos/g-quinta/jogadores/j-toninho';
const API_FICHA = '/api/grupos/g-quinta/jogadores/j-toninho';

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(CAMINHO, { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

/** Servidor falso das notas: guarda as notas e devolve o nível pela média, em centésimos, como a API (GEL-101). */
function servidorDeNotas() {
  const notas = new Map<string, number>();
  const api: Record<string, Manipulador> = { [`GET ${API_FICHA}`]: () => json(200, TONINHO) };
  for (let i = 1; i <= 6; i += 1) {
    api[`PUT ${API_FICHA}/notas/h${i}`] = (corpo) => {
      const { nota } = corpo as { nota: number | null };
      if (nota === null) notas.delete(`h${i}`);
      else notas.set(`h${i}`, nota);
      const valores = [...notas.values()];
      if (valores.length === 0) return json(200, { nivel: 550, semNota: true });
      return json(200, {
        nivel: Math.round((valores.reduce((a, b) => a + b, 0) * 100) / valores.length),
        semNota: false,
      });
    };
  }
  return api;
}

afterEach(() => {
  cleanup();
});

describe('ficha do jogador: dados e notas (t16)', () => {
  it('GEL-114: título com o apelido, dados preenchidos sem a data de entrada, notas e períodos; axe sem violação', async () => {
    const { container } = abrir({ [`GET ${API_FICHA}`]: () => json(200, TONINHO) });
    expect(await screen.findByRole('heading', { level: 1, name: 'Toninho' })).toBeTruthy();
    expect((screen.getByLabelText('Apelido') as HTMLInputElement).value).toBe('Toninho');
    expect((screen.getByLabelText('Ano de nascimento') as HTMLInputElement).value).toBe('1978');
    expect((screen.getByLabelText('Posição') as HTMLSelectElement).value).toBe('atacante');
    expect((screen.getByLabelText('Telefone (opcional)') as HTMLInputElement).value).toBe(
      '(11) 98765-4321',
    );
    expect(screen.queryByLabelText('Data de entrada')).toBeNull();
    expect(screen.getByText('05/02/2026', { selector: '#inicio-valor' })).toBeTruthy();
    const habilidades = screen.getByRole('region', { name: 'Habilidades e nível' });
    expect(within(habilidades).getAllByRole('combobox')).toHaveLength(6);
    const situacao = screen.getByRole('region', { name: 'Situação' });
    expect(within(situacao).getByText('Ativo desde 05/02/2026.')).toBeTruthy();
    expect(within(situacao).getByText(/atual/)).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-114: carregando; axe sem violação', async () => {
    const { container } = abrir({ [`GET ${API_FICHA}`]: () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Jogador' })).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-97, GEL-103: dar 8, 7, 6, 7, 8 e 5 mostra "Nível 6,8"; limpar todas mostra "sem nota"', async () => {
    const api = servidorDeNotas();
    const { chamadas } = abrir(api);
    const habilidades = await screen.findByRole('region', { name: 'Habilidades e nível' });
    expect(within(habilidades).getByText('sem nota')).toBeTruthy();

    const notas = [8, 7, 6, 7, 8, 5];
    for (const [i, nota] of notas.entries()) {
      fireEvent.change(within(habilidades).getByLabelText(HABILIDADES[i] ?? ''), {
        target: { value: String(nota) },
      });
      await waitFor(() => expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(i + 1));
    }
    expect(await within(habilidades).findByText('Nível 6,8')).toBeTruthy();
    expect(chamadas.filter((c) => c.metodo === 'PUT').map((c) => c.corpo)).toEqual(
      notas.map((nota) => ({ nota })),
    );

    for (const [i] of notas.entries()) {
      fireEvent.change(within(habilidades).getByLabelText(HABILIDADES[i] ?? ''), {
        target: { value: '' },
      });
      await waitFor(() =>
        expect(chamadas.filter((c) => c.metodo === 'PUT')).toHaveLength(notas.length + i + 1),
      );
    }
    expect(await within(habilidades).findByText('sem nota')).toBeTruthy();
    expect(
      chamadas
        .filter((c) => c.metodo === 'PUT')
        .slice(notas.length)
        .map((c) => c.corpo),
    ).toEqual(notas.map(() => ({ nota: null })));
  });

  it('GEL-41: salvar os dados chama o PATCH sem dataEntrada e mostra "Dados salvos."', async () => {
    const { chamadasA } = abrir({
      [`GET ${API_FICHA}`]: () => json(200, TONINHO),
      [`PATCH ${API_FICHA}`]: (corpo) => json(200, { ...TONINHO, ...(corpo as object) }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Toninho' });
    fireEvent.change(screen.getByLabelText('Apelido'), { target: { value: 'Toninho Bala' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(TEXTO_DADOS_SALVOS)).toBeTruthy();
    const corpos = chamadasA('PATCH', API_FICHA).map((c) => c.corpo as Record<string, unknown>);
    expect(corpos).toEqual([
      {
        apelido: 'Toninho Bala',
        anoNascimento: 1978,
        posicao: 'atacante',
        telefone: '(11) 98765-4321',
        pontuacaoInicial: 0,
      },
    ]);
    expect('dataEntrada' in (corpos[0] ?? {})).toBe(false);
  });

  it('GEL-41, GEL-118: 422 no PATCH marca o campo com o resumo', async () => {
    abrir({
      [`GET ${API_FICHA}`]: () => json(200, TONINHO),
      [`PATCH ${API_FICHA}`]: () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['apelido'],
          mensagens: { apelido: 'Já existe um jogador com esse apelido neste grupo.' },
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Toninho' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Corrija 1 campo:')).toBeTruthy();
    expect(document.getElementById('apelido-erro')?.textContent).toBe(
      'Já existe um jogador com esse apelido neste grupo.',
    );
    expect(screen.queryByText(TEXTO_DADOS_SALVOS)).toBeNull();
  });

  it('telefoneNaTela mostra os 11 dígitos com a máscara, e nada sem telefone', () => {
    expect(telefoneNaTela('11987654321')).toBe('(11) 98765-4321');
    expect(telefoneNaTela(null)).toBe('');
  });
});
