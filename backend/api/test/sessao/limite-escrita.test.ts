import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { chaveConta, eEscritaDeGrupo } from '../../src/entrada/middlewares/limite-escrita.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `LIMITE_ESCRITA` por conta nas escritas de `/api/grupos*` (T23; SEC-003), com o app real como `pelada_app`
 * contra o cenário de grupos: C (criadora de G) faz o papel da conta A, e a conta B do cenário de conta, a outra.
 * O binding é falso, com cota por chave e as chaves registradas.
 */

let aberto: CenarioGruposAberto;

/** Binding falso: `cota` por chave, com contagens iniciais opcionais; guarda as chaves recebidas. */
function bindingPorChave(cota: number, jaUsadas: Record<string, number> = {}): LimiteDeTaxa & { chaves: string[] } {
  const usadas = new Map<string, number>(Object.entries(jaUsadas));
  const chaves: string[] = [];
  return {
    chaves,
    limit: async ({ key }) => {
      chaves.push(key);
      const n = (usadas.get(key) ?? 0) + 1;
      usadas.set(key, n);
      return { success: n <= cota };
    },
  };
}

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

interface Pedido {
  metodo?: string;
  token?: string;
  corpo?: unknown;
  semPelada?: boolean;
}

function montar(escrita: LimiteDeTaxa) {
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica });
  return async (caminho: string, p: Pedido = {}): Promise<Response> => {
    const headers = new Headers({ 'cf-connecting-ip': '203.0.113.60' });
    if (!p.semPelada) headers.set('x-pelada', '1');
    if (p.token) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${p.token}`);
    if (p.corpo !== undefined) headers.set('content-type', 'application/json');
    const ctx = contextoFalso();
    const r = await app.request(
      `/api${caminho}`,
      { method: p.metodo ?? 'POST', headers, ...(p.corpo !== undefined ? { body: JSON.stringify(p.corpo) } : {}) },
      envAcesso(aberto.url, { LIMITE_ESCRITA: escrita }),
      ctx,
    );
    await ctx.esperar();
    return r;
  };
}

const NOVO_GRUPO = { nome: 'Pelada do Limite', diaSemana: 'sabado', frequencia: 'semanal', horario: '09:00' };

async function gruposCriadosPor(conta: string): Promise<number> {
  const r = await aberto.db.query<{ n: string }>('SELECT count(*) AS n FROM grupos WHERE criado_por = $1', [conta]);
  return Number(r.rows[0]?.n ?? 0);
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('LIMITE_ESCRITA por conta', () => {
  it('SEC-003: a 61.ª criação de grupo da conta A na janela dá 429 com Retry-After e nada é criado', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(60, { [chaveConta(cenario.contaC)]: 60 });
    const pedir = montar(escrita);
    const antes = await gruposCriadosPor(cenario.contaC);
    const r = await pedir('/grupos', { token: await sessao(cenario.contaC), corpo: NOVO_GRUPO });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    expect(await gruposCriadosPor(cenario.contaC)).toBe(antes);
    expect(escrita.chaves).toEqual([chaveConta(cenario.contaC)]);
  });

  it('SEC-003: a conta B, na mesma janela em que A estourou, não recebe 429', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(60, { [chaveConta(cenario.contaC)]: 60 });
    const pedir = montar(escrita);
    const r = await pedir('/grupos', { token: await sessao(cenario.contaB), corpo: NOVO_GRUPO });
    expect(r.status).not.toBe(429);
    expect(escrita.chaves).toEqual([chaveConta(cenario.contaB)]);
  });

  it('SEC-003: a chave é a da conta, não a do IP (duas contas no mesmo IP têm cotas separadas)', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(1);
    const pedir = montar(escrita);
    await pedir(`/grupos/${cenario.grupoG}`, { metodo: 'PATCH', token: await sessao(cenario.contaC), corpo: {} });
    const daOutra = await pedir(`/grupos/${cenario.grupoG}`, { metodo: 'PATCH', token: await sessao(cenario.contaO), corpo: {} });
    expect(daOutra.status).not.toBe(429);
    expect(escrita.chaves).toEqual([chaveConta(cenario.contaC), chaveConta(cenario.contaO)]);
  });

  it('SEC-003: GETs da conta A não gastam a cota', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(0);
    const pedir = montar(escrita);
    const token = await sessao(cenario.contaC);
    for (const caminho of ['/grupos', `/grupos/${cenario.grupoG}`, `/grupos/${cenario.grupoG}/jogadores`]) {
      const r = await pedir(caminho, { metodo: 'GET', token });
      expect(r.status).not.toBe(429);
    }
    expect(escrita.chaves).toEqual([]);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('SEC-003: %s sob /api/grupos/:grupoId acima da cota dá 429 sem chamar a rota', async (metodo) => {
    const { cenario } = aberto;
    const pedir = montar(bindingPorChave(0));
    const nomeAntes = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [cenario.grupoG]);
    const r = await pedir(`/grupos/${cenario.grupoG}`, {
      metodo,
      token: await sessao(cenario.contaC),
      corpo: { nome: 'Nome que não pode ser gravado' },
    });
    expect(r.status).toBe(429);
    expect(r.headers.get('retry-after')).toBe('60');
    const nomeDepois = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [cenario.grupoG]);
    expect(nomeDepois.rows[0]?.nome).toBe(nomeAntes.rows[0]?.nome);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('SEC-003: %s numa rota funda do grupo (jogadores) também conta', async (metodo) => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(0);
    const pedir = montar(escrita);
    const r = await pedir(`/grupos/${cenario.grupoG}/jogadores`, { metodo, token: await sessao(cenario.contaC), corpo: {} });
    expect(r.status).toBe(429);
    expect(escrita.chaves).toEqual([chaveConta(cenario.contaC)]);
  });

  it('SEC-003: uma escrita conta uma vez só, mesmo no caminho do próprio grupo', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(10);
    const pedir = montar(escrita);
    await pedir(`/grupos/${cenario.grupoG}`, { metodo: 'PATCH', token: await sessao(cenario.contaC), corpo: {} });
    expect(escrita.chaves).toHaveLength(1);
  });

  it('SEC-003: X-Pelada é checado antes do limitador: sem ele, 403 e a cota fica intacta', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(0);
    const pedir = montar(escrita);
    const r = await pedir('/grupos', { token: await sessao(cenario.contaC), corpo: NOVO_GRUPO, semPelada: true });
    expect(r.status).toBe(403);
    expect(escrita.chaves).toEqual([]);
  });

  it('SEC-003: sem sessão o limitador não se aplica (a rota responde o seu 401)', async () => {
    const escrita = bindingPorChave(0);
    const pedir = montar(escrita);
    const r = await pedir('/grupos', { corpo: NOVO_GRUPO });
    expect(r.status).not.toBe(429);
    expect(escrita.chaves).toEqual([]);
  });

  it('SEC-003: escrita fora de /api/grupos* não usa o LIMITE_ESCRITA', async () => {
    const { cenario } = aberto;
    const escrita = bindingPorChave(0);
    const pedir = montar(escrita);
    await pedir('/sessao/sair', { token: await sessao(cenario.contaC) });
    expect(escrita.chaves).toEqual([]);
  });
});

describe('eEscritaDeGrupo', () => {
  it.each([
    ['POST', '/api/grupos', true],
    ['post', '/api/grupos/g', true],
    ['PUT', '/api/grupos/g/jogadores/j/notas/h', true],
    ['PATCH', '/api/grupos/g', true],
    ['DELETE', '/api/grupos/g/admins/c', true],
    ['GET', '/api/grupos', false],
    ['HEAD', '/api/grupos/g', false],
    ['POST', '/api/gruposx', false],
    ['POST', '/api/sessao/sair', false],
    ['POST', '/api/convites/aceitar', false],
  ] as const)('SEC-003: %s %s = %s', (metodo, caminho, esperado) => {
    expect(eEscritaDeGrupo(metodo, caminho)).toBe(esperado);
  });
});
