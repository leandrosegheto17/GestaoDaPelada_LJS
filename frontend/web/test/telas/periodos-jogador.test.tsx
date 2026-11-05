import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hojeEmSaoPaulo } from '../../src/dados/hoje.ts';
import { FichaJogador } from '../../src/telas/jogador/FichaJogador.tsx';
import {
  ajudaRetorno,
  saidaAnterior,
  TEXTO_INATIVAR,
  TEXTO_REATIVAR_JOGADOR,
  tituloInativar,
  tituloReativarJogador,
} from '../../src/telas/jogador/PeriodosJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, erroApi, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Ficha do jogador: inativar e reativar (T65; GEL-53, GEL-56, GEL-59, GEL-60, GEL-114), de `t16-jogador--inativar`,
 * `--inativo`, `--reativar`, `--reativar-erro` e `--reativado`. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
  { path: '*', element: <p>destino</p> },
];

const BASE = {
  posicao: 'meia',
  nivel: 550,
  semNota: true,
  anoNascimento: 1985,
  telefone: null,
  pontuacaoInicial: 12,
  inicioPontuacao: '2026-02-05',
  notas: [],
};

const TONINHO_ATIVO = {
  ...BASE,
  id: 'j-toninho',
  apelido: 'Toninho',
  situacao: 'ativo',
  desde: '2026-02-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }],
};

const BETO_INATIVO = {
  ...BASE,
  id: 'j-beto',
  apelido: 'Beto',
  situacao: 'inativo',
  desde: '2026-10-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' }],
};

// partidas-e-ranking T66 (autorização de 2026-11-04 no STATE.md): "Confirmar" só habilita com a prévia pronta.
// As rotas `…/previa` respondem uma prévia neutra quando o teste não dá outra; os cliques de confirmar esperam o botão
// habilitar. Nenhuma asserção sai.
const PREVIA_NEUTRA = {
  acumuladoAntes: 0,
  acumuladoDepois: 0,
  posicaoAntes: null,
  posicaoDepois: null,
  rodadasQuePassamAConstar: [],
  rodadasQueDeixamDeConstar: [],
  aviso: null,
};
const PREVIA_INICIO_NEUTRA = {
  acumuladoAntes: 0,
  acumuladoDepois: 0,
  posicaoAntes: null,
  posicaoDepois: null,
  rodadasQuePassamAConstar: 0,
};

function comPrevias(api: Record<string, Manipulador>): Record<string, Manipulador> {
  return new Proxy(api, {
    get: (alvo, chave: string) =>
      alvo[chave] ??
      (chave.startsWith('POST ') && chave.endsWith('/inicio/previa')
        ? () => json(200, PREVIA_INICIO_NEUTRA)
        : chave.startsWith('POST ') && chave.endsWith('/previa')
          ? () => json(200, PREVIA_NEUTRA)
          : undefined),
  });
}

async function clicarQuandoPronto(botao: HTMLElement) {
  await waitFor(() => expect((botao as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(botao);
}

function abrir(id: string, api: Record<string, Manipulador>) {
  return abrirTela(
    `/app/grupos/g-quinta/jogadores/${id}`,
    comPrevias({ 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }),
    rotas,
  );
}

afterEach(() => {
  cleanup();
});

describe('saída anterior e ajuda do retorno', () => {
  it('a saída anterior é a do último período encerrado', () => {
    expect(
      saidaAnterior({
        periodos: [
          { id: 'a', inicio: '2026-01-01', fim: '2026-03-01' },
          { id: 'b', inicio: '2026-04-01', fim: '2026-10-05' },
        ],
      }),
    ).toBe('2026-10-05');
    expect(saidaAnterior({ periodos: [{ id: 'a', inicio: '2026-01-01', fim: null }] })).toBeNull();
    expect(ajudaRetorno('2026-10-05')).toContain(
      'Não pode ser antes da saída anterior (05/10/2026).',
    );
  });
});

describe('ficha do jogador: inativar e reativar', () => {
  it('GEL-59: Inativar abre o diálogo com o texto exato, a data de saída hoje, Cancelar e Inativar; axe com o diálogo aberto', async () => {
    const { container } = abrir('j-toninho', {
      'GET /api/grupos/g-quinta/jogadores/j-toninho': () => json(200, TONINHO_ATIVO),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    const dialogo = screen.getByRole('dialog', { name: tituloInativar('Toninho') });
    expect(within(dialogo).getByText(TEXTO_INATIVAR)).toBeTruthy();
    expect(TEXTO_INATIVAR).toBe(
      'Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados.',
    );
    const saida = within(dialogo).getByLabelText('Data de saída') as HTMLInputElement;
    expect(saida.value).toBe(hojeEmSaoPaulo());
    expect(saida.max).toBe(hojeEmSaoPaulo());
    expect(
      within(dialogo)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['', 'Cancelar', 'Inativar']);
    await esperarSemViolacoes(container);
  });

  it('GEL-59: Cancelar fecha sem chamar a API; Inativar envia a data e relê a ficha', async () => {
    let inativo = false;
    const { chamadasA } = abrir('j-toninho', {
      'GET /api/grupos/g-quinta/jogadores/j-toninho': () =>
        json(
          200,
          inativo
            ? {
                ...TONINHO_ATIVO,
                situacao: 'inativo',
                desde: '2026-10-20',
                periodos: [{ id: 'p1', inicio: '2026-02-05', fim: '2026-10-20' }],
              }
            : TONINHO_ATIVO,
        ),
      'POST /api/grupos/g-quinta/jogadores/j-toninho/inativar': () => {
        inativo = true;
        return json(200, { alterado: true });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadasA('POST', '/api/grupos/g-quinta/jogadores/j-toninho/inativar')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Inativar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Data de saída'), {
      target: { value: '2026-10-20' },
    });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar' }));
    expect(await screen.findByText('Inativo desde 20/10/2026.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      chamadasA('POST', '/api/grupos/g-quinta/jogadores/j-toninho/inativar').map((c) => c.corpo),
    ).toEqual([{ data: '2026-10-20' }]);
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeTruthy();
  });

  it('GEL-53: 409 de já inativo mostra a mensagem na faixa do diálogo', async () => {
    abrir('j-toninho', {
      'GET /api/grupos/g-quinta/jogadores/j-toninho': () => json(200, TONINHO_ATIVO),
      'POST /api/grupos/g-quinta/jogadores/j-toninho/inativar': () =>
        erroApi(409, 'ja_inativo', 'O jogador já está inativo.'),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Inativar' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Inativar' }));
    const dialogo = screen.getByRole('dialog');
    expect((await within(dialogo).findByRole('alert')).textContent).toContain(
      'O jogador já está inativo.',
    );
  });

  it('GEL-114: inativo mostra "Inativo desde" e Reativar; o diálogo tem a data de retorno e a ajuda; axe sem violação', async () => {
    const { container } = abrir('j-beto', {
      'GET /api/grupos/g-quinta/jogadores/j-beto': () => json(200, BETO_INATIVO),
    });
    expect(await screen.findByText('Inativo desde 05/10/2026.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Inativar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
    const dialogo = screen.getByRole('dialog', { name: tituloReativarJogador('Beto') });
    expect(within(dialogo).getByText(TEXTO_REATIVAR_JOGADOR)).toBeTruthy();
    expect(within(dialogo).getByText(ajudaRetorno('2026-10-05'))).toBeTruthy();
    expect((within(dialogo).getByLabelText('Data de retorno') as HTMLInputElement).value).toBe(
      hojeEmSaoPaulo(),
    );
    await esperarSemViolacoes(container);
  });

  it('GEL-60: reativar mostra "Beto reativado desde 22/10/2026."', async () => {
    let ativo = false;
    const { chamadasA } = abrir('j-beto', {
      'GET /api/grupos/g-quinta/jogadores/j-beto': () =>
        json(
          200,
          ativo
            ? {
                ...BETO_INATIVO,
                situacao: 'ativo',
                desde: '2026-10-22',
                periodos: [...BETO_INATIVO.periodos, { id: 'p2', inicio: '2026-10-22', fim: null }],
              }
            : BETO_INATIVO,
        ),
      'POST /api/grupos/g-quinta/jogadores/j-beto/reativar': () => {
        ativo = true;
        return json(200, { alterado: true });
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    const dialogo = screen.getByRole('dialog');
    fireEvent.change(within(dialogo).getByLabelText('Data de retorno'), {
      target: { value: '2026-10-22' },
    });
    await clicarQuandoPronto(within(dialogo).getByRole('button', { name: 'Reativar' }));
    expect(await screen.findByText('Beto reativado desde 22/10/2026.')).toBeTruthy();
    expect(
      chamadasA('POST', '/api/grupos/g-quinta/jogadores/j-beto/reativar').map((c) => c.corpo),
    ).toEqual([{ data: '2026-10-22' }]);
    await waitFor(() => expect(screen.getByText('Ativo desde 22/10/2026.')).toBeTruthy());
  });

  it('GEL-114: 422 de período mostra a mensagem no campo de retorno; axe sem violação', async () => {
    const { container } = abrir('j-beto', {
      'GET /api/grupos/g-quinta/jogadores/j-beto': () => json(200, BETO_INATIVO),
      'POST /api/grupos/g-quinta/jogadores/j-beto/reativar': () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['data'],
          mensagens: { data: 'O retorno não pode ser antes da saída anterior (05/10/2026).' },
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
    const dialogo = screen.getByRole('dialog');
    const retorno = within(dialogo).getByLabelText('Data de retorno');
    fireEvent.change(retorno, { target: { value: '2026-10-03' } });
    await clicarQuandoPronto(within(dialogo).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(retorno.getAttribute('aria-invalid')).toBe('true'));
    expect(retorno.getAttribute('aria-describedby')).toBe('retorno-ajuda retorno-erro');
    expect(document.getElementById('retorno-erro')?.textContent).toBe(
      'O retorno não pode ser antes da saída anterior (05/10/2026).',
    );
    expect(screen.queryByText(/reativado desde/)).toBeNull();
    await esperarSemViolacoes(container);
  });
});
