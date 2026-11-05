import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  AJUDA_INICIO,
  TEXTO_DATAS_CORRIGIDAS,
  TEXTO_NADA_A_CORRIGIR,
  textoDoPeriodo,
  textoInicioAtual,
} from '../../src/telas/jogador/CorrigirDatas.tsx';
import { FichaJogador } from '../../src/telas/jogador/FichaJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Ficha do jogador: corrigir datas e data de início (T66; GEL-76, GEL-77, GEL-114), de `t16-jogador--corrigir`,
 * `--corrigir-erro`, `--corrigido`, `--inicio` e `--inicio-erro`. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/:jogadorId', element: <FichaJogador /> },
  { path: '*', element: <p>destino</p> },
];

const BASE = {
  posicao: 'meia',
  situacao: 'ativo',
  nivel: 550,
  semNota: true,
  anoNascimento: 1985,
  telefone: null,
  pontuacaoInicial: 0,
  inicioPontuacao: '2026-02-05',
  notas: [],
};

const GIL = {
  ...BASE,
  id: 'j-gil',
  apelido: 'Gil',
  desde: '2026-10-20',
  periodos: [
    { id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' },
    { id: 'p2', inicio: '2026-10-20', fim: null },
  ],
};

const TONINHO = { ...BASE, id: 'j-toninho', apelido: 'Toninho', desde: '2026-02-05', periodos: [{ id: 'p1', inicio: '2026-02-05', fim: null }] };

const API_GIL = '/api/grupos/g-quinta/jogadores/j-gil';
const API_TONINHO = '/api/grupos/g-quinta/jogadores/j-toninho';

function abrir(id: string, api: Record<string, Manipulador>) {
  return abrirTela(`/app/grupos/g-quinta/jogadores/${id}`, { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

function erro422(mensagens: Record<string, string>): Response {
  return json(422, { erro: 'Corrija os campos indicados.', codigo: 'dados_invalidos', campos: Object.keys(mensagens), mensagens });
}

function botoesCorrigir() {
  return screen.getAllByRole('button', { name: 'Corrigir datas' });
}

afterEach(() => {
  cleanup();
});

describe('textos da correção', () => {
  it('a entrada explica a data de início; o retorno mostra o intervalo', () => {
    expect(textoDoPeriodo('Gil', GIL.periodos[0]!, 0)).toBe(
      'Entrada de Gil: 05/02/2026 → 05/10/2026. A entrada é a data de início da pontuação; para mudá-la, use Alterar data de início.',
    );
    expect(textoDoPeriodo('Gil', GIL.periodos[1]!, 1)).toBe('Retorno de Gil: 20/10/2026 → atual.');
  });
});

describe('ficha do jogador: corrigir datas', () => {
  it('a entrada aberta não tem o que corrigir: o botão fica aria-disabled com a explicação', async () => {
    abrir('j-toninho', { [`GET ${API_TONINHO}`]: () => json(200, TONINHO) });
    const [botao] = await screen.findAllByRole('button', { name: 'Corrigir datas' });
    expect(botao?.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText(TEXTO_NADA_A_CORRIGIR)).toBeTruthy();
    fireEvent.click(botao!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('GEL-76: corrigir o retorno envia o PATCH e mostra "Datas corrigidas."; axe com o diálogo aberto', async () => {
    let corrigido = false;
    const { container, chamadasA } = abrir('j-gil', {
      [`GET ${API_GIL}`]: () =>
        json(200, corrigido ? { ...GIL, desde: '2026-10-12', periodos: [GIL.periodos[0], { id: 'p2', inicio: '2026-10-12', fim: null }] } : GIL),
      [`PATCH ${API_GIL}/periodos/p2`]: () => {
        corrigido = true;
        return json(200, {});
      },
    });
    await screen.findByRole('heading', { level: 1, name: 'Gil' });
    fireEvent.click(botoesCorrigir()[1]!);
    const dialogo = screen.getByRole('dialog', { name: 'Corrigir datas' });
    expect(within(dialogo).getByText('Retorno de Gil: 20/10/2026 → atual.')).toBeTruthy();
    expect(within(dialogo).queryByLabelText('Data de saída')).toBeNull();
    const retorno = within(dialogo).getByLabelText('Data de retorno') as HTMLInputElement;
    expect(retorno.value).toBe('2026-10-20');
    expect(within(dialogo).getByText(/Não pode ser antes da saída anterior \(05\/10\/2026\)/)).toBeTruthy();
    await esperarSemViolacoes(container);

    fireEvent.change(retorno, { target: { value: '2026-10-12' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar novas datas' }));
    expect(await screen.findByText(TEXTO_DATAS_CORRIGIDAS)).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(chamadasA('PATCH', `${API_GIL}/periodos/p2`).map((c) => c.corpo)).toEqual([{ retorno: '2026-10-12' }]);
    await waitFor(() => expect(screen.getByText(/12\/10\/2026/)).toBeTruthy());
  });

  it('GEL-114: 422 da saída do primeiro período mostra a mensagem no campo; axe sem violação', async () => {
    const MENSAGEM = 'Há presença do jogador em 01/10/2026. A saída precisa ser em 02/10/2026 ou depois. Para usar uma data anterior, remova a presença em Editar partida.';
    const { container, chamadasA } = abrir('j-gil', {
      [`GET ${API_GIL}`]: () => json(200, GIL),
      [`PATCH ${API_GIL}/periodos/p1`]: () => erro422({ saida: MENSAGEM }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Gil' });
    fireEvent.click(botoesCorrigir()[0]!);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).queryByLabelText('Data de retorno')).toBeNull();
    const saida = within(dialogo).getByLabelText('Data de saída');
    expect(within(dialogo).getByText(/Não pode ser depois do próximo retorno \(20\/10\/2026\)/)).toBeTruthy();
    fireEvent.change(saida, { target: { value: '2026-10-01' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar novas datas' }));
    await waitFor(() => expect(saida.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById('saida-erro')?.textContent).toBe(MENSAGEM);
    expect(chamadasA('PATCH', `${API_GIL}/periodos/p1`).map((c) => c.corpo)).toEqual([{ saida: '2026-10-01' }]);
    expect(screen.queryByText(TEXTO_DATAS_CORRIGIDAS)).toBeNull();
    await esperarSemViolacoes(container);
  });
});

describe('ficha do jogador: alterar a data de início', () => {
  it('GEL-77: alterar o início chama PUT …/inicio e mostra a data nova; axe com o diálogo aberto', async () => {
    let alterado = false;
    const { container, chamadasA } = abrir('j-toninho', {
      [`GET ${API_TONINHO}`]: () => json(200, alterado ? { ...TONINHO, inicioPontuacao: '2026-01-15' } : TONINHO),
      [`PUT ${API_TONINHO}/inicio`]: () => {
        alterado = true;
        return json(200, {});
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar data de início' }));
    const dialogo = screen.getByRole('dialog', { name: 'Alterar data de início' });
    expect(within(dialogo).getByText(textoInicioAtual('Toninho', '2026-02-05'))).toBeTruthy();
    expect(within(dialogo).getByText(AJUDA_INICIO)).toBeTruthy();
    const campo = within(dialogo).getByLabelText('Data de início') as HTMLInputElement;
    expect(campo.min).toBe('2000-01-01');
    await esperarSemViolacoes(container);

    fireEvent.change(campo, { target: { value: '2026-01-15' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar nova data' }));
    expect(await screen.findByText('Data de início alterada para 15/01/2026.')).toBeTruthy();
    expect(chamadasA('PUT', `${API_TONINHO}/inicio`).map((c) => c.corpo)).toEqual([{ data: '2026-01-15' }]);
    await waitFor(() => expect(document.getElementById('inicio-valor')?.textContent).toBe('15/01/2026'));
  });

  it('GEL-80, GEL-114: 422 do início mostra a mensagem no campo; axe sem violação', async () => {
    const MENSAGEM =
      'A data de início não pode ficar depois da saída do primeiro período (05/10/2026). Corrija antes a data de saída do primeiro período.';
    const { container } = abrir('j-gil', {
      [`GET ${API_GIL}`]: () => json(200, GIL),
      [`PUT ${API_GIL}/inicio`]: () => erro422({ data: MENSAGEM }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Alterar data de início' }));
    const dialogo = screen.getByRole('dialog');
    const campo = within(dialogo).getByLabelText('Data de início');
    fireEvent.change(campo, { target: { value: '2026-10-15' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar nova data' }));
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById('inicio-erro')?.textContent).toBe(MENSAGEM);
    await esperarSemViolacoes(container);
  });
});
