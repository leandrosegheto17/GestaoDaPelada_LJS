import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { remetenteMemoria } from '../../src/infraestrutura/email/memoria.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio/index.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { GRUPO_A, GRUPO_B, gravarDoisGrupos, type IdsDoGrupo } from '../apoio/cenario-dois-grupos.ts';
import { prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';
import { CASOS_ROTAS } from './casos.ts';

// Ids de outro grupo respondem 404 (T51; GEL-107, GEL-108, GEL-112). O app inteiro (todos os middlewares) roda no
// Node, ligado ao banco como pelada_app, sob a RLS: a conta admin do grupo A pede, na rota do próprio grupo, com o
// jogador, o período ou a habilidade do grupo B, e também na rota do grupo B. Toda resposta é 404 e nenhuma linha do
// grupo B muda.

let b: BancoDeRepositorio;
let cookieA: string;
/** Período (aberto) do jogador de cada grupo, gravado pelo cenário. */
const periodo: Record<'A' | 'B', string> = { A: '', B: '' };

const SEM_LIMITE = { limit: async () => ({ success: true }) };
const app = criarApp({
  limitadores: { entrar: SEM_LIMITE, publico: SEM_LIMITE },
  remetente: remetenteMemoria(),
  relogio: relogioFixo('2026-10-28'),
});

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
  await gravarDoisGrupos(b.owner);
  // Sessão da conta do grupo A, gravada como o `entrar` grava: só o SHA-256 do token.
  const sessao = await gerarToken();
  await b.owner.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(sessao.hash), GRUPO_A.conta],
  );
  cookieA = `__Host-sessao=${sessao.token}`;
  for (const [nome, g] of [
    ['A', GRUPO_A],
    ['B', GRUPO_B],
  ] as const) {
    const { rows } = await b.owner.query<{ id: string }>('SELECT id FROM periodos_ativos WHERE jogador_id = $1', [
      g.jogador,
    ]);
    periodo[nome] = rows[0]!.id;
  }
});

afterAll(async () => {
  await b?.encerrar();
});

async function pedir(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; corpo: unknown }> {
  const headers: Record<string, string> = { 'X-Pelada': '1', Cookie: cookieA };
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const init: RequestInit = { method: metodo, headers };
  if (corpo !== undefined) init.body = JSON.stringify(corpo);
  const env = { HYPERDRIVE: { connectionString: b.urlApp }, URL_PUBLICA: 'https://app.invalid', VERSAO: 'teste' };
  const ctx = { waitUntil: () => undefined, passThroughOnException: () => undefined, props: {} };
  const r = await app.fetch(new Request(`https://app.invalid${caminho}`, init), env, ctx as never);
  const texto = await r.text();
  return { status: r.status, corpo: texto ? JSON.parse(texto) : null };
}

/** Todas as linhas do grupo B nas tabelas que as rotas da feature leem ou escrevem, e a contagem da auditoria. */
async function estadoDeB(): Promise<string> {
  const partes: string[] = [];
  for (const [tabela, coluna] of [
    ['grupos', 'id'],
    ['jogadores', 'grupo_id'],
    ['periodos_ativos', 'grupo_id'],
    ['habilidades', 'grupo_id'],
    ['notas', 'grupo_id'],
    ['presencas', 'grupo_id'],
    ['pagamentos_mes', 'grupo_id'],
    ['vinculos_admin', 'grupo_id'],
  ] as const) {
    const { rows } = await b.owner.query<{ h: string | null; n: string }>(
      `SELECT md5(string_agg(t::text, '|' ORDER BY t::text)) AS h, count(*) AS n FROM ${tabela} t WHERE ${coluna} = $1`,
      [GRUPO_B.grupo],
    );
    partes.push(`${tabela}=${rows[0]?.n}:${rows[0]?.h}`);
  }
  const { rows } = await b.owner.query<{ n: string }>('SELECT count(*) AS n FROM auditoria WHERE grupo_id = $1', [
    GRUPO_B.grupo,
  ]);
  partes.push(`auditoria=${rows[0]?.n}`);
  return partes.join(' ');
}

const JOGADOR_VALIDO = { apelido: 'Invasor', anoNascimento: 1990, posicao: 'meia' };

/** Pedido com um corpo válido, para que o 404 venha do id de outro grupo e não da validação. */
interface Pedido {
  nome: string;
  metodo: string;
  caminho: string;
  corpo?: unknown;
}

const deA = `/api/grupos/${GRUPO_A.grupo}`;

/** Rotas de A com o id de B: jogador, período e habilidade (GEL-108). */
const IDS_DE_B: Pedido[] = [
  { nome: 'GET jogador de B', metodo: 'GET', caminho: `${deA}/jogadores/${GRUPO_B.jogador}` },
  {
    nome: 'PATCH jogador de B',
    metodo: 'PATCH',
    caminho: `${deA}/jogadores/${GRUPO_B.jogador}`,
    corpo: JOGADOR_VALIDO,
  },
  { nome: 'DELETE jogador de B', metodo: 'DELETE', caminho: `${deA}/jogadores/${GRUPO_B.jogador}` },
  { nome: 'inativar jogador de B', metodo: 'POST', caminho: `${deA}/jogadores/${GRUPO_B.jogador}/inativar`, corpo: {} },
  { nome: 'reativar jogador de B', metodo: 'POST', caminho: `${deA}/jogadores/${GRUPO_B.jogador}/reativar`, corpo: {} },
  {
    nome: 'início do jogador de B',
    metodo: 'PUT',
    caminho: `${deA}/jogadores/${GRUPO_B.jogador}/inicio`,
    corpo: { data: '2026-02-01' },
  },
  {
    nome: 'nota do jogador de B na habilidade de A',
    metodo: 'PUT',
    caminho: `${deA}/jogadores/${GRUPO_B.jogador}/notas/${GRUPO_A.habilidade}`,
    corpo: { nota: 3 },
  },
  {
    nome: 'nota do jogador de A na habilidade de B',
    metodo: 'PUT',
    caminho: `${deA}/jogadores/${GRUPO_A.jogador}/notas/${GRUPO_B.habilidade}`,
    corpo: { nota: 3 },
  },
  {
    nome: 'nota do jogador de B na habilidade de B',
    metodo: 'PUT',
    caminho: `${deA}/jogadores/${GRUPO_B.jogador}/notas/${GRUPO_B.habilidade}`,
    corpo: { nota: null },
  },
  {
    nome: 'habilidade de B (PATCH)',
    metodo: 'PATCH',
    caminho: `${deA}/habilidades/${GRUPO_B.habilidade}`,
    corpo: { nome: 'Invasão' },
  },
  { nome: 'habilidade de B (DELETE)', metodo: 'DELETE', caminho: `${deA}/habilidades/${GRUPO_B.habilidade}` },
];

/** Os pedidos de período dependem dos ids gravados no `beforeAll`. */
const periodosDeB = (): Pedido[] => [
  {
    nome: 'período de B no jogador de B',
    metodo: 'PATCH',
    caminho: `${deA}/jogadores/${GRUPO_B.jogador}/periodos/${periodo.B}`,
    corpo: { retorno: '2026-02-01' },
  },
  {
    nome: 'período de B no jogador de A',
    metodo: 'PATCH',
    caminho: `${deA}/jogadores/${GRUPO_A.jogador}/periodos/${periodo.B}`,
    corpo: { retorno: '2026-02-01' },
  },
];

/** O caminho de uma rota de grupo com os parâmetros trocados pelos ids de `g` (GEL-107). */
function caminhoCom(rota: string, g: IdsDoGrupo, periodoId: string): string {
  return rota
    .replace(':grupoId', g.grupo)
    .replace(':periodoId', periodoId)
    .replace(':habilidadeId', g.habilidade)
    .replace(':contaId', g.conta)
    .replace(/habilidades\/:id/, `habilidades/${g.habilidade}`)
    .replace(/convites\/:id/, `convites/${crypto.randomUUID()}`)
    .replace(':id', g.jogador);
}

describe('o app do teste conecta como pelada_app (GEL-112)', () => {
  it('a conexão do HYPERDRIVE do teste é a pelada_app, sem bypass da RLS', async () => {
    const c = new pg.Client({ connectionString: b.urlApp });
    await c.connect();
    try {
      const { rows } = await c.query(
        'SELECT current_user AS usuario, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass',
      );
      expect(rows).toEqual([{ usuario: 'pelada_app', bypass: false }]);
    } finally {
      await c.end();
    }
  });
});

describe('ids de outro grupo na rota do próprio grupo (GEL-108)', () => {
  it('os pedidos de controle, com os ids de A, passam do 404 (a rota existe e acha o jogador, a habilidade e o período)', async () => {
    const controles = [
      await pedir('GET', `${deA}/jogadores/${GRUPO_A.jogador}`),
      await pedir('PATCH', `${deA}/habilidades/${GRUPO_A.habilidade}`, { nome: 'Chute forte' }),
      await pedir('PUT', `${deA}/jogadores/${GRUPO_A.jogador}/notas/${GRUPO_A.habilidade}`, { nota: 7 }),
      // O retorno do primeiro período não é corrigível (GEL-73): o 422 no campo prova que o período de A foi achado.
      await pedir('PATCH', `${deA}/jogadores/${GRUPO_A.jogador}/periodos/${periodo.A}`, { retorno: '2026-01-02' }),
    ];
    expect(controles.map((r) => r.status)).toEqual([200, 200, 200, 422]);
    expect(controles[3]!.corpo).toMatchObject({ erro: { campos: { retorno: expect.any(String) } } });
  });

  it.each(IDS_DE_B.map((p) => [p.nome, p] as const))('%s: 404 e nada do grupo B muda', async (_nome, p) => {
    const antes = await estadoDeB();
    const r = await pedir(p.metodo, p.caminho, p.corpo);
    expect(r.status).toBe(404);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
    expect(await estadoDeB()).toBe(antes);
  });

  it('período de B (no jogador de B e no de A): 404 e nada do grupo B muda', async () => {
    for (const p of periodosDeB()) {
      const antes = await estadoDeB();
      const r = await pedir(p.metodo, p.caminho, p.corpo);
      expect(r.status, p.nome).toBe(404);
      expect(await estadoDeB(), p.nome).toBe(antes);
    }
  });
});

describe('toda rota de grupo com o id do grupo B (GEL-107)', () => {
  const ROTAS_DE_GRUPO = Object.entries(CASOS_ROTAS)
    .filter(([, caso]) => caso.tipo === 'grupo')
    .map(([rota]) => rota);

  it('a lista cobre as rotas da feature', () => {
    expect(ROTAS_DE_GRUPO).toEqual(
      expect.arrayContaining([
        'GET /api/grupos/:grupoId/habilidades',
        'PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId',
        'PATCH /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId',
      ]),
    );
  });

  it.each(ROTAS_DE_GRUPO)('%s: 404 e nada do grupo B muda', async (rota) => {
    const [metodo, molde] = rota.split(' ') as [string, string];
    const antes = await estadoDeB();
    const corpo = metodo === 'GET' || metodo === 'DELETE' ? undefined : {};
    const r = await pedir(metodo, caminhoCom(molde, GRUPO_B, periodo.B), corpo);
    expect(r.status).toBe(404);
    expect(await estadoDeB()).toBe(antes);
  });
});
