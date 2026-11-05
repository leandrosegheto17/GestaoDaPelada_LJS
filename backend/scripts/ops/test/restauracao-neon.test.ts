import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  API_NEON,
  criarBranchRestauracao,
  ErroNeon,
  paraApagar,
  type BranchNeon,
  type Buscar,
} from '../restauracao-neon.ts';

/**
 * Branch de restauração (FUN-42, AD-119), com `fetch` simulado: cria a branch a partir da `main`
 * com o nome do `run_id`, mantém só as 2 de restauração mais recentes e nunca apaga outra.
 */

interface Chamada {
  metodo: string;
  url: string;
  corpo?: unknown;
  autorizacao?: string;
}

const CHAVE = 'chave-falsa-do-neon';

function branch(
  id: string,
  name: string,
  created_at: string,
  extra: Partial<BranchNeon> = {},
): BranchNeon {
  return { id, name, created_at, ...extra };
}

/** API do Neon falsa: lista as branches dadas, cria e apaga, e registra cada chamada. */
function neonFalso(branches: BranchNeon[], falhar?: { metodo: string; status: number }) {
  const chamadas: Chamada[] = [];
  const buscar: Buscar = async (url, init) => {
    const metodo = init?.method ?? 'GET';
    const corpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const cabecalhos = new Headers(init?.headers);
    chamadas.push({
      metodo,
      url,
      corpo,
      autorizacao: cabecalhos.get('Authorization') ?? undefined,
    });
    if (falhar?.metodo === metodo)
      return new Response(JSON.stringify({ message: 'erro' }), { status: falhar.status });
    if (metodo === 'GET') return Response.json({ branches });
    if (metodo === 'POST') {
      const pedido = corpo as { branch: { name: string; parent_id: string } };
      return Response.json(
        {
          branch: branch('br-nova', pedido.branch.name, '2026-11-05T12:00:00Z', {
            parent_id: pedido.branch.parent_id,
          }),
        },
        { status: 201 },
      );
    }
    return Response.json({ branch: {} });
  };
  return { buscar, chamadas };
}

const MAIN = branch('br-main', 'main', '2026-01-01T00:00:00Z', { default: true });
const DEV = branch('br-dev', 'dev', '2026-02-01T00:00:00Z');

describe('branch de restauração no Neon', () => {
  it('FUN-42: cria a branch com o pai main e o nome do run_id', async () => {
    const { buscar, chamadas } = neonFalso([MAIN, DEV]);
    const r = await criarBranchRestauracao({
      apiKey: CHAVE,
      projeto: 'proj-abc',
      runId: '987654',
      buscar,
    });

    const post = chamadas.find((c) => c.metodo === 'POST');
    expect(post?.url).toBe(`${API_NEON}/projects/proj-abc/branches`);
    expect(post?.corpo).toEqual({ branch: { name: 'restauracao-987654', parent_id: 'br-main' } });
    expect(post?.autorizacao).toBe(`Bearer ${CHAVE}`);
    expect(r.criada.name).toBe('restauracao-987654');
    expect(r.apagadas).toEqual([]);
    expect(chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  it('FUN-42: o pai é a main mesmo quando a dev é mais nova ou é a padrão', async () => {
    const { buscar, chamadas } = neonFalso([
      branch('br-main', 'main', '2026-01-01T00:00:00Z'),
      branch('br-dev', 'dev', '2026-03-01T00:00:00Z', { default: true }),
    ]);
    await criarBranchRestauracao({ apiKey: CHAVE, projeto: 'p', runId: '1', buscar });
    expect(
      (chamadas.find((c) => c.metodo === 'POST')?.corpo as { branch: { parent_id: string } }).branch
        .parent_id,
    ).toBe('br-main');
  });

  it('FUN-42: com 4 branches de restauração, apaga as 2 mais antigas e nunca main, dev nem outra', async () => {
    const existentes = [
      MAIN,
      DEV,
      branch('br-r1', 'restauracao-1', '2026-11-01T00:00:00Z'),
      branch('br-r2', 'restauracao-2', '2026-11-02T00:00:00Z'),
      branch('br-r3', 'restauracao-3', '2026-11-03T00:00:00Z'),
      branch('br-outra', 'experimento', '2025-01-01T00:00:00Z'),
      branch('br-prot', 'restauracao-protegida', '2025-06-01T00:00:00Z', { protected: true }),
    ];
    const { buscar, chamadas } = neonFalso(existentes);
    const r = await criarBranchRestauracao({ apiKey: CHAVE, projeto: 'p', runId: '4', buscar });

    // Depois de criar a restauracao-4 são 4 de restauração: ficam a 4 e a 3.
    const apagadas = chamadas
      .filter((c) => c.metodo === 'DELETE')
      .map((c) => c.url.split('/').pop());
    expect(apagadas.sort()).toEqual(['br-r1', 'br-r2']);
    expect(r.apagadas.sort()).toEqual(['restauracao-1', 'restauracao-2']);
    for (const intocavel of ['br-main', 'br-dev', 'br-outra', 'br-prot', 'br-r3', 'br-nova']) {
      expect(apagadas).not.toContain(intocavel);
    }
  });

  it('FUN-42: a seleção nunca escolhe main, dev, a padrão ou a protegida, mesmo com o prefixo', () => {
    const lista = [
      branch('a', 'restauracao-x', '2020-01-01T00:00:00Z', { default: true }),
      branch('b', 'restauracao-y', '2020-01-02T00:00:00Z', { protected: true }),
      branch('c', 'main', '2019-01-01T00:00:00Z'),
      branch('d', 'dev', '2019-01-01T00:00:00Z'),
    ];
    expect(paraApagar(lista, 0)).toEqual([]);
  });

  for (const metodo of ['GET', 'POST', 'DELETE']) {
    it(`FUN-42: erro da API no ${metodo} interrompe com ErroNeon, sem a chave na mensagem`, async () => {
      const existentes = [
        MAIN,
        ...[1, 2, 3].map((n) => branch(`br-r${n}`, `restauracao-${n}`, `2026-11-0${n}T00:00:00Z`)),
      ];
      const { buscar } = neonFalso(existentes, { metodo, status: 500 });
      const promessa = criarBranchRestauracao({ apiKey: CHAVE, projeto: 'p', runId: '9', buscar });
      await expect(promessa).rejects.toThrow(ErroNeon);
      await expect(promessa).rejects.toThrow(/500/);
      await expect(promessa).rejects.not.toThrow(new RegExp(CHAVE));
    });
  }

  it('FUN-42: sem a branch main no projeto, interrompe sem criar nada', async () => {
    const { buscar, chamadas } = neonFalso([DEV]);
    await expect(
      criarBranchRestauracao({ apiKey: CHAVE, projeto: 'p', runId: '1', buscar }),
    ).rejects.toThrow(/main/);
    expect(chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  it('FUN-42: na linha de comando, sem as variáveis, sai com código diferente de 0', () => {
    const r = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '..', 'restauracao-neon.ts')],
      {
        env: { PATH: process.env.PATH ?? '' },
        encoding: 'utf8',
      },
    );
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/NEON_API_KEY/);
  });
});
