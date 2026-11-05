import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compartilhar,
  entregar,
  nomeDoArquivo,
  TITULO_PDF_PRONTO,
  type NavegadorCompartilha,
} from '../../src/pdf/entregar.ts';
import { DialogoPdfPronto } from '../../src/telas/ranking/DialogoPdfPronto.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

/**
 * Entrega do PDF (partidas-e-ranking T69; PAR-105, PAR-106), de `t01-ranking--{pdf-compartilhar,pdf-baixado}.html`.
 * O navegador e o download são dublês: o jsdom não compartilha nem baixa.
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const BLOB = new Blob(['%PDF-1.3'], { type: 'application/pdf' });
const NOME = 'ranking-pelada-de-quinta-2026-10.pdf';

function erroComNome(nome: string): Error {
  const erro = new Error(nome);
  erro.name = nome;
  return erro;
}

function navegadorQueCompartilha(
  share: (dados: ShareData) => Promise<void> = async () => undefined,
): NavegadorCompartilha & { share: ReturnType<typeof vi.fn> } {
  return {
    canShare: vi.fn((dados: ShareData) => (dados.files?.length ?? 0) > 0),
    share: vi.fn(share),
  };
}

describe('entregar', () => {
  it('PAR-106: nome do arquivo ranking-<slug>-<AAAA-MM>.pdf', () => {
    expect(nomeDoArquivo('pelada-de-quinta', '2026-10')).toBe(NOME);
  });

  it('PAR-106: sem canShare, baixa ranking-pelada-de-quinta-2026-10.pdf e não abre o diálogo', () => {
    const baixar = vi.fn();
    const r = entregar(BLOB, nomeDoArquivo('pelada-de-quinta', '2026-10'), {
      navegador: {},
      baixar,
    });
    expect(r).toEqual({ tipo: 'baixado', nome: NOME });
    expect(baixar).toHaveBeenCalledTimes(1);
    expect(baixar).toHaveBeenCalledWith(BLOB, NOME);
  });

  it('PAR-106: canShare que recusa arquivos (ou lança) também baixa', () => {
    const baixar = vi.fn();
    expect(
      entregar(BLOB, NOME, {
        navegador: { canShare: () => false, share: async () => undefined },
        baixar,
      }).tipo,
    ).toBe('baixado');
    expect(
      entregar(BLOB, NOME, {
        navegador: {
          canShare: () => {
            throw new TypeError('x');
          },
          share: async () => undefined,
        },
        baixar,
      }).tipo,
    ).toBe('baixado');
    expect(baixar).toHaveBeenCalledTimes(2);
  });

  it('PAR-105: com canShare({ files }), devolve o diálogo com o arquivo PDF e não baixa', () => {
    const baixar = vi.fn();
    const r = entregar(BLOB, NOME, { navegador: navegadorQueCompartilha(), baixar });
    expect(r.tipo).toBe('dialogo');
    if (r.tipo !== 'dialogo') return;
    expect(r.arquivo.name).toBe(NOME);
    expect(r.arquivo.type).toBe('application/pdf');
    expect(baixar).not.toHaveBeenCalled();
  });

  it('PAR-105: share rejeitado com AbortError (ou NotAllowedError) volta ao diálogo; outra falha sobe', async () => {
    const arquivo = new File([BLOB], NOME, { type: 'application/pdf' });
    const dados = { title: NOME, text: 'x' };
    expect(
      await compartilhar(
        arquivo,
        dados,
        navegadorQueCompartilha(() => Promise.reject(erroComNome('AbortError'))),
      ),
    ).toBe('dialogo');
    expect(
      await compartilhar(
        arquivo,
        dados,
        navegadorQueCompartilha(() => Promise.reject(erroComNome('NotAllowedError'))),
      ),
    ).toBe('dialogo');
    expect(await compartilhar(arquivo, dados, navegadorQueCompartilha())).toBe('compartilhado');
    await expect(
      compartilhar(
        arquivo,
        dados,
        navegadorQueCompartilha(() => Promise.reject(erroComNome('DataError'))),
      ),
    ).rejects.toThrow('DataError');
  });
});

describe('DialogoPdfPronto', () => {
  function abrir(navegador: NavegadorCompartilha) {
    const acoes = {
      aoBaixar: vi.fn(),
      aoCompartilhar: vi.fn(),
      aoFalhar: vi.fn(),
      aoFechar: vi.fn(),
    };
    const arquivo = new File([BLOB], NOME, { type: 'application/pdf' });
    const r = render(
      <DialogoPdfPronto
        arquivo={arquivo}
        mesPorExtenso="outubro de 2026"
        grupo="Pelada de Quinta"
        navegador={navegador}
        {...acoes}
      />,
    );
    return { ...r, ...acoes };
  }

  it('PAR-105: "PDF pronto." com o texto do mês e do grupo, "Baixar" e "Compartilhar"', async () => {
    const t = abrir(navegadorQueCompartilha());
    const dialogo = screen.getByRole('dialog', { name: TITULO_PDF_PRONTO });
    expect(dialogo.textContent).toContain('Ranking de outubro de 2026 da Pelada de Quinta.');
    fireEvent.click(screen.getByRole('button', { name: 'Baixar' }));
    expect(t.aoBaixar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Compartilhar' })).toBeDefined();
    await esperarSemViolacoes(t.container);
  });

  it('PAR-105: share rejeitado com AbortError volta ao diálogo, sem erro', async () => {
    const navegador = navegadorQueCompartilha(() => Promise.reject(erroComNome('AbortError')));
    const t = abrir(navegador);
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => expect(navegador.share).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Compartilhar' }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    expect(screen.getByRole('dialog', { name: TITULO_PDF_PRONTO })).toBeDefined();
    expect(t.aoCompartilhar).not.toHaveBeenCalled();
    expect(t.aoFalhar).not.toHaveBeenCalled();
    expect(t.aoFechar).not.toHaveBeenCalled();
    const enviado = navegador.share.mock.calls[0]?.[0] as ShareData;
    expect(enviado.files?.[0]?.name).toBe(NOME);
  });

  it('PAR-105: compartilhado avisa a tela; outra falha vai ao erro do PDF', async () => {
    const ok = abrir(navegadorQueCompartilha());
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => expect(ok.aoCompartilhar).toHaveBeenCalledTimes(1));
    cleanup();

    const falha = abrir(navegadorQueCompartilha(() => Promise.reject(erroComNome('DataError'))));
    fireEvent.click(screen.getByRole('button', { name: 'Compartilhar' }));
    await waitFor(() => expect(falha.aoFalhar).toHaveBeenCalledTimes(1));
    expect(falha.aoCompartilhar).not.toHaveBeenCalled();
  });
});
