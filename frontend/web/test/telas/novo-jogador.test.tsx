import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hojeEmSaoPaulo } from '../../src/dados/hoje.ts';
import { AJUDA_APELIDO, mascararTelefone } from '../../src/telas/jogador/camposJogador.tsx';
import { corpoDoJogador, NovoJogador } from '../../src/telas/jogador/NovoJogador.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/**
 * Novo jogador (T63; GEL-31, GEL-33, GEL-34, GEL-39, GEL-114, GEL-118), de `t16-jogador--novo.html` e
 * `t16-jogador--erro.html`. A rota entra no app na T69.
 */

const rotas = () => [
  { path: '/app/grupos/:grupoId/jogadores/novo', element: <NovoJogador /> },
  { path: '*', element: <p>destino</p> },
];

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/jogadores/novo',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), ...api },
    rotas,
  );
}

function erro422(mensagens: Record<string, string>): Response {
  return json(422, {
    erro: 'Corrija os campos indicados.',
    codigo: 'dados_invalidos',
    campos: Object.keys(mensagens).sort(),
    mensagens,
  });
}

function preencher() {
  fireEvent.change(screen.getByLabelText('Apelido'), { target: { value: 'Toninho' } });
  fireEvent.change(screen.getByLabelText('Ano de nascimento'), { target: { value: '1990' } });
  fireEvent.change(screen.getByLabelText('Posição'), { target: { value: 'atacante' } });
}

afterEach(() => {
  cleanup();
});

describe('hojeEmSaoPaulo e máscara do telefone', () => {
  it('hoje no fuso de São Paulo: 02:00 UTC ainda é o dia anterior', () => {
    expect(hojeEmSaoPaulo(new Date('2026-11-05T02:00:00Z'))).toBe('2026-11-04');
    expect(hojeEmSaoPaulo(new Date('2026-11-05T15:00:00Z'))).toBe('2026-11-05');
  });

  it('GEL-39: a máscara forma "(DD) 9XXXX-XXXX" e corta em 11 dígitos', () => {
    expect(mascararTelefone('')).toBe('');
    expect(mascararTelefone('11')).toBe('(11');
    expect(mascararTelefone('1198')).toBe('(11) 98');
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321');
    expect(mascararTelefone('(11) 98765-43219999')).toBe('(11) 98765-4321');
  });

  it('o corpo leva telefone vazio como null, ano numérico, e omite pontuação vazia', () => {
    expect(
      corpoDoJogador({
        apelido: 'Zé',
        anoNascimento: '1990',
        posicao: 'meia',
        telefone: '',
        dataEntrada: '2026-11-01',
        pontuacaoInicial: '',
      }),
    ).toEqual({
      apelido: 'Zé',
      anoNascimento: 1990,
      posicao: 'meia',
      telefone: null,
      dataEntrada: '2026-11-01',
    });
    expect(
      corpoDoJogador({
        apelido: 'Zé',
        anoNascimento: '',
        posicao: '',
        telefone: '(11) 9',
        dataEntrada: '',
        pontuacaoInicial: '12',
      }),
    ).toEqual({
      apelido: 'Zé',
      anoNascimento: null,
      posicao: '',
      telefone: '(11) 9',
      pontuacaoInicial: 12,
    });
  });
});

describe('tela Novo jogador (t16)', () => {
  it('GEL-114: formulário com data de entrada hoje (sem futuro) e pontuação 0; axe sem violação', async () => {
    const { container } = abrir({});
    expect(await screen.findByRole('heading', { level: 1, name: 'Novo jogador' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Jogadores' }).getAttribute('href')).toBe(
      '/app/grupos/g-quinta/jogadores',
    );
    expect(screen.getByText(AJUDA_APELIDO)).toBeTruthy();
    const entrada = screen.getByLabelText('Data de entrada') as HTMLInputElement;
    expect(entrada.value).toBe(hojeEmSaoPaulo());
    expect(entrada.max).toBe(hojeEmSaoPaulo());
    expect((screen.getByLabelText('Pontuação inicial') as HTMLInputElement).value).toBe('0');
    expect(
      Array.from((screen.getByLabelText('Posição') as HTMLSelectElement).options).map(
        (o) => o.textContent,
      ),
    ).toEqual([
      'Escolha',
      'Zagueiro',
      'Lateral',
      'Volante',
      'Meia',
      'Atacante',
      'Centroavante',
      'Goleiro',
    ]);
    await esperarSemViolacoes(container);
  });

  it('GEL-31: 201 envia o corpo e navega para a ficha', async () => {
    const { chamadasA, local } = abrir({
      'POST /api/grupos/g-quinta/jogadores': () => json(201, { id: 'j-novo' }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo jogador' });
    preencher();
    fireEvent.change(screen.getByLabelText('Telefone (opcional)'), {
      target: { value: '11987654321' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(local()).toBe('/app/grupos/g-quinta/jogadores/j-novo'));
    expect(chamadasA('POST', '/api/grupos/g-quinta/jogadores').map((c) => c.corpo)).toEqual([
      {
        apelido: 'Toninho',
        anoNascimento: 1990,
        posicao: 'atacante',
        telefone: '(11) 98765-4321',
        pontuacaoInicial: 0,
        dataEntrada: hojeEmSaoPaulo(),
      },
    ]);
  });

  it('GEL-34, GEL-33, GEL-39, GEL-118: 422 marca cada campo com a mensagem e preenche o resumo na ordem do formulário; axe sem violação', async () => {
    const { container } = abrir({
      'POST /api/grupos/g-quinta/jogadores': () =>
        erro422({
          apelido: 'O apelido precisa ter de 2 a 30 caracteres.',
          dataEntrada: 'A data não pode ser no futuro.',
          telefone: 'Informe o telefone como (DD) 9XXXX-XXXX.',
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo jogador' });
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByRole('alert');
    expect(within(resumo).getByText('Corrija 3 campos:')).toBeTruthy();
    expect(
      within(resumo)
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Apelido', '#apelido'],
      ['Telefone (opcional)', '#tel'],
      ['Data de entrada', '#entrada'],
    ]);
    expect(document.getElementById('apelido-erro')?.textContent).toBe(
      'O apelido precisa ter de 2 a 30 caracteres.',
    );
    expect(screen.getByLabelText('Apelido').getAttribute('aria-describedby')).toBe(
      'apelido-ajuda apelido-erro',
    );
    expect(document.getElementById('entrada-erro')?.textContent).toBe(
      'A data não pode ser no futuro.',
    );
    expect(document.getElementById('tel-erro')?.textContent).toBe(
      'Informe o telefone como (DD) 9XXXX-XXXX.',
    );
    expect(screen.getByLabelText('Ano de nascimento').getAttribute('aria-invalid')).toBeNull();
    await esperarSemViolacoes(container);
  });

  it('GEL-118: o apelido repetido e o ano do mockup de erro ("Corrija 2 campos: Apelido, Ano de nascimento")', async () => {
    abrir({
      'POST /api/grupos/g-quinta/jogadores': () =>
        erro422({
          apelido: 'Já existe um jogador com esse apelido neste grupo.',
          anoNascimento: 'O ano precisa estar entre 1940 e 2016.',
        }),
    });
    await screen.findByRole('heading', { level: 1, name: 'Novo jogador' });
    preencher();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    const resumo = await screen.findByRole('alert');
    expect(
      within(resumo)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Apelido', 'Ano de nascimento']);
    expect(document.getElementById('ano-erro')?.textContent).toBe(
      'O ano precisa estar entre 1940 e 2016.',
    );
  });
});
