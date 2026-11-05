import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PaginaPartidas, textoContagem, tituloDaPartida } from '../../src/telas/partidas/PaginaPartidas.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, pendente, SESSAO_ANA, type Manipulador } from '../apoio/tela.tsx';

/** Partidas do mês (partidas-e-ranking T59; PAR-42, PAR-43), a partir de `B` e do mockup t10. */

afterEach(() => {
  cleanup();
});

const rotas = () => [
  { path: '/app/grupos/:grupoId/partidas', element: <PaginaPartidas /> },
  { path: '*', element: <p>destino</p> },
];

const API = 'GET /api/grupos/g-quinta/partidas';

function mes(extra: Record<string, unknown> = {}) {
  return {
    mes: '2026-10',
    hoje: '2026-10-22',
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    partidas: [
      { data: '2026-10-15', choveu: false, contagem: { presentes: 15, lesionados: 0, expulsos: 1 } },
      { data: '2026-10-08', choveu: true, contagem: { presentes: 15, lesionados: 0, expulsos: 1 } },
    ],
    ...extra,
  };
}

function abrir(api: Record<string, Manipulador>, caminho = '/app/grupos/g-quinta/partidas') {
  return abrirTela(caminho, { 'GET /api/sessao': () => json(200, SESSAO_ANA), 'GET /api/grupos/g-quinta': () => pendente(), ...api }, rotas);
}

function metaDe(titulo: string): string {
  const item = screen.getByText(titulo).closest('a');
  return item?.querySelector('[class*="item__meta"]')?.textContent?.trim() ?? '';
}

describe('textos', () => {
  it('PAR-42: título com o dia da semana e a data; contagem P · L · E', () => {
    expect(tituloDaPartida('2026-10-15')).toBe('Quinta, 15/10/2026');
    expect(tituloDaPartida('2026-10-11')).toBe('Domingo, 11/10/2026');
    expect(tituloDaPartida('2026-10-13')).toBe('Terça, 13/10/2026');
    expect(textoContagem({ presentes: 15, lesionados: 0, expulsos: 1 })).toBe('15 P · 0 L · 1 E');
  });
});

describe('Partidas do mês (t10)', () => {
  it('PAR-42: partida com chuva mostra "chuva · 15 P · 0 L · 1 E"; sem chuva, só a contagem', async () => {
    abrir({ [API]: () => json(200, mes()) });
    await screen.findByText('Quinta, 08/10/2026');
    expect(metaDe('Quinta, 08/10/2026')).toBe('chuva · 15 P · 0 L · 1 E');
    expect(metaDe('Quinta, 15/10/2026')).toBe('15 P · 0 L · 1 E');
  });

  it('PAR-42: da mais recente para a mais antiga, cada linha abre a edição da partida', async () => {
    abrir({ [API]: () => json(200, mes()) });
    await screen.findByText('Quinta, 15/10/2026');
    const links = screen.getAllByRole('link').filter((l) => l.getAttribute('href')?.includes('/partidas/2026-'));
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/app/grupos/g-quinta/partidas/2026-10-15',
      '/app/grupos/g-quinta/partidas/2026-10-08',
    ]);
  });

  it('PAR-43: mês vazio mostra "Nenhuma partida neste mês." e "Nova partida"', async () => {
    abrir({ [API]: () => json(200, mes({ partidas: [] })) });
    expect(await screen.findByRole('heading', { name: 'Nenhuma partida neste mês.' })).toBeDefined();
    const nova = screen.getByRole('link', { name: 'Nova partida' });
    expect(nova.getAttribute('href')).toBe('/app/grupos/g-quinta/partidas/nova');
  });

  it('PAR-43: "Nova partida" também aparece com partidas no mês', async () => {
    abrir({ [API]: () => json(200, mes()) });
    await screen.findByText('Quinta, 15/10/2026');
    expect(screen.getByRole('link', { name: 'Nova partida' })).toBeDefined();
  });

  it('navegação: "Mês seguinte" desabilitado com nulo; "Mês anterior" troca o ?mes=', async () => {
    const t = abrir({ [API]: () => json(200, mes()) });
    await screen.findByRole('heading', { name: 'outubro de 2026' });
    expect((screen.getByRole('button', { name: 'Mês seguinte' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior, setembro de 2026' }));
    await waitFor(() => expect(t.local()).toBe('/app/grupos/g-quinta/partidas?mes=2026-09'));
  });

  it('o "Início" volta ao início do grupo', async () => {
    abrir({ [API]: () => json(200, mes()) });
    await screen.findByText('Quinta, 15/10/2026');
    expect(screen.getByRole('link', { name: 'Início' }).getAttribute('href')).toBe('/app/grupos/g-quinta');
  });

  it('axe sem violações', async () => {
    const { container } = abrir({ [API]: () => json(200, mes()) });
    await screen.findByText('Quinta, 15/10/2026');
    await esperarSemViolacoes(container);
  });
});
