import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { FichaJogador } from '../../src/telas/jogador/FichaJogador.tsx';
import {
  TEXTO_REATIVAR_JOGADOR,
  textoRodadasConfirmadas,
} from '../../src/telas/jogador/PeriodosJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Prévias nos diálogos da ficha (partidas-e-ranking T66; PAR-120, PAR-121, PAR-159), a partir de `B:359-362` e do
 * mockup do módulo (`t16-jogador--reativar{,-calculando,-previa,-erro-rede}.html`, `--reativado`). Molde:
 * `periodos-jogador.test.tsx`.
 */

afterEach(() => {
  cleanup();
});

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
  { path: '*', element: <p>destino</p> },
];

const BETO_INATIVO = {
  posicao: 'meia',
  nivel: 550,
  semNota: true,
  anoNascimento: 1985,
  telefone: null,
  pontuacaoInicial: 12,
  inicioPontuacao: '2026-02-05',
  notas: [],
  id: 'j-beto',
  apelido: 'Beto',
  situacao: 'inativo',
  desde: '2026-10-05',
  periodos: [{ id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' }],
};

const FICHA = 'GET /api/grupos/g-quinta/jogadores/j-beto';
const PREVIA = 'POST /api/grupos/g-quinta/jogadores/j-beto/reativar/previa';
const REATIVAR = 'POST /api/grupos/g-quinta/jogadores/j-beto/reativar';

const AVISO = 'Elas valem 0 ponto até você lançar a presença em Editar partida.';

const PREVIA_DUAS = {
  acumuladoAntes: 18,
  acumuladoDepois: 18,
  posicaoAntes: null,
  posicaoDepois: 15,
  rodadasQuePassamAConstar: [
    { data: '2026-10-08', situacao: 'falta' },
    { data: '2026-10-15', situacao: 'falta' },
  ],
  rodadasQueDeixamDeConstar: [],
  aviso: AVISO,
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/jogadores/j-beto',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api },
    rotas,
  );
}

async function abrirReativar() {
  fireEvent.click(await screen.findByRole('button', { name: 'Reativar' }));
  return screen.getByRole('dialog');
}

describe('PAR-121: texto das rodadas confirmadas', () => {
  it('PAR-121: plural com o aviso; singular; sem rodadas, nulo', () => {
    expect(textoRodadasConfirmadas(PREVIA_DUAS as never)).toBe(
      `2 rodadas passaram a constar: 08/10 e 15/10. ${AVISO}`,
    );
    expect(
      textoRodadasConfirmadas({
        ...PREVIA_DUAS,
        rodadasQuePassamAConstar: [{ data: '2026-10-15', situacao: 'falta' }],
        aviso: 'Ela vale 0 ponto até você lançar a presença em Editar partida.',
      } as never),
    ).toBe(
      '1 rodada passou a constar: 15/10. Ela vale 0 ponto até você lançar a presença em Editar partida.',
    );
    expect(
      textoRodadasConfirmadas({
        ...PREVIA_DUAS,
        rodadasQuePassamAConstar: [],
        aviso: null,
      } as never),
    ).toBeNull();
  });
});

describe('prévia no reativar (t16)', () => {
  it('PAR-159: o diálogo de reativar mostra "Volta a aparecer no ranking e nas partidas; a data de início não muda." e não contém "os pontos não mudam"', async () => {
    abrir({ [FICHA]: () => json(200, BETO_INATIVO), [PREVIA]: () => json(200, PREVIA_DUAS) });
    const dialogo = await abrirReativar();
    expect(TEXTO_REATIVAR_JOGADOR).toBe(
      'Volta a aparecer no ranking e nas partidas; a data de início não muda.',
    );
    expect(
      within(dialogo).getByText(
        'Volta a aparecer no ranking e nas partidas; a data de início não muda.',
      ),
    ).toBeDefined();
    expect(dialogo.textContent).not.toContain('os pontos não mudam');
  });

  it('PAR-120: "Reativar" fica desabilitado durante "Calculando…" e habilita com a prévia pronta', async () => {
    let responder: ((r: Response) => void) | null = null;
    abrir({
      [FICHA]: () => json(200, BETO_INATIVO),
      [PREVIA]: () =>
        new Promise<Response>((r) => {
          responder = r;
        }),
    });
    const dialogo = await abrirReativar();
    const botao = within(dialogo).getByRole('button', { name: 'Reativar' }) as HTMLButtonElement;
    expect(await within(dialogo).findByText('Calculando…')).toBeDefined();
    expect(botao.disabled).toBe(true);
    await waitFor(() => expect(responder).not.toBeNull());
    responder!(json(200, PREVIA_DUAS));
    expect(
      await within(dialogo).findByText(
        'Acumulado de 18 pontos não muda. Passa a aparecer no ranking, na posição 15.',
      ),
    ).toBeDefined();
    expect(within(dialogo).getByText('2 rodadas passam a constar: 08/10 e 15/10.')).toBeDefined();
    expect(botao.disabled).toBe(false);
  });

  it('PAR-120: depois de um 422 da prévia, "Reativar" continua desabilitado e a mensagem fica no campo', async () => {
    abrir({
      [FICHA]: () => json(200, BETO_INATIVO),
      [PREVIA]: () =>
        json(422, {
          erro: 'Corrija os campos indicados.',
          codigo: 'dados_invalidos',
          campos: ['data'],
          mensagens: { data: 'O retorno não pode ser antes da saída anterior (05/10/2026).' },
        }),
    });
    const dialogo = await abrirReativar();
    const retorno = within(dialogo).getByLabelText('Data de retorno');
    fireEvent.change(retorno, { target: { value: '2026-10-03' } });
    await waitFor(() => expect(retorno.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById('retorno-erro')?.textContent).toBe(
      'O retorno não pode ser antes da saída anterior (05/10/2026).',
    );
    expect(
      (within(dialogo).getByRole('button', { name: 'Reativar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('PAR-120: a prévia é pedida uma vez depois da última troca de data (300 ms), não a cada troca', async () => {
    const t = abrir({
      [FICHA]: () => json(200, BETO_INATIVO),
      [PREVIA]: () => json(200, PREVIA_DUAS),
    });
    const dialogo = await abrirReativar();
    const retorno = within(dialogo).getByLabelText('Data de retorno');
    fireEvent.change(retorno, { target: { value: '2026-10-07' } });
    fireEvent.change(retorno, { target: { value: '2026-10-08' } });
    fireEvent.change(retorno, { target: { value: '2026-10-09' } });
    await within(dialogo).findByText('2 rodadas passam a constar: 08/10 e 15/10.');
    const pedidos = t.chamadasA('POST', '/api/grupos/g-quinta/jogadores/j-beto/reativar/previa');
    expect(pedidos.map((c) => c.corpo)).toEqual([{ data: '2026-10-09' }]);
  });

  it('erro de rede da prévia mostra "Não foi possível calcular. Verifique a conexão." com "Tentar de novo"', async () => {
    let falhar = true;
    abrir({
      [FICHA]: () => json(200, BETO_INATIVO),
      [PREVIA]: () =>
        falhar ? Promise.reject(new TypeError('Failed to fetch')) : json(200, PREVIA_DUAS),
    });
    const dialogo = await abrirReativar();
    expect(
      await within(dialogo).findByText('Não foi possível calcular. Verifique a conexão.'),
    ).toBeDefined();
    expect(
      (within(dialogo).getByRole('button', { name: 'Reativar' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    falhar = false;
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Tentar de novo' }));
    expect(
      await within(dialogo).findByText('2 rodadas passam a constar: 08/10 e 15/10.'),
    ).toBeDefined();
  });

  it('PAR-121: confirmar com 2 rodadas mostra "2 rodadas passaram a constar: … Elas valem 0 ponto até você lançar a presença em Editar partida."', async () => {
    let ativo = false;
    abrir({
      [FICHA]: () =>
        json(
          200,
          ativo
            ? {
                ...BETO_INATIVO,
                situacao: 'ativo',
                desde: '2026-10-07',
                periodos: [...BETO_INATIVO.periodos, { id: 'p2', inicio: '2026-10-07', fim: null }],
              }
            : BETO_INATIVO,
        ),
      [PREVIA]: () => json(200, PREVIA_DUAS),
      [REATIVAR]: () => {
        ativo = true;
        return json(200, { alterado: true });
      },
      'GET /api/grupos/g-quinta': () => pendente(),
    });
    const dialogo = await abrirReativar();
    fireEvent.change(within(dialogo).getByLabelText('Data de retorno'), {
      target: { value: '2026-10-07' },
    });
    const botao = within(dialogo).getByRole('button', { name: 'Reativar' }) as HTMLButtonElement;
    await waitFor(() => expect(botao.disabled).toBe(false));
    fireEvent.click(botao);
    expect(
      await screen.findByText(`2 rodadas passaram a constar: 08/10 e 15/10. ${AVISO}`),
    ).toBeDefined();
    expect(screen.getByRole('link', { name: 'Abrir partidas' }).getAttribute('href')).toBe(
      '/app/grupos/g-quinta/partidas',
    );
  });

  it('axe sem violações com a prévia pronta', async () => {
    const { container } = abrir({
      [FICHA]: () => json(200, BETO_INATIVO),
      [PREVIA]: () => json(200, PREVIA_DUAS),
    });
    const dialogo = await abrirReativar();
    await within(dialogo).findByText('2 rodadas passam a constar: 08/10 e 15/10.');
    await esperarSemViolacoes(container);
  });
});
