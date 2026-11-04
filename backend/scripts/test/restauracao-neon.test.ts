import { describe, expect, test } from 'vitest';
import { criarBranchDeRestauracao, MANTER, PREFIXO } from '../ops/restauracao-neon.ts';

interface Branch {
  id: string;
  name: string;
  created_at: string;
  parent_id?: string;
  default?: boolean;
  protected?: boolean;
}

/** Neon de mentira: guarda as branches e registra cada chamada. */
function neonFalso(inicial: Branch[], opcoes: { falharEm?: string } = {}) {
  const branches = [...inicial];
  const chamadas: { metodo: string; url: string; corpo?: unknown; auth?: string }[] = [];
  const fetchFalso: typeof fetch = (entrada, init) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    const corpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    chamadas.push({ metodo, url, corpo, auth: headers.get('authorization') ?? undefined });
    const responder = (status: number, json: unknown) =>
      Promise.resolve(new Response(JSON.stringify(json), { status }));
    if (opcoes.falharEm && `${metodo} ${url}`.includes(opcoes.falharEm)) {
      return responder(500, { message: 'falha simulada' });
    }
    if (metodo === 'GET' && url.endsWith('/branches')) return responder(200, { branches });
    if (metodo === 'POST' && url.endsWith('/branches')) {
      const nova: Branch = {
        id: `br-nova`,
        name: (corpo as { branch: { name: string } }).branch.name,
        created_at: '2026-11-04T12:00:00Z',
        parent_id: (corpo as { branch: { parent_id: string } }).branch.parent_id,
      };
      branches.push(nova);
      return responder(201, { branch: nova });
    }
    if (metodo === 'DELETE') {
      const id = url.split('/').pop();
      const i = branches.findIndex((b) => b.id === id);
      if (i >= 0) branches.splice(i, 1);
      return responder(200, {});
    }
    return responder(404, {});
  };
  return { fetchFalso, chamadas, branches };
}

const base = (extra: Branch[] = []): Branch[] => [
  { id: 'br-main', name: 'main', created_at: '2026-01-01T00:00:00Z', default: true },
  { id: 'br-dev', name: 'dev', created_at: '2026-02-01T00:00:00Z' },
  ...extra,
];
const restauracao = (n: number): Branch => ({
  id: `br-r${n}`,
  name: `${PREFIXO}${n}`,
  created_at: `2026-10-0${n}T00:00:00Z`,
});
const op = { projeto: 'proj-1', chave: 'chave-secreta', runId: '777' };

describe('criarBranchDeRestauracao', () => {
  test('FUN-42: cria a branch com o pai main e o nome do run_id, autenticada', async () => {
    const neon = neonFalso(base());
    const r = await criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso });
    expect(r.criada).toBe(`${PREFIXO}777`);
    const post = neon.chamadas.find((c) => c.metodo === 'POST');
    expect(post?.url).toBe('https://console.neon.tech/api/v2/projects/proj-1/branches');
    expect(post?.corpo).toEqual({ branch: { name: `${PREFIXO}777`, parent_id: 'br-main' } });
    expect(post?.auth).toBe('Bearer chave-secreta');
  });

  test('FUN-42: o pai pode ser outra branch pelo nome', async () => {
    const neon = neonFalso(base());
    await criarBranchDeRestauracao({ ...op, pai: 'dev', fetch: neon.fetchFalso });
    expect(neon.chamadas.find((c) => c.metodo === 'POST')?.corpo).toEqual({
      branch: { name: `${PREFIXO}777`, parent_id: 'br-dev' },
    });
  });

  test(`FUN-42: com 4 branches de restauração depois de criar, apaga as ${4 - MANTER} mais antigas`, async () => {
    expect(MANTER).toBe(2);
    const neon = neonFalso(base([restauracao(1), restauracao(2), restauracao(3)]));
    const r = await criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso });
    expect(r.apagadas).toEqual([`${PREFIXO}1`, `${PREFIXO}2`]);
    const apagadas = neon.chamadas
      .filter((c) => c.metodo === 'DELETE')
      .map((c) => c.url.split('/').pop());
    expect(apagadas).toEqual(['br-r1', 'br-r2']);
    expect(neon.branches.map((b) => b.name).sort()).toEqual(
      ['dev', 'main', `${PREFIXO}3`, `${PREFIXO}777`].sort(),
    );
  });

  test('FUN-42: nunca apaga main, dev nem branch que não seja de restauração, mesmo mais antigas', async () => {
    const neon = neonFalso([
      ...base(),
      { id: 'br-antiga', name: 'experimento-antigo', created_at: '2020-01-01T00:00:00Z' },
      { id: 'br-prot', name: `${PREFIXO}0`, created_at: '2020-01-01T00:00:00Z', protected: true },
      restauracao(1),
      restauracao(2),
    ]);
    await criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso });
    const apagadas = neon.chamadas
      .filter((c) => c.metodo === 'DELETE')
      .map((c) => c.url.split('/').pop());
    expect(apagadas).toEqual(['br-r1']);
    for (const intocada of ['br-main', 'br-dev', 'br-antiga', 'br-prot']) {
      expect(neon.branches.some((b) => b.id === intocada)).toBe(true);
    }
  });

  test('FUN-42: não apaga nada quando há até 2 branches de restauração', async () => {
    const neon = neonFalso(base([restauracao(1)]));
    const r = await criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso });
    expect(r.apagadas).toEqual([]);
    expect(neon.chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  test('FUN-42: erro da API interrompe com exceção e sem apagar nada', async () => {
    const neon = neonFalso(base([restauracao(1), restauracao(2), restauracao(3)]), {
      falharEm: 'POST',
    });
    await expect(criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso })).rejects.toThrow(
      /500/,
    );
    expect(neon.chamadas.some((c) => c.metodo === 'DELETE')).toBe(false);
  });

  test('FUN-42: erro ao apagar interrompe; a chave nunca aparece na mensagem', async () => {
    const neon = neonFalso(base([restauracao(1), restauracao(2), restauracao(3)]), {
      falharEm: 'DELETE',
    });
    const erro = await criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso }).catch(
      (e: Error) => e,
    );
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toMatch(/500/);
    expect((erro as Error).message).not.toContain(op.chave);
  });

  test('FUN-42: pai inexistente reprova antes de criar', async () => {
    const neon = neonFalso([{ id: 'br-dev', name: 'dev', created_at: '2026-02-01T00:00:00Z' }]);
    await expect(criarBranchDeRestauracao({ ...op, fetch: neon.fetchFalso })).rejects.toThrow(
      /main/,
    );
    expect(neon.chamadas.some((c) => c.metodo === 'POST')).toBe(false);
  });

  test('FUN-42: sem projeto, chave ou run_id reprova', async () => {
    const neon = neonFalso(base());
    for (const falta of ['projeto', 'chave', 'runId'] as const) {
      await expect(
        criarBranchDeRestauracao({ ...op, [falta]: '', fetch: neon.fetchFalso }),
      ).rejects.toThrow(/ausente/);
    }
  });
});
