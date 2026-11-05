import { describe, expect, it } from 'vitest';
import {
  disparar,
  ErroMedicao,
  julgar,
  lerTail,
  percentil,
  TETO_P99_MS,
  type Pedir,
} from '../src/medir-simulador.ts';

/**
 * Medição de CPU do simulador na prévia (T43 da simulador; SIM-61; AD-117). A medição em si roda contra a prévia
 * publicada, com o usuário; aqui, a análise sobre uma saída de `wrangler tail --format json` de exemplo e o disparo
 * contra uma API falsa, que prova que nada chama `escalacoes` e que a contagem do grupo é conferida.
 */

const BASE =
  'https://gestaodapelada-v2.exemplo.workers.dev/api/grupos/7f0c1a2b-3c4d-4e5f-8a6b-1c2d3e4f5a6b';

function evento(sufixo: string, cpuTime: number | undefined, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    outcome: 'ok',
    scriptName: 'gestaodapelada-v2',
    ...(cpuTime !== undefined ? { cpuTime } : {}),
    event: { request: { url: `${BASE}${sufixo}`, method: 'POST' }, response: { status: 200 } },
    ...extra,
  });
}

/** 50 eventos de cada rota, com CPU de 1 a 5 ms, mais ruído que o tail mostra. */
function tailDeExemplo(): string {
  const linhas: string[] = ['Successfully created tail, expires at 2026-11-05T20:00:00Z', ''];
  for (let i = 0; i < 50; i++) {
    const cpu = 1 + (i % 5);
    linhas.push(
      evento('/simulador/previa', cpu / 2),
      evento('/simulador/sugerir', cpu),
      evento('/simulador/avaliar', cpu),
    );
  }
  linhas.push(
    JSON.stringify({
      outcome: 'ok',
      cpuTime: 50,
      event: { request: { url: `${BASE}/partidas`, method: 'POST' } },
    }),
    JSON.stringify({
      outcome: 'ok',
      cpuTime: 50,
      event: { request: { url: `${BASE}/simulador/contexto`, method: 'GET' } },
    }),
  );
  return linhas.join('\n');
}

describe('percentil', () => {
  it('SIM-61: nearest-rank: com 50 amostras o p99 é a maior; com 100, a 99ª', () => {
    const cinquenta = Array.from({ length: 50 }, (_, i) => i + 1);
    expect(percentil(cinquenta, 99)).toBe(50);
    const cem = Array.from({ length: 100 }, (_, i) => 100 - i);
    expect(percentil(cem, 99)).toBe(99);
    expect(percentil([3], 99)).toBe(3);
  });

  it('SIM-61: sem amostras, erro em vez de um p99 inventado', () => {
    expect(() => percentil([], 99)).toThrow(ErroMedicao);
  });
});

describe('lerTail e julgar', () => {
  it('SIM-61: calcula o p99 de cada rota só com os POST das rotas medidas e ignora as linhas que não são JSON', () => {
    const r = lerTail(tailDeExemplo());
    expect(r.linhasIgnoradas).toBe(1);
    expect(r.rotas.sugerir.amostras).toHaveLength(50);
    expect(r.rotas.avaliar.amostras).toHaveLength(50);
    expect(r.rotas.previa.amostras).toHaveLength(50);
    // As linhas de 50 ms são de outra rota e do GET do contexto: ficam fora.
    expect(Math.max(...r.rotas.sugerir.amostras)).toBe(5);
    const v = julgar(r);
    expect(v.rotas.map((x) => [x.rota, x.p99, x.erros1102])).toEqual([
      ['previa', 2.5, 0],
      ['sugerir', 5, 0],
      ['avaliar', 5, 0],
    ]);
    expect(v.ok).toBe(true);
  });

  it('SIM-61: um 1102 (exceededCpu) reprova mesmo com o p99 abaixo do teto', () => {
    const texto = `${tailDeExemplo()}\n${evento('/simulador/sugerir', undefined, { outcome: 'exceededCpu' })}`;
    const r = lerTail(texto);
    expect(r.rotas.sugerir.erros1102).toBe(1);
    expect(r.rotas.sugerir.semCpu).toBe(1);
    const v = julgar(r);
    expect(v.rotas.find((x) => x.rota === 'sugerir')).toMatchObject({
      p99: 5,
      erros1102: 1,
      ok: false,
    });
    expect(v.ok).toBe(false);
  });

  it.each(['exceededMemory', 'exceededResources'])(
    'SIM-61: o outcome %s também conta como 1102',
    (outcome) => {
      const r = lerTail(evento('/simulador/avaliar', 2, { outcome }));
      expect(r.rotas.avaliar.erros1102).toBe(1);
    },
  );

  it('SIM-61: p99 igual ao teto reprova (o critério é abaixo de 7 ms)', () => {
    const linhas = Array.from({ length: 50 }, (_, i) =>
      evento('/simulador/sugerir', i === 49 ? TETO_P99_MS : 1),
    );
    const comAsOutras = [
      ...linhas,
      evento('/simulador/previa', 1),
      evento('/simulador/avaliar', 1),
    ].join('\n');
    const v = julgar(lerTail(comAsOutras));
    expect(v.rotas.find((x) => x.rota === 'sugerir')).toMatchObject({
      p99: TETO_P99_MS,
      ok: false,
    });
    expect(v.ok).toBe(false);
  });

  it('SIM-61: rota sem nenhuma amostra reprova (não há medição)', () => {
    const v = julgar(
      lerTail([evento('/simulador/previa', 1), evento('/simulador/sugerir', 1)].join('\n')),
    );
    expect(v.rotas.find((x) => x.rota === 'avaliar')).toMatchObject({
      amostras: 0,
      p99: null,
      ok: false,
    });
    expect(v.ok).toBe(false);
  });

  it('SIM-61: resposta fora do 200 numa rota medida reprova', () => {
    const erro = JSON.stringify({
      outcome: 'ok',
      cpuTime: 1,
      event: {
        request: { url: `${BASE}/simulador/sugerir`, method: 'POST' },
        response: { status: 429 },
      },
    });
    const texto = [tailDeExemplo(), erro].join('\n');
    const v = julgar(lerTail(texto));
    expect(v.rotas.find((x) => x.rota === 'sugerir')).toMatchObject({ naoOk: 1, ok: false });
  });
});

/** API falsa com 30 ativos; guarda cada pedido e pode gravar uma escalação "por engano" para provar a conferência. */
function apiFalsa(opcoes: { ativos?: number; mudaContagem?: boolean } = {}) {
  const pedidos: Array<{ caminho: string; metodo: string; corpo?: unknown }> = [];
  let usos = 0;
  const jogadores = Array.from({ length: opcoes.ativos ?? 30 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  }));
  const pedir: Pedir = async (caminho, metodo, corpo) => {
    pedidos.push({ caminho, metodo, ...(corpo !== undefined ? { corpo } : {}) });
    if (caminho.endsWith('/uso')) {
      usos++;
      const escalacoes = opcoes.mudaContagem && usos > 1 ? 1 : 0;
      return {
        status: 200,
        json: {
          semanas: [
            {
              aparelhosRanking: 3,
              pdfsExportados: 1,
              partidasLancadas: 2,
              partidasEm48h: 2,
              escalacoesConfirmadas: escalacoes,
            },
          ],
        },
      };
    }
    if (caminho.endsWith('/simulador/contexto')) {
      return { status: 200, json: { dataSugerida: '2026-11-12', hoje: '2026-11-10', jogadores } };
    }
    if (caminho.endsWith('/simulador/sugerir')) {
      const ids = jogadores.slice(0, 30).map((j) => ({ id: j.id, so1oTempo: false }));
      return {
        status: 200,
        json: {
          formato: 'dois_times',
          times: [
            { titulares: ids.slice(0, 11), entramNo2oTempo: ids.slice(22, 26) },
            { titulares: ids.slice(11, 22), entramNo2oTempo: ids.slice(26, 30) },
          ],
          naoEntra: [],
        },
      };
    }
    return { status: 200, json: {} };
  };
  return { pedir, pedidos };
}

const GRUPO = '7f0c1a2b-3c4d-4e5f-8a6b-1c2d3e4f5a6b';

describe('disparar', () => {
  it('SIM-61: dispara previa, sugerir (2 configurações) e avaliar e nunca chama escalacoes (AD-117)', async () => {
    const { pedir, pedidos } = apiFalsa();
    const r = await disparar(pedir, GRUPO, 3);
    expect(r.pedidos).toEqual({ previa: 6, sugerir: 6, avaliar: 3 });
    expect(pedidos.some((p) => p.caminho.includes('/escalacoes'))).toBe(false);
    expect(
      pedidos
        .filter((p) => p.metodo === 'POST')
        .every((p) => /\/simulador\/(previa|sugerir|avaliar)$/.test(p.caminho)),
    ).toBe(true);
    const sugerir = pedidos
      .filter((p) => p.caminho.endsWith('/sugerir'))
      .map(
        (p) =>
          p.corpo as { formato: string; n: number; k?: unknown; aptos: unknown[]; data: string },
      );
    expect(
      sugerir.map((c) => [c.formato, c.n, c.k ?? null, c.aptos.length, c.data]),
    ).toContainEqual(['dois_times', 11, 'ilimitado', 30, '2026-11-12']);
    expect(sugerir.map((c) => [c.formato, c.n, c.aptos.length])).toContainEqual([
      'varios_times',
      5,
      30,
    ]);
    expect(r.antes).toEqual(r.depois);
    expect(r.ok).toBe(true);
  });

  it('SIM-61: contagem de escalações diferente depois do disparo reprova (AD-117)', async () => {
    const { pedir } = apiFalsa({ mudaContagem: true });
    const r = await disparar(pedir, GRUPO, 1);
    expect(r.depois.escalacoes).toBe(r.antes.escalacoes + 1);
    expect(r.ok).toBe(false);
  });

  it('SIM-61: grupo com menos de 30 ativos para antes de disparar', async () => {
    const { pedir, pedidos } = apiFalsa({ ativos: 29 });
    await expect(disparar(pedir, GRUPO, 1)).rejects.toThrow(ErroMedicao);
    expect(pedidos.some((p) => p.metodo === 'POST')).toBe(false);
  });
});
