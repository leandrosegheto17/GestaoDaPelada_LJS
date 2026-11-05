import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  Habilidades,
  TEXTO_SEM_HABILIDADES,
  TITULO_SEM_HABILIDADES,
  textoExcluirHabilidade,
  tituloExcluirHabilidade,
} from '../../src/telas/habilidades/Habilidades.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Habilidades (T68; GEL-89 a GEL-95, GEL-114), de `.specs/mockup/telas/t17-habilidades--*.html`. A rota entra no app
 * na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/habilidades', element: <Habilidades /> },
  { path: '*', element: <p>destino</p> },
];

const NOMES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const LISTA = { habilidades: NOMES.map((nome, i) => ({ id: `h${i + 1}`, nome })) };
const API = '/api/grupos/g-quinta/habilidades';

function abrir(api: Record<string, Manipulador>) {
  return abrirTela('/app/grupos/g-quinta/habilidades', { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api }, rotas);
}

function erroNome(mensagem: string): Response {
  return json(422, { erro: 'Corrija os campos indicados.', codigo: 'dados_invalidos', campos: ['nome'], mensagens: { nome: mensagem } });
}

afterEach(() => {
  cleanup();
});

describe('tela Habilidades (t17)', () => {
  it('GEL-114: a lista na ordem da API, cada nome num campo, com Excluir; axe sem violação', async () => {
    const { container } = abrir({ [`GET ${API}`]: () => json(200, LISTA) });
    const lista = await screen.findByRole('list', { name: 'Habilidades' });
    expect(within(lista).getAllByRole('textbox').map((c) => (c as HTMLInputElement).value)).toEqual(NOMES);
    expect(screen.getByLabelText('Nome da habilidade 4')).toBeTruthy();
    expect(within(lista).getByRole('button', { name: 'Excluir Drible' })).toBeTruthy();
    expect(screen.getByLabelText('Nova habilidade')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-94: o diálogo de exclusão mostra o título e o texto com o nome entre aspas curvas; confirmar apaga', async () => {
    let lista = LISTA;
    const { container, chamadasA } = abrir({
      [`GET ${API}`]: () => json(200, lista),
      [`DELETE ${API}/h4`]: () => {
        lista = { habilidades: LISTA.habilidades.filter((h) => h.id !== 'h4') };
        return json(204);
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir Drible' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Excluir “Drible”?' });
    expect(tituloExcluirHabilidade('Drible')).toBe('Excluir “Drible”?');
    expect(within(dialogo).getByText('Excluir “Drible” apaga as notas de todos os jogadores nessa habilidade.')).toBeTruthy();
    expect(textoExcluirHabilidade('Drible')).toBe('Excluir “Drible” apaga as notas de todos os jogadores nessa habilidade.');
    await esperarSemViolacoes(container);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir habilidade' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(chamadasA('DELETE', `${API}/h4`)).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Excluir Drible' })).toBeNull());
  });

  it('GEL-95: sem habilidades, "Nenhuma habilidade" e "O simulador vai usar nível 5,5 para todos."; axe sem violação', async () => {
    const { container } = abrir({ [`GET ${API}`]: () => json(200, { habilidades: [] }) });
    expect(await screen.findByRole('heading', { level: 2, name: TITULO_SEM_HABILIDADES })).toBeTruthy();
    expect(screen.getByText(TEXTO_SEM_HABILIDADES)).toBeTruthy();
    expect(TEXTO_SEM_HABILIDADES).toBe('O simulador vai usar nível 5,5 para todos.');
    expect(screen.getByLabelText('Nova habilidade')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('GEL-89: Adicionar envia o nome e limpa o campo', async () => {
    const { chamadasA } = abrir({
      [`GET ${API}`]: () => json(200, LISTA),
      [`POST ${API}`]: () => json(201, { id: 'h7', nome: 'Cabeceio' }),
    });
    const campo = (await screen.findByLabelText('Nova habilidade')) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'Cabeceio' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(campo.value).toBe(''));
    expect(chamadasA('POST', API).map((c) => c.corpo)).toEqual([{ nome: 'Cabeceio' }]);
  });

  it('GEL-91, GEL-114: nome repetido mostra o erro do campo; axe sem violação', async () => {
    const { container } = abrir({
      [`GET ${API}`]: () => json(200, LISTA),
      [`POST ${API}`]: () => erroNome('Já existe uma habilidade com esse nome.'),
    });
    const campo = await screen.findByLabelText('Nova habilidade');
    fireEvent.change(campo, { target: { value: 'passe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() => expect(campo.getAttribute('aria-invalid')).toBe('true'));
    expect(document.getElementById('nova-erro')?.textContent).toBe('Já existe uma habilidade com esse nome.');
    expect((campo as HTMLInputElement).value).toBe('passe');
    await esperarSemViolacoes(container);
  });

  it('GEL-92: renomear ao sair do campo envia o PATCH só quando o nome mudou; 422 fica no item', async () => {
    const { chamadasA } = abrir({
      [`GET ${API}`]: () => json(200, LISTA),
      [`PATCH ${API}/h2`]: () => erroNome('O nome precisa ter de 2 a 30 caracteres.'),
    });
    const passe = await screen.findByLabelText('Nome da habilidade 2');
    fireEvent.blur(passe);
    expect(chamadasA('PATCH', `${API}/h2`)).toHaveLength(0);
    fireEvent.change(passe, { target: { value: 'P' } });
    fireEvent.blur(passe);
    await waitFor(() => expect(passe.getAttribute('aria-invalid')).toBe('true'));
    expect(chamadasA('PATCH', `${API}/h2`).map((c) => c.corpo)).toEqual([{ nome: 'P' }]);
    expect(document.getElementById('h2-erro')?.textContent).toBe('O nome precisa ter de 2 a 30 caracteres.');
  });

  it('GEL-114: carregando; axe sem violação', async () => {
    const { container } = abrir({ [`GET ${API}`]: () => pendente() });
    expect(await screen.findByText('Carregando…')).toBeTruthy();
    await esperarSemViolacoes(container);
  });
});
