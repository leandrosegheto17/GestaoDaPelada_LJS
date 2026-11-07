import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  avisoEscalacaoConfirmada,
  TEXTO_DESCARTAR,
  TEXTO_FALHA_CONFIRMAR,
  TITULO_DESCARTAR,
} from '../../src/telas/simulador/AcoesResultado.tsx';
import { moverNoDois } from '../../src/telas/simulador/MoverJogador.tsx';
import { PaginaSimulador } from '../../src/telas/simulador/PaginaSimulador.tsx';
import {
  abrirTela,
  erroApi,
  json,
  pendente,
  SESSAO_ANA,
  type Manipulador,
} from '../apoio/tela.tsx';

/**
 * Refazer, editar entradas e confirmar (t13; simulador T50; SIM-46, SIM-66, SIM-73, SIM-93), a partir dos critérios
 * da spec e do mockup `t13-resultado-dois--{sucesso,refazer,erro-confirmar}.html`, com as respostas do mockup (T44).
 * A sugestão tem um aviso ("sem nota"): o botão de confirmar continua ativo.
 */

type Json = Record<string, unknown>;

function resposta(nome: string): Json {
  return JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../../../../.specs/mockup/respostas/${nome}`,
      ),
      'utf8',
    ),
  ) as Json;
}

const SUGERIR = '/api/grupos/g-quinta/simulador/sugerir';
const ESCALACOES = '/api/grupos/g-quinta/escalacoes';

const rotas = () => [
  { path: '/app/grupos/:grupoId/simulador', element: <PaginaSimulador /> },
  { path: '/app/grupos/:grupoId', element: <AvisoDoInicio /> },
];

/** O início do grupo de mentira: o aviso é conferido no `state` da navegação, que o `InicioGrupo` mostra. */
function AvisoDoInicio() {
  return <p>início</p>;
}

/** O que o `avaliar` responde depois de mover Japa para o Time B: a composição enviada, sem a ordem de prioridade. */
function avaliacaoDois(): Json {
  const { ordemPrioridade: _ordem, ...resto } = resposta('simulador-sugestao-dois.json');
  return moverNoDois(resto as never, 'j-japa', { tipo: 'reserva', time: 1 }) as unknown as Json;
}

function abrir(
  escalacoes: Manipulador = () =>
    json(201, { data: '2026-10-22', confirmadaEm: '2026-10-20T21:30:00.000Z' }),
  avaliar: Manipulador = () => pendente(),
) {
  return abrirTela(
    '/app/grupos/g-quinta/simulador',
    {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/simulador/contexto': () =>
        json(200, resposta('simulador-contexto-2026-10-22.json')),
      'POST /api/grupos/g-quinta/simulador/previa': () =>
        json(200, resposta('simulador-previa-dois.json')),
      [`POST ${SUGERIR}`]: () => json(200, resposta('simulador-sugestao-dois.json')),
      'POST /api/grupos/g-quinta/simulador/avaliar': avaliar,
      [`POST ${ESCALACOES}`]: escalacoes,
    },
    rotas,
  );
}

afterEach(() => {
  cleanup();
});

async function sugerir() {
  const botao = (await screen.findByRole('button', { name: 'Sugerir times' })) as HTMLButtonElement;
  await waitFor(() => expect(botao.disabled).toBe(false));
  fireEvent.click(botao);
  await screen.findByRole('heading', { name: 'Times sugeridos' });
}

function moverJapaParaB() {
  fireEvent.click(
    within(screen.getByRole('region', { name: 'Time A' })).getByRole('button', { name: 'Japa' }),
  );
  fireEvent.click(
    within(screen.getByRole('dialog', { name: 'Japa' })).getByRole('button', {
      name: 'Entra no 2º tempo pelo Time B',
    }),
  );
}

describe('Simulador: ações do resultado', () => {
  it('SIM-66: sem ajuste, "Refazer sugestão" pede outra sugestão sem perguntar', async () => {
    const t = abrir();
    await sugerir();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer sugestão' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(t.chamadasA('POST', SUGERIR)).toHaveLength(2));
  });

  it('SIM-66: depois de mover, pergunta "Descartar seus ajustes?" e refazer devolve a sugestão inicial', async () => {
    const t = abrir();
    await sugerir();
    moverJapaParaB();
    fireEvent.click(screen.getByRole('button', { name: 'Refazer sugestão' }));
    const pergunta = screen.getByRole('alertdialog', { name: TITULO_DESCARTAR });
    expect(within(pergunta).getByText(TEXTO_DESCARTAR)).toBeDefined();

    // "Cancelar" mantém o ajuste e não pede nada.
    fireEvent.click(within(pergunta).getByRole('button', { name: 'Cancelar' }));
    expect(
      within(screen.getByRole('region', { name: 'Time B' })).getByRole('button', { name: 'Japa' }),
    ).toBeDefined();
    expect(t.chamadasA('POST', SUGERIR)).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Refazer sugestão' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Refazer sugestão' }),
    );
    await waitFor(() => expect(t.chamadasA('POST', SUGERIR)).toHaveLength(2));
    expect(t.chamadasA('POST', SUGERIR)[1]?.corpo).toEqual(t.chamadasA('POST', SUGERIR)[0]?.corpo);
    await screen.findByRole('heading', { name: 'Times sugeridos' });
    expect(
      within(await screen.findByRole('region', { name: 'Time A' })).getByRole('button', {
        name: 'Japa',
      }),
    ).toBeDefined();
  });

  it('SIM-66: "Editar entradas" volta à t12 com as entradas como estavam', async () => {
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Aumentar jogadores por time' }));
    await sugerir();
    fireEvent.click(screen.getByRole('button', { name: 'Editar entradas' }));
    expect(((await screen.findByLabelText('Jogadores por time')) as HTMLInputElement).value).toBe(
      '8',
    );
  });

  it('SIM-46: com avisos, "Confirmar escalação" continua ativo e confirma a composição ajustada', async () => {
    const t = abrir(undefined, () => json(200, avaliacaoDois()));
    await sugerir();
    expect(screen.getByText('Léo Baiano e Serginho não têm nota: usamos nível 5,5.')).toBeDefined();
    moverJapaParaB();
    const confirmar = screen.getByRole('button', {
      name: 'Confirmar escalação',
    }) as HTMLButtonElement;
    // Enquanto os números recalculam o botão espera (t13 `recalculando`); com a resposta volta a ficar ativo.
    await waitFor(() => expect(confirmar.disabled).toBe(false));
    fireEvent.click(confirmar);
    await waitFor(() => expect(t.chamadasA('POST', ESCALACOES)).toHaveLength(1));
    const corpo = t.chamadasA('POST', ESCALACOES)[0]?.corpo as {
      formato: string;
      data: string;
      n: number;
      k: number;
      composicao: { times: Array<{ entramNo2oTempo: Array<{ id: string }> }>; naoEntra: string[] };
    };
    expect(corpo).toMatchObject({ formato: 'dois_times', data: '2026-10-22', n: 7, k: 2 });
    expect(corpo).not.toHaveProperty('aptos');
    expect(corpo.composicao.times[1]?.entramNo2oTempo.map((j) => j.id)).toContain('j-japa');
    expect(corpo.composicao.naoEntra).toEqual(['j-serginho']);
  });

  it('SIM-73: sucesso volta ao início com "Escalação de dd/mm confirmada."', async () => {
    const t = abrir();
    await sugerir();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar escalação' }));
    await screen.findByText('início');
    expect(t.local()).toBe('/app/grupos/g-quinta');
    expect((t.roteador.state.location.state as { aviso?: string }).aviso).toBe(
      avisoEscalacaoConfirmada('2026-10-22'),
    );
    expect(avisoEscalacaoConfirmada('2026-10-22')).toBe('Escalação de 22/10 confirmada.');
  });

  it('SIM-73, SIM-93: 409 de grupo arquivado mantém a composição e mostra a mensagem de erro', async () => {
    abrir(
      () => erroApi(409, 'grupo_arquivado'),
      () => json(200, avaliacaoDois()),
    );
    await sugerir();
    moverJapaParaB();
    const confirmar = screen.getByRole('button', {
      name: 'Confirmar escalação',
    }) as HTMLButtonElement;
    await waitFor(() => expect(confirmar.disabled).toBe(false));
    fireEvent.click(confirmar);
    expect(await screen.findByText(TEXTO_FALHA_CONFIRMAR)).toBeDefined();
    expect(
      within(screen.getByRole('region', { name: 'Time B' })).getByRole('button', { name: 'Japa' }),
    ).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Times sugeridos' })).toBeDefined();
  });
});
