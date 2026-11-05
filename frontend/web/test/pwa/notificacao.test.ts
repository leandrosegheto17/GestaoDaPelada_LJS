// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  destinoDoClique,
  ICONE_NOTIFICACAO,
  montarNotificacao,
  NOTIFICACAO_GENERICA,
  type EscopoNotificacoes,
  type JanelaCliente,
  type OpcoesNotificacao,
} from '../../src/pwa/notificacao.ts';
import { registrarEventos } from '../../src/pwa/servico.ts';

/**
 * Service worker: push e clique na notificação (notificacoes T34; NOT-35, NOT-36, NOT-37, NOT-48, NOT-66). O escopo do
 * SW é falso: `showNotification`, `clients.matchAll`, `openWindow` e `focus` gravam as chamadas.
 */

const ORIGEM = 'https://pelada.exemplo.test';
const GRUPO = '0f1e2d3c-4b5a-4968-8776-655443322110';

const payloadRanking = (slug = 'pelada-de-quinta', mes = '2026-11') =>
  JSON.stringify({
    titulo: 'Ranking atualizado',
    texto: 'Pelada de Quinta: partida de 5/11',
    caminho: `/g/${slug}?mes=${mes}`,
  });
const payloadCobranca = () =>
  JSON.stringify({
    titulo: 'Pagamento atrasado: Pelada de Quinta',
    caminho: `/app/grupos/${GRUPO}/plano`,
  });

function escopoFalso(janelas: JanelaCliente[] = []) {
  const mostradas: Array<{ titulo: string; opcoes: OpcoesNotificacao }> = [];
  const abertas: string[] = [];
  const escopo: EscopoNotificacoes = {
    registration: {
      showNotification: async (titulo, opcoes) => {
        mostradas.push({ titulo, opcoes });
      },
    },
    clients: {
      matchAll: async () => janelas,
      openWindow: async (url) => {
        abertas.push(url);
      },
    },
    location: { origin: ORIGEM },
  };
  return { escopo, mostradas, abertas };
}

function ouvintes(escopo: EscopoNotificacoes) {
  const mapa = new Map<string, (evento: unknown) => void>();
  registrarEventos(
    {
      addEventListener: (tipo, ouvinte) => {
        mapa.set(tipo, ouvinte);
      },
    },
    escopo,
  );
  return mapa;
}

/** Dispara o evento e espera o que ele pôs no `waitUntil`. */
async function disparar(ouvinte: ((e: unknown) => void) | undefined, evento: object) {
  const esperas: Promise<unknown>[] = [];
  ouvinte?.({ ...evento, waitUntil: (p: Promise<unknown>) => esperas.push(p) });
  await Promise.all(esperas);
  return esperas.length;
}

const eventoPush = (texto: string | null) => ({
  data: texto === null ? null : { text: () => texto },
});

describe('push (NOT-35, NOT-36, NOT-66)', () => {
  it('NOT-35: o payload do ranking mostra título, texto, ícone do app e tag = slug', async () => {
    const { escopo, mostradas } = escopoFalso();
    await disparar(ouvintes(escopo).get('push'), eventoPush(payloadRanking()));
    expect(mostradas).toEqual([
      {
        titulo: 'Ranking atualizado',
        opcoes: {
          body: 'Pelada de Quinta: partida de 5/11',
          icon: ICONE_NOTIFICACAO,
          badge: ICONE_NOTIFICACAO,
          tag: 'pelada-de-quinta',
          data: { caminho: '/g/pelada-de-quinta?mes=2026-11', tipo: 'ranking' },
        },
      },
    ]);
  });

  it('NOT-35, NOT-66: dois push do mesmo grupo chamam showNotification com a mesma tag', async () => {
    const { escopo, mostradas } = escopoFalso();
    const push = ouvintes(escopo).get('push');
    await disparar(push, eventoPush(payloadRanking('pelada-de-quinta', '2026-10')));
    await disparar(push, eventoPush(payloadRanking('pelada-de-quinta', '2026-11')));
    expect(mostradas.map((m) => m.opcoes.tag)).toEqual(['pelada-de-quinta', 'pelada-de-quinta']);
  });

  it('NOT-48: o push da cobrança tem tag cobranca-<grupoId>, sem texto', async () => {
    const { escopo, mostradas } = escopoFalso();
    await disparar(ouvintes(escopo).get('push'), eventoPush(payloadCobranca()));
    expect(mostradas[0]?.opcoes.tag).toBe(`cobranca-${GRUPO}`);
    expect(mostradas[0]?.opcoes.body).toBeUndefined();
    expect(mostradas[0]?.opcoes.data).toEqual({
      caminho: `/app/grupos/${GRUPO}/plano`,
      tipo: 'cobranca',
    });
  });

  it.each([
    ['texto que não é JSON', 'não é json'],
    ['JSON sem título', JSON.stringify({ caminho: '/g/x' })],
    ['JSON que não é objeto', '42'],
    ['caminho fora do formato', JSON.stringify({ titulo: 'Ranking atualizado', caminho: '/x' })],
    ['sem dado', null],
  ])('NOT-36: %s mostra a notificação genérica, nunca nenhuma', async (_nome, texto) => {
    const { escopo, mostradas } = escopoFalso();
    const esperas = await disparar(ouvintes(escopo).get('push'), eventoPush(texto));
    expect(esperas).toBe(1);
    expect(mostradas).toEqual([NOTIFICACAO_GENERICA]);
    expect(mostradas[0]?.titulo).toBe('Ranking atualizado');
  });

  it('NOT-36: o text() que lança também dá a genérica', async () => {
    const { escopo, mostradas } = escopoFalso();
    await disparar(ouvintes(escopo).get('push'), {
      data: {
        text: () => {
          throw new Error('ilegível');
        },
      },
    });
    expect(mostradas).toEqual([NOTIFICACAO_GENERICA]);
  });

  it('FUN-34: sem escopo e com evento vazio, os handlers não lançam', () => {
    const mapa = new Map<string, (e: unknown) => void>();
    registrarEventos({ addEventListener: (t, o) => void mapa.set(t, o) });
    for (const tipo of ['push', 'notificationclick']) {
      expect(() => mapa.get(tipo)?.({})).not.toThrow();
      expect(() => mapa.get(tipo)?.(undefined)).not.toThrow();
    }
  });
});

describe('clique (NOT-37, NOT-48)', () => {
  const ranking = (caminho: string) => ({ caminho, tipo: 'ranking' });

  it.each([
    ['//mal.example', ranking('//mal.example')],
    ['https://mal.example/g/x', ranking('https://mal.example/g/x')],
    ['/g/../x', ranking('/g/../x')],
    ['/g/./x', ranking('/g/./x')],
    ['javascript:', ranking('javascript:alert(1)')],
    ['/g/\\mal', ranking('/g/\\mal')],
    ['/app/ vindo do ranking', ranking(`/app/grupos/${GRUPO}/plano`)],
    ['/g/ vindo da cobrança', { caminho: '/g/pelada', tipo: 'cobranca' }],
    ['tipo desconhecido', { caminho: '/g/pelada', tipo: 'outro' }],
    ['sem dados', undefined],
  ])('NOT-37, NOT-48: %s abre /', (_nome, dados) => {
    expect(destinoDoClique(dados, ORIGEM)).toBe('/');
  });

  it('NOT-37: /g/slug?mes=2026-11 do ranking é o destino', () => {
    expect(destinoDoClique(ranking('/g/slug?mes=2026-11'), ORIGEM)).toBe('/g/slug?mes=2026-11');
  });

  it('NOT-48: /app/grupos/<id>/plano da cobrança é o destino', () => {
    const caminho = `/app/grupos/${GRUPO}/plano`;
    expect(destinoDoClique({ caminho, tipo: 'cobranca' }, ORIGEM)).toBe(caminho);
  });

  it('NOT-37: sem janela no destino, fecha a notificação e abre o caminho', async () => {
    const { escopo, abertas } = escopoFalso();
    const fechar = vi.fn();
    await disparar(ouvintes(escopo).get('notificationclick'), {
      notification: { close: fechar, data: ranking('/g/slug?mes=2026-11') },
    });
    expect(fechar).toHaveBeenCalledOnce();
    expect(abertas).toEqual(['/g/slug?mes=2026-11']);
  });

  it('NOT-37: com uma janela já no destino, foca nela e não abre outra', async () => {
    const focar = vi.fn(async () => undefined);
    const outra = vi.fn(async () => undefined);
    const { escopo, abertas } = escopoFalso([
      { url: `${ORIGEM}/app`, focus: outra },
      { url: `${ORIGEM}/g/slug?mes=2026-11`, focus: focar },
    ]);
    await disparar(ouvintes(escopo).get('notificationclick'), {
      notification: { close: () => undefined, data: ranking('/g/slug?mes=2026-11') },
    });
    expect(focar).toHaveBeenCalledOnce();
    expect(outra).not.toHaveBeenCalled();
    expect(abertas).toEqual([]);
  });

  it('NOT-37: caminho perigoso abre / mesmo com o clique', async () => {
    const { escopo, abertas } = escopoFalso();
    await disparar(ouvintes(escopo).get('notificationclick'), {
      notification: { close: () => undefined, data: ranking('//mal.example') },
    });
    expect(abertas).toEqual(['/']);
  });
});

describe('montarNotificacao', () => {
  it('NOT-36: caminho de cobrança com o título do ranking dá a genérica', () => {
    const texto = JSON.stringify({
      titulo: 'Ranking atualizado',
      caminho: `/app/grupos/${GRUPO}/plano`,
    });
    expect(montarNotificacao(texto)).toEqual(NOTIFICACAO_GENERICA);
  });
});
