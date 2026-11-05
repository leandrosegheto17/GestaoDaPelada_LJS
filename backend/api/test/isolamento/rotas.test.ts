import { Buffer } from 'node:buffer';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente, conviteDeTeste, limparCaixa } from '../acesso/apoio.ts';
import { abrirCenarioConta, type CenarioContaAberto } from './cenario-conta.ts';

/**
 * Suíte de isolamento de rotas (T32; ACE-41, ACE-48). Lista as rotas registradas no Hono
 * (`app.routes`) e exige, para cada uma, um caso de isolamento (a conta B contra o grupo ou a
 * conta de A) ou um "não se aplica" com motivo. Rota nova sem linha na tabela reprova.
 */

let aberto: CenarioContaAberto;
let pedir: ReturnType<typeof cliente>;
let sessaoA: string;
let sessaoB: string;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

beforeAll(async () => {
  aberto = await abrirCenarioConta();
  pedir = cliente(aberto.url);
  sessaoA = await sessao(aberto.cenario.contaA);
  sessaoB = await sessao(aberto.cenario.contaB);
});

afterAll(async () => {
  await aberto?.fechar();
});

/** O que do grupo e da conta de A uma rota da conta B não pode mudar. */
async function retratoDeA(): Promise<string> {
  const { db, cenario } = aberto;
  const partes = await Promise.all([
    db.query('SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id', [cenario.grupoA]),
    // O convite do caso de aceitar é do próprio teste e fica fora do retrato.
    db.query(
      `SELECT id, email, usado_em, cancelado_em FROM convites_admin
        WHERE grupo_id = $1 AND email <> 'isolamento@exemplo.test' ORDER BY id`,
      [cenario.grupoA],
    ),
    db.query('SELECT nome, arquivado_em FROM grupos WHERE id = $1', [cenario.grupoA]),
    db.query('SELECT nome, email, senha_hash, excluida_em FROM contas WHERE id = $1', [cenario.contaA]),
    db.query('SELECT count(*)::int AS n FROM sessoes WHERE conta_id = $1', [cenario.contaA]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

type Linha = { caso: () => Promise<void> } | { naoSeAplica: string };

const SEM_SESSAO = 'rota sem sessão: age só pelo token ou pelo e-mail do corpo, não por conta nem grupo';

/** Uma linha por rota do Hono (`MÉTODO caminho`). */
const TABELA: Record<string, Linha> = {
  'GET /api/health': { naoSeAplica: 'rota pública de saúde, sem dado de conta nem de grupo' },
  'GET /api/dev/emails': { naoSeAplica: 'só existe com EMAIL_DEV=1, em dev e no e2e (T17)' },
  'POST /api/conta': { naoSeAplica: SEM_SESSAO },
  'POST /api/conta/confirmar': { naoSeAplica: SEM_SESSAO },
  'POST /api/conta/reenviar-confirmacao': { naoSeAplica: SEM_SESSAO },
  'POST /api/sessao/entrar': { naoSeAplica: SEM_SESSAO },
  'POST /api/sessao/esqueci-senha': { naoSeAplica: SEM_SESSAO },
  'POST /api/sessao/nova-senha': { naoSeAplica: SEM_SESSAO },
  'POST /api/convites/ler': { naoSeAplica: SEM_SESSAO },
  'POST /api/convites/cadastrar': { naoSeAplica: SEM_SESSAO },
  'GET /api/sessao': {
    caso: async () => {
      const r = await pedir('/sessao', { sessao: sessaoB });
      const corpo = (await r.json()) as { id: string; grupos: Array<{ id: string }> };
      expect(corpo.id).toBe(aberto.cenario.contaB);
      expect(corpo.grupos.map((g) => g.id)).not.toContain(aberto.cenario.grupoA);
    },
  },
  'POST /api/sessao/sair': {
    caso: async () => {
      expect((await pedir('/sessao/sair', { metodo: 'POST', sessao: sessaoB })).status).toBe(204);
      // A sessão de A continua valendo.
      expect((await pedir('/sessao', { sessao: sessaoA })).status).toBe(200);
      sessaoB = await sessao(aberto.cenario.contaB);
    },
  },
  'POST /api/conta/senha': {
    caso: async () => {
      // A conta B, com a senha de A, não troca senha nenhuma (a função só vê a conta da sessão).
      const r = await pedir('/conta/senha', { corpo: { senhaAtual: aberto.cenario.senhaA, senhaNova: 'outra senha 123' }, sessao: sessaoB });
      expect(r.status).toBe(401);
    },
  },
  'POST /api/conta/excluir': {
    caso: async () => {
      const r = await pedir('/conta/excluir', { corpo: { senha: aberto.cenario.senhaA }, sessao: sessaoB });
      expect(r.status).toBe(401);
    },
  },
  'POST /api/convites/aceitar': {
    caso: async () => {
      // Convite do grupo A para outro e-mail: B não vira admin de A.
      const token = await conviteDeTeste(aberto.db, aberto.cenario.grupoA, 'isolamento@exemplo.test', aberto.cenario.contaA);
      const r = await pedir('/convites/aceitar', { corpo: { token }, sessao: sessaoB });
      expect(r.status).toBe(403);
      await aberto.db.query(`UPDATE convites_admin SET cancelado_em = now() WHERE email = 'isolamento@exemplo.test'`);
    },
  },
  'GET /api/grupos/:grupoId/admins': {
    caso: async () => {
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins`, { sessao: sessaoB });
      expect(r.status).toBe(404);
      expect(await r.text()).not.toContain(aberto.cenario.emailA);
    },
  },
  'POST /api/grupos/:grupoId/admins/convites': {
    caso: async () => {
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/convites`, { corpo: { email: 'intrusa@exemplo.test' }, sessao: sessaoB });
      expect(r.status).toBe(404);
    },
  },
  'DELETE /api/grupos/:grupoId/admins/convites/:id': {
    caso: async () => {
      const c = await aberto.db.query<{ id: string }>('SELECT id FROM convites_admin WHERE grupo_id = $1 LIMIT 1', [aberto.cenario.grupoA]);
      const id = c.rows[0]?.id ?? '00000000-0000-4000-8000-000000000000';
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/convites/${id}`, { metodo: 'DELETE', sessao: sessaoB });
      expect(r.status).toBe(404);
    },
  },
  'DELETE /api/grupos/:grupoId/admins/:contaId': {
    caso: async () => {
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/${aberto.cenario.contaA}`, { metodo: 'DELETE', sessao: sessaoB });
      expect(r.status).toBe(404);
    },
  },
};

/** As rotas com handler do app, como `MÉTODO caminho`, sem os middlewares (`ALL`) e sem repetição. */
function rotasDoApp(app: Hono<Ambiente>): string[] {
  const chaves = app.routes.filter((r) => r.method !== 'ALL').map((r) => `${r.method} ${r.path}`);
  return [...new Set(chaves)].sort();
}

/** As rotas do app sem linha na tabela. */
function rotasSemLinha(app: Hono<Ambiente>, tabela: Record<string, Linha>): string[] {
  return rotasDoApp(app).filter((r) => !(r in tabela));
}

describe('isolamento de rotas', () => {
  it('ACE-48: toda rota do app.routes tem caso ou "não se aplica" com motivo', () => {
    const app = criarApp();
    expect(rotasSemLinha(app, TABELA)).toEqual([]);
    for (const [rota, linha] of Object.entries(TABELA)) {
      if ('naoSeAplica' in linha) expect(linha.naoSeAplica.length, rota).toBeGreaterThan(10);
    }
  });

  it('ACE-48: a tabela não tem linha de rota que não existe mais', () => {
    const rotas = new Set(rotasDoApp(criarApp()));
    expect(Object.keys(TABELA).filter((r) => !rotas.has(r))).toEqual([]);
  });

  it('ACE-48: uma rota de teste nova sem caso reprova', () => {
    const app = criarApp({ registrarExtras: (api) => api.get('/teste/rota-nova', (c) => c.json({ ok: true })) });
    expect(rotasSemLinha(app, TABELA)).toEqual(['GET /api/teste/rota-nova']);
  });

  const casos = Object.entries(TABELA).filter((e): e is [string, { caso: () => Promise<void> }] => 'caso' in e[1]);

  it.each(casos)('ACE-41: %s com a conta B não muda nada do grupo nem da conta de A', async (_rota, linha) => {
    limparCaixa();
    await aberto.db.query('DELETE FROM pedidos_email_origem');
    const antes = await retratoDeA();
    await linha.caso();
    expect(await retratoDeA()).toBe(antes);
  });
});
