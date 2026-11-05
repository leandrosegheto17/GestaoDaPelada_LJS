import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { lerPeso, PaginaPontuacao, textoPesos } from '../../src/telas/pontuacao/PaginaPontuacao.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/** Pontuação (partidas-e-ranking T62; PAR-10, PAR-11, PAR-12, PAR-147), a partir de `B:119-121`, `B:441` e do t18. */

afterEach(() => {
  cleanup();
});

const rotas = () => [{ path: '/app/grupos/:grupoId/pontuacao', element: <PaginaPontuacao /> }];
const LER = 'GET /api/grupos/g-quinta/pesos';
const SALVAR = 'POST /api/grupos/g-quinta/pesos';

const PESOS_SET = { presencaSemChuva: 1, presencaComChuva: 2, lesionadoSemChuva: 1, lesionadoComChuva: 1, expulsoSemChuva: -1, expulsoComChuva: -1 };

const PAINEL = {
  hoje: '2026-10-22',
  vigente: { ...PESOS_SET, vigenteDesde: '2026-09-01', registradoPor: 'Leandro' },
  historico: [
    {
      presencaSemChuva: 1,
      presencaComChuva: 1,
      lesionadoSemChuva: 1,
      lesionadoComChuva: 1,
      expulsoSemChuva: -1,
      expulsoComChuva: -1,
      vigenteDesde: '2026-05-01',
      vigenteAte: '2026-08-31',
      registradoPor: 'Leandro',
    },
    {
      presencaSemChuva: 1,
      presencaComChuva: 1,
      lesionadoSemChuva: 0,
      lesionadoComChuva: 0,
      expulsoSemChuva: -2,
      expulsoComChuva: -2,
      vigenteDesde: '2026-02-05',
      vigenteAte: '2026-04-30',
      registradoPor: 'Bia',
    },
  ],
};

const SALVO = {
  hoje: '2026-10-22',
  vigente: { ...PESOS_SET, lesionadoComChuva: 2, vigenteDesde: '2026-10-22', registradoPor: 'Ana' },
  historico: [{ ...PESOS_SET, vigenteDesde: '2026-09-01', vigenteAte: '2026-10-21', registradoPor: 'Leandro' }, ...PAINEL.historico],
};

function abrir(api: Record<string, Manipulador>) {
  return abrirTela(
    '/app/grupos/g-quinta/pontuacao',
    { 'GET /api/sessao': () => json(200, SESSAO_ANA), 'GET /api/grupos/g-quinta': () => pendente(), ...api },
    rotas,
  );
}

describe('regras', () => {
  it('PAR-12: lerPeso aceita inteiro de −10 a 10 e recusa o resto', () => {
    expect(lerPeso('1')).toBe(1);
    expect(lerPeso('-10')).toBe(-10);
    expect(lerPeso('−3')).toBe(-3);
    expect(lerPeso('10')).toBe(10);
    expect(lerPeso('11')).toBeNull();
    expect(lerPeso('-11')).toBeNull();
    expect(lerPeso('')).toBeNull();
    expect(lerPeso('1.5')).toBeNull();
    expect(lerPeso('abc')).toBeNull();
  });

  it('PAR-10: os seis pesos na ordem do formulário, com o sinal de menos', () => {
    expect(textoPesos(PESOS_SET)).toBe('1 · 2 · 1 · 1 · −1 · −1');
  });
});

describe('Pontuação (t18)', () => {
  it('PAR-10: "Vigente desde dd/mm/aaaa", a tabela "Pesos vigentes", o formulário e a nota', async () => {
    abrir({ [LER]: () => json(200, PAINEL) });
    expect(await screen.findByRole('heading', { name: 'Vigente desde 01/09/2026' })).toBeDefined();
    const tabela = screen.getByRole('table', { name: 'Pesos vigentes' });
    expect(within(tabela).getByRole('rowheader', { name: 'Presença com chuva' }).closest('tr')?.textContent).toBe('Presença com chuva2');
    expect(within(tabela).getByRole('rowheader', { name: 'Expulso sem chuva' }).closest('tr')?.textContent).toBe('Expulso sem chuva−1');
    expect(screen.getByRole('heading', { name: 'Nova configuração (vale a partir de hoje)' })).toBeDefined();
    expect(screen.getByText('Inteiros de −10 a 10. Partidas anteriores a hoje não mudam.')).toBeDefined();
    expect((screen.getByLabelText('Presença com chuva') as HTMLInputElement).value).toBe('2');
  });

  it('PAR-10: o histórico mostra uma linha por configuração anterior, mais recente primeiro', async () => {
    abrir({ [LER]: () => json(200, PAINEL) });
    const lista = await screen.findByRole('list', { name: 'Configurações anteriores' });
    const itens = within(lista).getAllByRole('listitem').map((i) => i.textContent);
    expect(itens).toEqual([
      'De 01/05/2026 a 31/08/20261 · 1 · 1 · 1 · −1 · −1 · registrado por Leandro',
      'De 05/02/2026 a 30/04/20261 · 1 · 0 · 0 · −2 · −2 · registrado por Bia',
    ]);
  });

  it('PAR-12: campo vazio mostra "Use um número inteiro de −10 a 10." ligado ao campo e não envia', async () => {
    const t = abrir({ [LER]: () => json(200, PAINEL) });
    const campo = (await screen.findByLabelText('Presença sem chuva')) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova configuração' }));
    const mensagem = await screen.findByText('Use um número inteiro de −10 a 10.');
    expect(campo.getAttribute('aria-describedby')?.split(' ')).toContain(mensagem.closest('[id]')?.id);
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/pesos')).toHaveLength(0);
  });

  it('PAR-12: valor 11 mostra a mesma mensagem e não envia', async () => {
    const t = abrir({ [LER]: () => json(200, PAINEL) });
    const campo = (await screen.findByLabelText('Expulso com chuva')) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova configuração' }));
    expect(await screen.findByText('Use um número inteiro de −10 a 10.')).toBeDefined();
    expect(campo.getAttribute('aria-invalid')).toBe('true');
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/pesos')).toHaveLength(0);
  });

  it('PAR-11: salvar envia os 6 pesos e mostra "Nova configuração vale a partir de hoje." com o painel novo', async () => {
    const t = abrir({ [LER]: () => json(200, PAINEL), [SALVAR]: () => json(200, SALVO) });
    const campo = (await screen.findByLabelText('Lesionado com chuva')) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar nova configuração' }));
    expect(await screen.findByText('Nova configuração vale a partir de hoje.')).toBeDefined();
    expect(t.chamadasA('POST', '/api/grupos/g-quinta/pesos')[0]?.corpo).toEqual({ ...PESOS_SET, lesionadoComChuva: 2 });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Vigente desde 22/10/2026' })).toBeDefined());
  });

  it('PAR-147: 422 da API mostra "Corrija 2 campos: …" e a mensagem em cada campo', async () => {
    abrir({
      [LER]: () => json(200, PAINEL),
      [SALVAR]: () =>
        json(422, {
          erro: 'Dados inválidos.',
          codigo: 'dados_invalidos',
          campos: ['presencaComChuva', 'expulsoSemChuva'],
          mensagens: { presencaComChuva: 'Use um número inteiro de -10 a 10.', expulsoSemChuva: 'Use um número inteiro de -10 a 10.' },
        }),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar nova configuração' }));
    const resumo = (await screen.findByText('Corrija 2 campos:')).closest('[role="alert"]') as HTMLElement;
    expect(within(resumo).getByRole('link', { name: 'Presença com chuva' })).toBeDefined();
    expect(within(resumo).getByRole('link', { name: 'Expulso sem chuva' })).toBeDefined();
    expect((screen.getByLabelText('Presença com chuva') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Expulso sem chuva') as HTMLInputElement).getAttribute('aria-invalid')).toBe('true');
    expect((screen.getByLabelText('Presença sem chuva') as HTMLInputElement).getAttribute('aria-invalid')).toBeNull();
  });

  it('axe sem violações', async () => {
    const { container } = abrir({ [LER]: () => json(200, PAINEL) });
    await screen.findByRole('heading', { name: 'Vigente desde 01/09/2026' });
    await esperarSemViolacoes(container);
  });
});
