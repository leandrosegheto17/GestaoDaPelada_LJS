import { Buffer } from 'node:buffer';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ambiente } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente, conviteDeTeste, limparCaixa } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from './cenario-grupos.ts';

/**
 * Suíte de isolamento de rotas (T32; ACE-41, ACE-48). Lista as rotas registradas no Hono
 * (`app.routes`) e exige, para cada uma, um caso de isolamento (a conta B contra o grupo ou a
 * conta de A) ou um "não se aplica" com motivo. Rota nova sem linha na tabela reprova.
 *
 * grupos-e-elenco T50 (GEL-106 a GEL-108): o cenário passa a ser o de grupos, que estende o de conta sem mudar nada
 * dele (C = A, H = grupo B), e a tabela ganha as rotas de grupo e elenco (`ROTAS_DE_GRUPO`). Em cada uma, a conta B
 * com o id de G dá 404 (GEL-107); nas que levam id de jogador, período ou habilidade, a conta C com G na rota e o id
 * de H também dá 404, e a conta B com H na rota e o id de G também (GEL-108). Cada caso confere que nada de G nem de H
 * mudou.
 */

let aberto: CenarioGruposAberto;
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
  aberto = await abrirCenarioGrupos();
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

// ---------------------------------------------------------------- grupos e elenco (T50)

/** Ids de H (grupo só da conta B) para os casos de GEL-108, criados como superusuário. */
const deH = { jogador: '', periodo: '', habilidade: '' };
/** O primeiro período do jogador ativo de G. */
let periodoDeG = '';

beforeAll(async () => {
  const { db, cenario } = aberto;
  const j = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, 'Isolado de H', 1990, 'meia', 0, '2026-01-01', $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoH, cenario.contaB],
  );
  deH.jogador = j.rows[0]!.id;
  const p = await db.query<{ id: string }>(
    `INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', '2026-03-01') RETURNING id`,
    [deH.jogador, cenario.grupoH],
  );
  deH.periodo = p.rows[0]!.id;
  const h = await db.query<{ id: string }>(`INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Isolada de H') RETURNING id`, [
    cenario.grupoH,
  ]);
  deH.habilidade = h.rows[0]!.id;
  const doAtivo = await db.query<{ id: string }>(
    'SELECT id FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio LIMIT 1',
    [cenario.idsG.jogadorAtivo],
  );
  periodoDeG = doAtivo.rows[0]!.id;
});

/** O que de G nenhuma rota da conta B (nem com ids de H) pode mudar. */
async function retratoDeG(): Promise<string> {
  const { db, cenario } = aberto;
  const g = cenario.grupoG;
  const partes = await Promise.all([
    db.query('SELECT nome, dia_semana, frequencia, horario, arquivado_em FROM grupos WHERE id = $1', [g]),
    db.query(
      'SELECT id, apelido, posicao, pontuacao_inicial, inicio_pontuacao::text FROM jogadores WHERE grupo_id = $1 ORDER BY id',
      [g],
    ),
    db.query('SELECT id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id', [g]),
    db.query('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY id', [g]),
    db.query('SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id, habilidade_id', [g]),
    db.query('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id', [g]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

/** O mesmo para H, nos pedidos da conta C com ids de H. */
async function retratoDeH(): Promise<string> {
  const { db, cenario } = aberto;
  const h = cenario.grupoH;
  const partes = await Promise.all([
    db.query('SELECT id, apelido, inicio_pontuacao::text FROM jogadores WHERE grupo_id = $1 ORDER BY id', [h]),
    db.query('SELECT id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id', [h]),
    db.query('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY id', [h]),
    db.query('SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id, habilidade_id', [h]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

interface IdsFilhos {
  jogador: string;
  periodo: string;
  habilidade: string;
}

interface PedidoDeGrupo {
  metodo: string;
  /** Caminho a partir de `/grupos/<grupo>`, com os ids do grupo da vez. */
  caminho: (ids: IdsFilhos) => string;
  corpo?: unknown;
  /** A rota leva id de jogador, período ou habilidade (GEL-108). */
  comFilho?: boolean;
}

/** Caso de rota de grupo: B contra G (GEL-107) e, com filho, C com ids de H e B com ids de G (GEL-108). */
function casoDeGrupo(p: PedidoDeGrupo): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      const idsDeG: IdsFilhos = { jogador: cenario.idsG.jogadorAtivo, periodo: periodoDeG, habilidade: cenario.idsG.habilidade };
      const enviar = (grupo: string, ids: IdsFilhos, sessaoDaVez: string) =>
        pedir(`/grupos/${grupo}${p.caminho(ids)}`, {
          metodo: p.metodo,
          sessao: sessaoDaVez,
          ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
        });

      const antesG = await retratoDeG();
      const antesH = await retratoDeH();

      const r = await enviar(cenario.grupoG, idsDeG, sessaoB);
      expect(r.status, 'GEL-107: B com o id de G').toBe(404);
      expect(await r.text()).not.toContain('Toninho');

      if (p.comFilho) {
        const cComH = await enviar(cenario.grupoG, deH, sessaoA);
        expect(cComH.status, 'GEL-108: C com G na rota e ids de H').toBe(404);
        const bComG = await enviar(cenario.grupoH, idsDeG, sessaoB);
        expect(bComG.status, 'GEL-108: B com H na rota e ids de G').toBe(404);
      }

      expect(await retratoDeG()).toBe(antesG);
      expect(await retratoDeH()).toBe(antesH);
    },
  };
}

const SEM_GRUPO_NA_ROTA =
  'sem :grupoId na rota: a grupo_criar e a RLS decidem o que a conta cria e vê (GEL-106; os casos ficam nos testes da rota)';

const ROTAS_DE_GRUPO: Record<string, Linha> = {
  'POST /api/grupos': { naoSeAplica: SEM_GRUPO_NA_ROTA },
  'GET /api/grupos': { naoSeAplica: SEM_GRUPO_NA_ROTA },
  'GET /api/grupos/:grupoId': casoDeGrupo({ metodo: 'GET', caminho: () => '' }),
  'PATCH /api/grupos/:grupoId': casoDeGrupo({
    metodo: 'PATCH',
    caminho: () => '',
    corpo: { nome: 'Invadido por B', diaSemana: 'sexta', frequencia: 'semanal', horario: '21:00' },
  }),
  'POST /api/grupos/:grupoId/arquivar': casoDeGrupo({
    metodo: 'POST',
    caminho: () => '/arquivar',
    corpo: { nomeConfirmacao: 'Pelada de Quinta' },
  }),
  'POST /api/grupos/:grupoId/reativar': casoDeGrupo({ metodo: 'POST', caminho: () => '/reativar', corpo: {} }),
  'GET /api/grupos/:grupoId/jogadores': casoDeGrupo({ metodo: 'GET', caminho: () => '/jogadores' }),
  'POST /api/grupos/:grupoId/jogadores': casoDeGrupo({
    metodo: 'POST',
    caminho: () => '/jogadores',
    corpo: { apelido: 'Infiltrado', anoNascimento: 1990, posicao: 'meia' },
  }),
  'GET /api/grupos/:grupoId/jogadores/:id': casoDeGrupo({
    metodo: 'GET',
    caminho: (i) => `/jogadores/${i.jogador}`,
    comFilho: true,
  }),
  'PATCH /api/grupos/:grupoId/jogadores/:id': casoDeGrupo({
    metodo: 'PATCH',
    caminho: (i) => `/jogadores/${i.jogador}`,
    corpo: { apelido: 'Renomeado por B', anoNascimento: 1990, posicao: 'meia' },
    comFilho: true,
  }),
  'DELETE /api/grupos/:grupoId/jogadores/:id': casoDeGrupo({
    metodo: 'DELETE',
    caminho: (i) => `/jogadores/${i.jogador}`,
    comFilho: true,
  }),
  'POST /api/grupos/:grupoId/jogadores/:id/inativar': casoDeGrupo({
    metodo: 'POST',
    caminho: (i) => `/jogadores/${i.jogador}/inativar`,
    corpo: { data: '2026-03-01' },
    comFilho: true,
  }),
  'POST /api/grupos/:grupoId/jogadores/:id/reativar': casoDeGrupo({
    metodo: 'POST',
    caminho: (i) => `/jogadores/${i.jogador}/reativar`,
    corpo: { data: '2026-03-02' },
    comFilho: true,
  }),
  'PATCH /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId': casoDeGrupo({
    metodo: 'PATCH',
    caminho: (i) => `/jogadores/${i.jogador}/periodos/${i.periodo}`,
    corpo: { saida: '2026-02-01' },
    comFilho: true,
  }),
  'PUT /api/grupos/:grupoId/jogadores/:id/inicio': casoDeGrupo({
    metodo: 'PUT',
    caminho: (i) => `/jogadores/${i.jogador}/inicio`,
    corpo: { data: '2025-12-01' },
    comFilho: true,
  }),
  'PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId': casoDeGrupo({
    metodo: 'PUT',
    caminho: (i) => `/jogadores/${i.jogador}/notas/${i.habilidade}`,
    corpo: { nota: 3 },
    comFilho: true,
  }),
  'GET /api/grupos/:grupoId/habilidades': casoDeGrupo({ metodo: 'GET', caminho: () => '/habilidades' }),
  'POST /api/grupos/:grupoId/habilidades': casoDeGrupo({
    metodo: 'POST',
    caminho: () => '/habilidades',
    corpo: { nome: 'Infiltrada' },
  }),
  'PATCH /api/grupos/:grupoId/habilidades/:id': casoDeGrupo({
    metodo: 'PATCH',
    caminho: (i) => `/habilidades/${i.habilidade}`,
    corpo: { nome: 'Renomeada por B' },
    comFilho: true,
  }),
  'DELETE /api/grupos/:grupoId/habilidades/:id': casoDeGrupo({
    metodo: 'DELETE',
    caminho: (i) => `/habilidades/${i.habilidade}`,
    comFilho: true,
  }),
};

/** Uma linha por rota do Hono (`MÉTODO caminho`). */
const TABELA: Record<string, Linha> = {
  ...ROTAS_DE_GRUPO,
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
