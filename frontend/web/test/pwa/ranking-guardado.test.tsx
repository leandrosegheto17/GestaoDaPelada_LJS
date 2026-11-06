import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, renderHook, screen, waitFor, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarCliente } from '../../src/dados/cliente.ts';
import { ProvedorCliente } from '../../src/dados/ContextoCliente.tsx';
import { useRankingPublico } from '../../src/dados/publico.ts';
import { chavesLocais, idDoAparelho } from '../../src/pwa/armazenamento/armazenamento-local.ts';
import {
  chavePermitida,
  chaveRanking,
  guardarRanking,
  lerRankingGuardado,
  limparChavesNaoPermitidas,
} from '../../src/pwa/armazenamento/ranking-guardado.ts';
import { abrirTela, erroApi, json, SESSAO_ANA } from '../apoio/tela.tsx';

/**
 * Guardado local do ranking (partidas-e-ranking T72; PAR-148, PAR-154; P23 e P24 de `BC:35-36`). O `localStorage` do
 * jsdom é limpo antes e depois de cada teste.
 */

const SLUG = 'pelada-de-quinta';

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function ranking(mes: string, extra: Record<string, unknown> = {}) {
  return {
    grupo: {
      nome: 'Pelada de Quinta',
      slug: SLUG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    },
    mes,
    hoje: '2026-10-22',
    geradoEm: '2026-10-16T01:30:00.000Z',
    pdfLiberado: true,
    navegacao: { mesAnterior: '2026-09', mesSeguinte: null },
    resumoMes: { partidas: 1, comChuva: 0 },
    partidas: [{ data: `${mes}-15`, choveu: false }],
    linhas: [
      {
        posicao: 1,
        apelido: 'Beto',
        ptsInicial: 3,
        rodadas: [{ situacao: 'presente', pontos: 1 }],
        ptsFinal: 4,
      },
    ],
    ...extra,
  };
}

function montar(mes: string | undefined, responder: (url: string) => Response) {
  const fetch = (async (url: string | URL | Request) =>
    responder(String(url))) as unknown as typeof globalThis.fetch;
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const cliente = criarCliente({ consultas, navegar: () => undefined, fetch });
  const envoltorio = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={consultas}>
        <ProvedorCliente cliente={cliente}>{children}</ProvedorCliente>
      </QueryClientProvider>
    </MemoryRouter>
  );
  return renderHook(() => useRankingPublico(SLUG, mes), { wrapper: envoltorio });
}

describe('gravar', () => {
  it('PAR-148: carregar outubro sem ?mes= grava a chave do mês e a :atual, com o geradoEm', async () => {
    const t = montar(undefined, () => json(200, ranking('2026-10')));
    await waitFor(() => expect(t.result.current.isSuccess).toBe(true));
    expect(chavesLocais().sort()).toEqual([
      `pelada:ranking:${SLUG}:2026-10`,
      `pelada:ranking:${SLUG}:atual`,
    ]);
    const doMes = JSON.parse(
      window.localStorage.getItem(chaveRanking(SLUG, '2026-10')) ?? 'null',
    ) as { geradoEm: string };
    expect(doMes.geradoEm).toBe('2026-10-16T01:30:00.000Z');
    expect(window.localStorage.getItem(chaveRanking(SLUG, undefined))).toBe(
      window.localStorage.getItem(chaveRanking(SLUG, '2026-10')),
    );
  });

  it('PAR-148: com ?mes=2026-09, grava só a chave de setembro', async () => {
    const t = montar('2026-09', () => json(200, ranking('2026-09')));
    await waitFor(() => expect(t.result.current.isSuccess).toBe(true));
    expect(chavesLocais()).toEqual([`pelada:ranking:${SLUG}:2026-09`]);
  });

  it('PAR-148: resposta de erro ou fora do contrato não grava nada', async () => {
    const erro = montar(undefined, () => json(500, { erro: 'x', codigo: 'erro_interno' }));
    await waitFor(() => expect(erro.result.current.isError).toBe(true));
    const fora = montar('2026-08', () => json(200, ranking('2026-08', { telefone: '1' })));
    await waitFor(() => expect(fora.result.current.isError).toBe(true));
    expect(chavesLocais()).toEqual([]);
  });

  it('PAR-148: a leitura devolve o guardado do mês e o do atual', () => {
    const dados = ranking('2026-10');
    guardarRanking(SLUG, undefined, dados as never);
    expect(lerRankingGuardado(SLUG, '2026-10')).toEqual(dados);
    expect(lerRankingGuardado(SLUG, undefined)).toEqual(dados);
    expect(lerRankingGuardado(SLUG, '2026-09')).toBeNull();
    expect(lerRankingGuardado('outro-grupo', undefined)).toBeNull();
  });
});

describe('validar ao ler', () => {
  it('PAR-154: guardado com campo extra é descartado e removido', () => {
    window.localStorage.setItem(
      chaveRanking(SLUG, '2026-10'),
      JSON.stringify(ranking('2026-10', { telefone: '11999990000' })),
    );
    expect(lerRankingGuardado(SLUG, '2026-10')).toBeNull();
    expect(window.localStorage.getItem(chaveRanking(SLUG, '2026-10'))).toBeNull();
  });

  it('PAR-154: campo extra dentro da linha (jogadorId) também descarta', () => {
    const comId = ranking('2026-10');
    (comId.linhas[0] as Record<string, unknown>).jogadorId = 'j-beto';
    window.localStorage.setItem(chaveRanking(SLUG, undefined), JSON.stringify(comId));
    expect(lerRankingGuardado(SLUG, undefined)).toBeNull();
    expect(window.localStorage.getItem(chaveRanking(SLUG, undefined))).toBeNull();
  });

  it('PAR-154: JSON quebrado, forma errada e slug ou mês trocados são descartados e removidos', () => {
    window.localStorage.setItem(chaveRanking(SLUG, '2026-10'), '{quebrado');
    expect(lerRankingGuardado(SLUG, '2026-10')).toBeNull();
    window.localStorage.setItem(chaveRanking(SLUG, '2026-09'), JSON.stringify({ linhas: [] }));
    expect(lerRankingGuardado(SLUG, '2026-09')).toBeNull();
    window.localStorage.setItem(chaveRanking(SLUG, '2026-08'), JSON.stringify(ranking('2026-07')));
    expect(lerRankingGuardado(SLUG, '2026-08')).toBeNull();
    window.localStorage.setItem(
      chaveRanking(SLUG, '2026-06'),
      JSON.stringify({
        ...ranking('2026-06'),
        grupo: { ...ranking('2026-06').grupo, slug: 'outro' },
      }),
    );
    expect(lerRankingGuardado(SLUG, '2026-06')).toBeNull();
    expect(chavesLocais()).toEqual([]);
  });
});

describe('o que o aparelho guarda', () => {
  it('PAR-154: só as 4 formas de chave são permitidas', () => {
    expect(chavePermitida('pelada:dispositivo')).toBe(true);
    expect(chavePermitida('pelada.aviso-instalar-iphone')).toBe(true);
    expect(chavePermitida(`pelada:ranking:${SLUG}:2026-10`)).toBe(true);
    expect(chavePermitida(`pelada:ranking:${SLUG}:atual`)).toBe(true);
    expect(chavePermitida('pelada:sessao')).toBe(false);
    expect(chavePermitida(`pelada:ranking:${SLUG}:2026-10:admin`)).toBe(false);
    window.localStorage.setItem('pelada:sessao', 'x');
    limparChavesNaoPermitidas();
    expect(chavesLocais()).toEqual([]);
  });

  it('PAR-154: depois de abrir o ranking e entrar como admin, nenhuma chave nova além das 4 permitidas', async () => {
    idDoAparelho();
    let logado = false;
    const t = abrirTela('/entrar', {
      'POST /api/sessao/entrar': () => {
        logado = true;
        return json(200, { nome: 'Ana', email: 'ana@exemplo.test' });
      },
      'GET /api/sessao': () => (logado ? json(200, SESSAO_ANA) : erroApi(401, 'sem_sessao')),
      [`GET /api/publico/${SLUG}/ranking`]: () => json(200, ranking('2026-10')),
    });
    await t.roteador.navigate(`/g/${SLUG}`);
    await waitFor(() =>
      expect(window.localStorage.getItem(chaveRanking(SLUG, undefined))).not.toBeNull(),
    );
    await t.roteador.navigate('/entrar');
    fireEvent.change(await screen.findByLabelText('E-mail'), {
      target: { value: 'ana@exemplo.test' },
    });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaForte123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(t.local()).toBe('/app'));
    await new Promise((r) => setTimeout(r, 30));

    const chaves = chavesLocais();
    expect(chaves.length).toBeGreaterThan(0);
    expect(chaves.filter((c) => !chavePermitida(c))).toEqual([]);
    const tudo = chaves.map((c) => window.localStorage.getItem(c) ?? '').join('\n');
    expect(tudo).not.toContain('ana@exemplo.test');
    expect(tudo).not.toContain('c-ana');
    expect(tudo).not.toContain('SenhaForte123');
  });
});
