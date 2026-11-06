import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela, json, pendente, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Aviso Pro no simulador e no financeiro (planos-e-cobranca T50; PLA-27): sem o recurso em `recursos` do plano, o
 * simulador mostra o `AvisoRecursoPro` no lugar do formulário; o financeiro mostra o saldo e o aviso no lugar da escrita.
 * Com o recurso, as telas seguem como antes (o controle que mostra que o aviso vem do plano). Rotas reais do app;
 * a resposta do financeiro é a do mockup (molde: `financeiro-mes.test.tsx`).
 */

function resposta(nome: string): unknown {
  return JSON.parse(
    readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        `../../../../.specs/mockup/respostas/${nome}`,
      ),
      'utf8',
    ),
  );
}

const OUTUBRO = resposta('financeiro-2026-10.json');

const PLANO_FREE = {
  plano: 'free',
  situacao: 'inadimplente',
  trialFimEm: null,
  pagoAte: null,
  jogadoresAtivos: 12,
  limiteJogadores: 20,
  somenteLeitura: null,
  recursos: ['partidas', 'ranking'],
  podeAssinar: true,
  assinatura: null,
};

const PLANO_TRIAL = {
  ...PLANO_FREE,
  plano: 'trial',
  situacao: 'trial',
  trialFimEm: '2026-11-14',
  limiteJogadores: null,
  recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
};

afterEach(() => {
  cleanup();
});

function abrir(caminho: string, plano: unknown) {
  return abrirTela(caminho, {
    'GET /api/sessao': () => json(200, SESSAO_ANA),
    'GET /api/grupos/g-quinta': () => pendente(),
    'GET /api/grupos/g-quinta/plano': () => json(200, plano),
    'GET /api/grupos/g-quinta/simulador/contexto': () =>
      json(403, { erro: 'plano_pro', recurso: 'simulador', mensagem: 'Recurso do plano Pro.' }),
    'GET /api/grupos/g-quinta/financeiro/mes': () => json(200, OUTUBRO),
  });
}

describe('aviso Pro no simulador e no financeiro (T50)', () => {
  it('PLA-27: Free no simulador mostra o aviso com "R$ 9,90/mês" e não o formulário', async () => {
    abrir('/app/grupos/g-quinta/simulador', PLANO_FREE);
    expect(
      await screen.findByRole('heading', { level: 2, name: 'Simulador de times' }),
    ).toBeDefined();
    expect(screen.getByText(/R\$\s9,90\/mês/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ver Meu plano' }).getAttribute('href')).toBe(
      '/app/grupos/g-quinta/plano',
    );
    expect(screen.queryByRole('button', { name: 'Sugerir times' })).toBeNull();
  });

  it('PLA-27: no trial, o simulador não mostra o aviso', async () => {
    abrirTela('/app/grupos/g-quinta/simulador', {
      'GET /api/sessao': () => json(200, SESSAO_ANA),
      'GET /api/grupos/g-quinta': () => pendente(),
      'GET /api/grupos/g-quinta/plano': () => json(200, PLANO_TRIAL),
      'GET /api/grupos/g-quinta/simulador/contexto': () => pendente(),
    });
    expect(await screen.findByText('Carregando os jogadores ativos…')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Simulador de times' })).toBeNull();
  });

  it('PLA-27: Free no financeiro mostra o saldo e o aviso, sem "Novo lançamento" nem "Configurar caixa"', async () => {
    abrir('/app/grupos/g-quinta/financeiro', PLANO_FREE);
    expect(await screen.findByText('R$ 1.245,50')).toBeDefined();
    expect(await screen.findByRole('heading', { level: 2, name: 'Financeiro' })).toBeDefined();
    expect(screen.getByText(/R\$\s9,90\/mês/)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'Novo lançamento' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Configurar caixa' })).toBeNull();
    // Os interruptores dos pagamentos ficam dentro do trecho bloqueado.
    const interruptores = screen.queryAllByRole('switch');
    for (const i of interruptores) expect(i.closest('fieldset[disabled]')).not.toBeNull();
  });

  it('PLA-27: no trial, o financeiro tem "Novo lançamento" e não mostra o aviso', async () => {
    abrir('/app/grupos/g-quinta/financeiro', PLANO_TRIAL);
    expect(await screen.findByRole('link', { name: 'Novo lançamento' })).toBeDefined();
    expect(screen.queryByRole('heading', { level: 2, name: 'Financeiro' })).toBeNull();
  });
});
