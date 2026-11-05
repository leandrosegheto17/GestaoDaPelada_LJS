import { Buffer } from 'node:buffer';
import type { Hono } from 'hono';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Ambiente, Env } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { asaasMemoria } from '../../src/infraestrutura/asaas/memoria.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente, conviteDeTeste, envAcesso, limparCaixa } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { chavesAssinante, chavesVapid, endpointDe } from '../rotas/apoio-push.ts';
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
 *
 * financeiro T31 (FIN-31, FIN-33, FIN-37): as rotas do financeiro entram na tabela (`ROTAS_DO_FINANCEIRO`) com o
 * mesmo 404 cruzado, agora conferindo também o caixa de G e de H; e cada uma, lida da lista do roteador, dá 403 para
 * a admin de G sem acesso (O) e, com G arquivado, 409 nas escritas e 200 nas leituras da criadora e 404 para O.
 *
 * partidas-e-ranking T48 (PAR-92, PAR-137 a PAR-139): as 12 rotas novas de admin (`ROTAS_DE_PARTIDAS`) com o 404
 * cruzado, inclusive a data de partida que só existe em H, conferindo partidas, presenças, pesos, eventos e auditoria;
 * e as 3 públicas (`ROTAS_PUBLICAS`), tipo novo, com o slug de G, o de H e o de G arquivado.
 *
 * simulador T40 (SIM-79, SIM-80, SIM-83): as 5 rotas novas (`ROTAS_DO_SIMULADOR`) com o 404 cruzado sem ler nem
 * gravar (escalações e eventos de G e de H iguais); sem sessão, 401; id de jogador de H nos aptos ou na composição de
 * G dá 422 sem o apelido nem o id de H (e o contrário); com G arquivado, 409 nos POST. As 2 rotas ampliadas
 * (`GET /api/grupos/:grupoId`, `GET …/partidas/nova`) já têm caso nas tabelas de grupo e de partidas.
 *
 * notificacoes T32 (NOT-53, NOT-54): as 8 rotas de push (`ROTAS_DE_PUSH`): as 4 públicas com o slug de G e a assinatura
 * de H (e o contrário), as 4 da conta com a sessão de B e a assinatura de A; e nenhuma resposta GET do app, nem da
 * criadora de G, traz os valores semeados de endpoint, `p256dh` ou `auth`.
 *
 * planos-e-cobranca T39 (PLA-09, PLA-32): as 3 rotas de grupo do plano (`ROTAS_DO_PLANO`) com o 404 cruzado (B contra
 * G e C contra H), sem nenhuma chamada ao Asaas em memória e sem mudar plano, assinatura nem auditoria de G e de H; e o
 * webhook, rota sem sessão, que com a sessão de B e sem o token responde 401 e não lê nem muda nada de grupo.
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
    db.query(
      'SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id',
      [cenario.grupoA],
    ),
    // O convite do caso de aceitar é do próprio teste e fica fora do retrato.
    db.query(
      `SELECT id, email, usado_em, cancelado_em FROM convites_admin
        WHERE grupo_id = $1 AND email <> 'isolamento@exemplo.test' ORDER BY id`,
      [cenario.grupoA],
    ),
    db.query('SELECT nome, arquivado_em FROM grupos WHERE id = $1', [cenario.grupoA]),
    db.query('SELECT nome, email, senha_hash, excluida_em FROM contas WHERE id = $1', [
      cenario.contaA,
    ]),
    db.query('SELECT count(*)::int AS n FROM sessoes WHERE conta_id = $1', [cenario.contaA]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

type Linha = { caso: () => Promise<void> } | { naoSeAplica: string };

const SEM_SESSAO =
  'rota sem sessão: age só pelo token ou pelo e-mail do corpo, não por conta nem grupo';

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
  const h = await db.query<{ id: string }>(
    `INSERT INTO habilidades (grupo_id, nome) VALUES ($1, 'Isolada de H') RETURNING id`,
    [cenario.grupoH],
  );
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
    db.query(
      'SELECT nome, dia_semana, frequencia, horario, arquivado_em FROM grupos WHERE id = $1',
      [g],
    ),
    db.query(
      'SELECT id, apelido, posicao, pontuacao_inicial, inicio_pontuacao::text FROM jogadores WHERE grupo_id = $1 ORDER BY id',
      [g],
    ),
    db.query(
      'SELECT id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id',
      [g],
    ),
    db.query('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY id', [g]),
    db.query(
      'SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id, habilidade_id',
      [g],
    ),
    db.query('SELECT conta_id FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id', [g]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

/** O mesmo para H, nos pedidos da conta C com ids de H. */
async function retratoDeH(): Promise<string> {
  const { db, cenario } = aberto;
  const h = cenario.grupoH;
  const partes = await Promise.all([
    db.query(
      'SELECT id, apelido, inicio_pontuacao::text FROM jogadores WHERE grupo_id = $1 ORDER BY id',
      [h],
    ),
    db.query(
      'SELECT id, inicio::text, fim::text FROM periodos_ativos WHERE grupo_id = $1 ORDER BY id',
      [h],
    ),
    db.query('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY id', [h]),
    db.query(
      'SELECT jogador_id, habilidade_id, valor FROM notas WHERE grupo_id = $1 ORDER BY jogador_id, habilidade_id',
      [h],
    ),
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
      const idsDeG: IdsFilhos = {
        jogador: cenario.idsG.jogadorAtivo,
        periodo: periodoDeG,
        habilidade: cenario.idsG.habilidade,
      };
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
  'POST /api/grupos/:grupoId/reativar': casoDeGrupo({
    metodo: 'POST',
    caminho: () => '/reativar',
    corpo: {},
  }),
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
  'GET /api/grupos/:grupoId/habilidades': casoDeGrupo({
    metodo: 'GET',
    caminho: () => '/habilidades',
  }),
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

// ---------------------------------------------------------------- financeiro (financeiro T31)

/**
 * Rotas do financeiro (FIN-31, FIN-33, FIN-37). Cada uma tem um pedido válido para a conta da vez; o grupo da rota e os
 * ids filhos (lançamento, jogador, conta alvo) vêm do grupo dado. Rota nova com `/financeiro` sem pedido aqui reprova
 * (teste abaixo).
 */
interface IdsDoCaixa {
  lancamento: string;
  jogador: string;
  /** A conta alvo do PATCH de acesso: um admin do grupo que não é a conta da sessão de C. */
  conta: string;
}

interface PedidoDoCaixa {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: (ids: IdsDoCaixa) => string;
  corpo?: unknown;
  /** Leva id de lançamento ou de jogador: também C com ids de H (FIN-31). */
  comFilho?: boolean;
}

const LANCAMENTO_VALIDO = {
  tipo: 'saida',
  data: '2026-02-10',
  descricao: 'Isolamento',
  valorCentavos: 100,
};

const PEDIDOS_DO_FINANCEIRO: Record<string, PedidoDoCaixa> = {
  'PUT /api/grupos/:grupoId/financeiro/config': {
    metodo: 'PUT',
    caminho: () => '/financeiro/config',
    corpo: { mensalidadeCentavos: 1, saldoInicialCentavos: 1, dataSaldoInicial: '2026-01-01' },
  },
  'GET /api/grupos/:grupoId/financeiro/mes': { metodo: 'GET', caminho: () => '/financeiro/mes' },
  'POST /api/grupos/:grupoId/financeiro/pagamentos': {
    metodo: 'POST',
    caminho: () => '/financeiro/pagamentos',
    corpo: { jogadorId: '00000000-0000-4000-8000-000000000000', mes: '2026-02' },
  },
  'DELETE /api/grupos/:grupoId/financeiro/pagamentos/:jogadorId/:mes': {
    metodo: 'DELETE',
    caminho: (i) => `/financeiro/pagamentos/${i.jogador}/2026-01`,
    comFilho: true,
  },
  'POST /api/grupos/:grupoId/financeiro/lancamentos': {
    metodo: 'POST',
    caminho: () => '/financeiro/lancamentos',
    corpo: LANCAMENTO_VALIDO,
  },
  'GET /api/grupos/:grupoId/financeiro/lancamentos/:id': {
    metodo: 'GET',
    caminho: (i) => `/financeiro/lancamentos/${i.lancamento}`,
    comFilho: true,
  },
  'PUT /api/grupos/:grupoId/financeiro/lancamentos/:id': {
    metodo: 'PUT',
    caminho: (i) => `/financeiro/lancamentos/${i.lancamento}`,
    corpo: { ...LANCAMENTO_VALIDO, tipo: 'entrada' },
    comFilho: true,
  },
  'DELETE /api/grupos/:grupoId/financeiro/lancamentos/:id': {
    metodo: 'DELETE',
    caminho: (i) => `/financeiro/lancamentos/${i.lancamento}`,
    comFilho: true,
  },
  'PATCH /api/grupos/:grupoId/admins/:contaId/financeiro': {
    metodo: 'PATCH',
    caminho: (i) => `/admins/${i.conta}/financeiro`,
    corpo: { acessaFinanceiro: true },
    comFilho: true,
  },
};

/** Ids do caixa de H (criados no `beforeAll`). */
const caixaDeH = { lancamento: '' };

beforeAll(async () => {
  const { db, cenario } = aberto;
  const l = await db.query<{ id: string }>(
    `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, 'entrada', '2026-01-10', 'Caixa de H', 321, $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoH, cenario.contaB],
  );
  caixaDeH.lancamento = l.rows[0]!.id;
  await db.query(
    `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
     VALUES ($1, $2, '2026-01', NULL, $3, now())`,
    [cenario.grupoH, deH.jogador, cenario.contaB],
  );
  // B passa a ter acesso ao financeiro de H: o "B com H na rota e ids de G" precisa chegar à rota (404), não parar no
  // 403 do `exigirFinanceiro`.
  await db.query(
    'UPDATE vinculos_admin SET acessa_financeiro = true WHERE grupo_id = $1 AND conta_id = $2',
    [cenario.grupoH, cenario.contaB],
  );
});

const idsDoCaixaDeG = (): IdsDoCaixa => ({
  lancamento: aberto.cenario.idsG.lancamento,
  jogador: aberto.cenario.idsG.jogadorHistorico,
  conta: aberto.cenario.contaO,
});
const idsDoCaixaDeH = (): IdsDoCaixa => ({
  lancamento: caixaDeH.lancamento,
  jogador: deH.jogador,
  conta: aberto.cenario.contaB,
});

/** O caixa e os acessos de um grupo, para provar que nada mudou. */
async function retratoDoCaixa(grupo: string): Promise<string> {
  const { db } = aberto;
  const partes = await Promise.all([
    db.query(
      'SELECT mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial::text FROM config_financeira WHERE grupo_id = $1',
      [grupo],
    ),
    db.query(
      'SELECT id, tipo, data::text, descricao, valor_centavos FROM lancamentos WHERE grupo_id = $1 ORDER BY id',
      [grupo],
    ),
    db.query(
      'SELECT jogador_id, mes, lancamento_id FROM pagamentos_mes WHERE grupo_id = $1 ORDER BY jogador_id, mes',
      [grupo],
    ),
    db.query(
      'SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 ORDER BY conta_id',
      [grupo],
    ),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

let sessaoO = '';
beforeAll(async () => {
  sessaoO = await sessao(aberto.cenario.contaO);
});

function enviarAoCaixa(
  p: PedidoDoCaixa,
  grupo: string,
  ids: IdsDoCaixa,
  sessaoDaVez: string,
): Promise<Response> {
  return pedir(`/grupos/${grupo}${p.caminho(ids)}`, {
    metodo: p.metodo,
    sessao: sessaoDaVez,
    ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
  });
}

/** FIN-31: B contra G (404) e, com filho, C com ids de H e B com ids de G (404); nada de G nem de H muda. */
function casoDoCaixa(p: PedidoDoCaixa): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      const antesG = await retratoDoCaixa(cenario.grupoG);
      const antesH = await retratoDoCaixa(cenario.grupoH);

      const r = await enviarAoCaixa(p, cenario.grupoG, idsDoCaixaDeG(), sessaoB);
      expect(r.status, 'FIN-31: B com o id de G').toBe(404);
      expect(await r.text()).not.toContain('Mensalidade');

      if (p.comFilho) {
        const cComH = await enviarAoCaixa(p, cenario.grupoG, idsDoCaixaDeH(), sessaoA);
        expect(cComH.status, 'FIN-31: C com G na rota e ids de H').toBe(404);
        expect(await cComH.text()).not.toContain('Caixa de H');
        const bComG = await enviarAoCaixa(p, cenario.grupoH, idsDoCaixaDeG(), sessaoB);
        expect(bComG.status, 'FIN-31: B com H na rota e ids de G').toBe(404);
      }

      expect(await retratoDoCaixa(cenario.grupoG)).toBe(antesG);
      expect(await retratoDoCaixa(cenario.grupoH)).toBe(antesH);
    },
  };
}

const ROTAS_DO_FINANCEIRO: Record<string, Linha> = Object.fromEntries(
  Object.entries(PEDIDOS_DO_FINANCEIRO).map(([rota, p]) => [rota, casoDoCaixa(p)]),
);

// ---------------------------------------------------------------- partidas e ranking (partidas-e-ranking T48)

/**
 * Rotas de admin da partidas-e-ranking (PAR-137, PAR-138; `BD:250-251`): o mesmo 404 cruzado das rotas de grupo, agora
 * conferindo também partidas, presenças, pesos, eventos de uso e auditoria de G e de H. Nas rotas por data, o filho é
 * a data: a de G (2026-01-08, do cenário) e uma que só existe em H (2026-02-19, criada aqui).
 */
const DATA_DE_G = '2026-01-08';
const DATA_SO_DE_H = '2026-02-19';

beforeAll(async () => {
  const { db, cenario } = aberto;
  const p = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, $2, true, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoH, DATA_SO_DE_H, cenario.contaB],
  );
  await db.query(
    `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`,
    [p.rows[0]!.id, deH.jogador, cenario.grupoH],
  );
});

/** Partidas, presenças, pesos, eventos e auditoria de um grupo, para provar que nada mudou (PAR-138). */
async function retratoDePartidas(grupo: string): Promise<string> {
  const { db } = aberto;
  const partes = await Promise.all([
    db.query(
      'SELECT id, data::text, choveu, alterada_por, alterada_em FROM partidas WHERE grupo_id = $1 ORDER BY id',
      [grupo],
    ),
    db.query(
      'SELECT partida_id, jogador_id, situacao FROM presencas WHERE grupo_id = $1 ORDER BY partida_id, jogador_id',
      [grupo],
    ),
    db.query(
      `SELECT vigente_desde::text, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva, lesionado_com_chuva, expulso,
              expulso_com_chuva, registrado_por FROM config_pesos WHERE grupo_id = $1 ORDER BY vigente_desde`,
      [grupo],
    ),
    db.query('SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1', [grupo]),
    db.query('SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = $1', [grupo]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

interface IdsDePartida extends IdsFilhos {
  data: string;
}

interface PedidoDePartida {
  metodo: 'GET' | 'POST' | 'PUT' | 'DELETE';
  caminho: (ids: IdsDePartida) => string;
  corpo?: (ids: IdsDePartida) => unknown;
  /** Leva data de partida, id de jogador ou de período: também C com os de H e B com os de G (PAR-138). */
  comFilho?: boolean;
}

function casoDePartidas(p: PedidoDePartida): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      const idsDeG: IdsDePartida = {
        jogador: cenario.idsG.jogadorAtivo,
        periodo: periodoDeG,
        habilidade: cenario.idsG.habilidade,
        data: DATA_DE_G,
      };
      const idsDeH: IdsDePartida = { ...deH, data: DATA_SO_DE_H };
      const enviar = (grupo: string, ids: IdsDePartida, sessaoDaVez: string) =>
        pedir(`/grupos/${grupo}${p.caminho(ids)}`, {
          metodo: p.metodo,
          sessao: sessaoDaVez,
          ...(p.corpo !== undefined ? { corpo: p.corpo(ids) } : {}),
        });

      const antes = [
        await retratoDeG(),
        await retratoDeH(),
        await retratoDePartidas(cenario.grupoG),
        await retratoDePartidas(cenario.grupoH),
      ];

      const r = await enviar(cenario.grupoG, idsDeG, sessaoB);
      expect(r.status, 'PAR-138: B com o id de G').toBe(404);
      expect(await r.text()).not.toContain('Toninho');

      if (p.comFilho) {
        const cComH = await enviar(cenario.grupoG, idsDeH, sessaoA);
        expect(cComH.status, 'PAR-138: C com G na rota e a data ou os ids de H').toBe(404);
        expect(await cComH.text()).not.toContain('Isolado de H');
        const bComG = await enviar(cenario.grupoH, idsDeG, sessaoB);
        expect(bComG.status, 'PAR-138: B com H na rota e a data ou os ids de G').toBe(404);
        expect(await bComG.text()).not.toContain('Toninho');
      }

      const depois = [
        await retratoDeG(),
        await retratoDeH(),
        await retratoDePartidas(cenario.grupoG),
        await retratoDePartidas(cenario.grupoH),
      ];
      expect(depois).toEqual(antes);
    },
  };
}

const PESOS_VALIDOS = {
  presencaSemChuva: 9,
  presencaComChuva: 9,
  lesionadoSemChuva: 9,
  lesionadoComChuva: 9,
  expulsoSemChuva: 9,
  expulsoComChuva: 9,
};

const PEDIDOS_DE_PARTIDAS: Record<string, PedidoDePartida> = {
  'GET /api/grupos/:grupoId/pesos': { metodo: 'GET', caminho: () => '/pesos' },
  'POST /api/grupos/:grupoId/pesos': {
    metodo: 'POST',
    caminho: () => '/pesos',
    corpo: () => PESOS_VALIDOS,
  },
  'GET /api/grupos/:grupoId/partidas/nova': {
    metodo: 'GET',
    caminho: () => '/partidas/nova?data=2026-02-26',
  },
  'GET /api/grupos/:grupoId/partidas': { metodo: 'GET', caminho: () => '/partidas?mes=2026-01' },
  'POST /api/grupos/:grupoId/partidas': {
    metodo: 'POST',
    caminho: () => '/partidas',
    corpo: () => ({ data: '2026-02-26', choveu: false, marcacoes: [] }),
  },
  'GET /api/grupos/:grupoId/partidas/:data': {
    metodo: 'GET',
    caminho: (i) => `/partidas/${i.data}`,
    comFilho: true,
  },
  'PUT /api/grupos/:grupoId/partidas/:data': {
    metodo: 'PUT',
    caminho: (i) => `/partidas/${i.data}`,
    corpo: (i) => ({ data: i.data, choveu: false, marcacoes: [] }),
    comFilho: true,
  },
  'DELETE /api/grupos/:grupoId/partidas/:data': {
    metodo: 'DELETE',
    caminho: (i) => `/partidas/${i.data}`,
    comFilho: true,
  },
  'GET /api/grupos/:grupoId/uso': { metodo: 'GET', caminho: () => '/uso' },
  'POST /api/grupos/:grupoId/jogadores/:id/reativar/previa': {
    metodo: 'POST',
    caminho: (i) => `/jogadores/${i.jogador}/reativar/previa`,
    corpo: () => ({ data: '2026-03-02' }),
    comFilho: true,
  },
  'POST /api/grupos/:grupoId/jogadores/:id/periodos/:periodoId/previa': {
    metodo: 'POST',
    caminho: (i) => `/jogadores/${i.jogador}/periodos/${i.periodo}/previa`,
    corpo: () => ({ saida: '2026-02-01' }),
    comFilho: true,
  },
  'POST /api/grupos/:grupoId/jogadores/:id/inicio/previa': {
    metodo: 'POST',
    caminho: (i) => `/jogadores/${i.jogador}/inicio/previa`,
    corpo: () => ({ data: '2025-12-01' }),
    comFilho: true,
  },
};

const ROTAS_DE_PARTIDAS: Record<string, Linha> = Object.fromEntries(
  Object.entries(PEDIDOS_DE_PARTIDAS).map(([rota, p]) => [rota, casoDePartidas(p)]),
);

/**
 * Rotas públicas (PAR-139, PAR-92; tipo `publico` de `BD:250-251`): com o slug de G, como `pelada_app` e com a sessão
 * de B no cookie, só saem dados de G (nem o nome de H nem o jogador de H); com o slug de H, nada de G; com G arquivado,
 * 404. O evento cai só no grupo do slug.
 */
interface PedidoPublico {
  metodo: 'GET' | 'POST';
  caminho: string;
  corpo?: unknown;
}

async function nomeDe(grupo: string): Promise<string> {
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [
    grupo,
  ]);
  return r.rows[0]!.nome;
}

async function slugDe(grupo: string): Promise<string> {
  const r = await aberto.db.query<{ slug: string }>('SELECT slug FROM grupos WHERE id = $1', [
    grupo,
  ]);
  return r.rows[0]!.slug;
}

function casoPublico(p: PedidoPublico): Linha {
  return {
    caso: async () => {
      const { db, cenario } = aberto;
      const nomeH = await nomeDe(cenario.grupoH);
      const slugH = await slugDe(cenario.grupoH);
      const enviar = (slug: string) =>
        pedir(`/publico/${slug}${p.caminho}`, {
          metodo: p.metodo,
          sessao: sessaoB,
          ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
        });
      const antesG = await retratoDePartidas(cenario.grupoG);
      const antesH = await retratoDePartidas(cenario.grupoH);
      const eventosDe = async (g: string) =>
        (
          await db.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1',
            [g],
          )
        ).rows[0]!.n;
      const eventosAntesG = await eventosDe(cenario.grupoG);

      const deG = await enviar(cenario.slugG);
      expect(deG.status, 'PAR-139: slug de G').toBeLessThan(300);
      const textoG = await deG.text();
      expect(textoG).not.toContain(nomeH);
      expect(textoG).not.toContain('Isolado de H');

      const deH2 = await enviar(slugH);
      expect(deH2.status, 'PAR-139: slug de H').toBeLessThan(300);
      const textoH = await deH2.text();
      expect(textoH).not.toContain(NOME_DE_G);
      expect(textoH).not.toContain('Toninho');

      await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]);
      try {
        const arquivado = await enviar(cenario.slugG);
        expect(arquivado.status, 'PAR-92: slug de G arquivado').toBe(404);
      } finally {
        await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [cenario.grupoG]);
      }

      if (p.metodo === 'POST') {
        // O evento de G e o de H caem cada um no grupo do slug; os deste teste (pelo aparelho) saem, o resto fica.
        expect(await eventosDe(cenario.grupoG)).toBe(eventosAntesG + 1);
        await db.query(
          'DELETE FROM eventos_uso WHERE dispositivo_id = $1 AND grupo_id IN ($2, $3)',
          [APARELHO_DO_ISOLAMENTO, cenario.grupoG, cenario.grupoH],
        );
      }
      expect(await retratoDePartidas(cenario.grupoG)).toBe(antesG);
      expect(await retratoDePartidas(cenario.grupoH)).toBe(antesH);
    },
  };
}

/** O nome de G no cenário de grupos (`NOME_G`), lido do banco no caso público. */
let NOME_DE_G = '';
beforeAll(async () => {
  NOME_DE_G = await nomeDe(aberto.cenario.grupoG);
});

/** UUID v4 do aparelho dos eventos deste teste, para apagar só eles. */
const APARELHO_DO_ISOLAMENTO = '7d3f0a8e-2b1c-4e5f-9a6b-1c2d3e4f5a6b';

const PEDIDOS_PUBLICOS: Record<string, PedidoPublico> = {
  'GET /api/publico/:slug/ranking': { metodo: 'GET', caminho: '/ranking' },
  'GET /api/publico/:slug/pdf': { metodo: 'GET', caminho: '/pdf' },
  'POST /api/publico/:slug/eventos': {
    metodo: 'POST',
    caminho: '/eventos',
    corpo: { tipo: 'ranking_aberto', dispositivoId: APARELHO_DO_ISOLAMENTO },
  },
};

const ROTAS_PUBLICAS: Record<string, Linha> = Object.fromEntries(
  Object.entries(PEDIDOS_PUBLICOS).map(([rota, p]) => [rota, casoPublico(p)]),
);

// ---------------------------------------------------------------- simulador (simulador T40)

/**
 * Rotas do simulador (SIM-79, SIM-80, SIM-83). A data é a quinta 2026-02-26, em que Toninho (G) e o jogador de H
 * (período até 2026-03-01) estão ativos. Cada pedido recebe os ids de jogador da vez: o de G e o de H, mais 2 UUIDs que
 * não existem, para o corpo passar no contrato (2 times de 2) e a regra de "ativo no grupo" decidir.
 */
const DATA_DO_SIMULADOR = '2026-02-26';
const SEM_JOGADOR_1 = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const SEM_JOGADOR_2 = '1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

type QuatroIds = readonly [string, string, string, string];

interface PedidoDoSimulador {
  metodo: 'GET' | 'POST';
  caminho: string;
  corpo?: (ids: QuatroIds) => unknown;
  /** Leva ids de jogador (aptos ou composição): o 422 de SIM-80 vale para ela. */
  comJogadores?: boolean;
}

const aptosDoPedido = (ids: QuatroIds) => ids.map((id) => ({ id, so1oTempo: false }));
const composicaoDoPedido = ([a, b, c, d]: QuatroIds) => ({
  times: [
    {
      titulares: [
        { id: a, so1oTempo: false },
        { id: b, so1oTempo: false },
      ],
      entramNo2oTempo: [],
    },
    {
      titulares: [
        { id: c, so1oTempo: false },
        { id: d, so1oTempo: false },
      ],
      entramNo2oTempo: [],
    },
  ],
  naoEntra: [],
});

const PEDIDOS_DO_SIMULADOR: Record<string, PedidoDoSimulador> = {
  'GET /api/grupos/:grupoId/simulador/contexto': {
    metodo: 'GET',
    caminho: `/simulador/contexto?data=${DATA_DO_SIMULADOR}`,
  },
  'POST /api/grupos/:grupoId/simulador/previa': {
    metodo: 'POST',
    caminho: '/simulador/previa',
    corpo: (ids) => ({ formato: 'dois_times', n: 2, k: 0, aptos: aptosDoPedido(ids) }),
  },
  'POST /api/grupos/:grupoId/simulador/sugerir': {
    metodo: 'POST',
    caminho: '/simulador/sugerir',
    corpo: (ids) => ({
      formato: 'dois_times',
      data: DATA_DO_SIMULADOR,
      n: 2,
      k: 0,
      aptos: aptosDoPedido(ids),
    }),
    comJogadores: true,
  },
  'POST /api/grupos/:grupoId/simulador/avaliar': {
    metodo: 'POST',
    caminho: '/simulador/avaliar',
    corpo: (ids) => ({
      formato: 'dois_times',
      data: DATA_DO_SIMULADOR,
      n: 2,
      k: 0,
      aptos: aptosDoPedido(ids),
      composicao: composicaoDoPedido(ids),
    }),
    comJogadores: true,
  },
  'POST /api/grupos/:grupoId/escalacoes': {
    metodo: 'POST',
    caminho: '/escalacoes',
    corpo: (ids) => ({
      formato: 'dois_times',
      data: DATA_DO_SIMULADOR,
      n: 2,
      k: 0,
      composicao: composicaoDoPedido(ids),
    }),
    comJogadores: true,
  },
};

/** Escalações e eventos de uso de um grupo, além de partidas e pesos: o que as rotas do simulador não podem mudar. */
async function retratoDoSimulador(grupo: string): Promise<string> {
  const { db } = aberto;
  const escalacoes = await db.query(
    'SELECT data::text, formato, n, k, composicao, confirmada_por, confirmada_em FROM escalacoes WHERE grupo_id = $1 ORDER BY data',
    [grupo],
  );
  const eventos = await db.query(
    'SELECT tipo, count(*)::int AS n FROM eventos_uso WHERE grupo_id = $1 GROUP BY tipo ORDER BY tipo',
    [grupo],
  );
  return JSON.stringify([escalacoes.rows, eventos.rows, await retratoDePartidas(grupo)]);
}

/** Os 4 ids da vez: o jogador do grupo da rota, o do outro grupo e 2 que não existem. */
function idsDoSimulador(doGrupo: string, doOutro: string): QuatroIds {
  return [doGrupo, doOutro, SEM_JOGADOR_1, SEM_JOGADOR_2];
}

function enviarAoSimulador(
  p: PedidoDoSimulador,
  grupo: string,
  ids: QuatroIds,
  sessaoDaVez?: string,
): Promise<Response> {
  return pedir(`/grupos/${grupo}${p.caminho}`, {
    metodo: p.metodo,
    ...(sessaoDaVez !== undefined ? { sessao: sessaoDaVez } : {}),
    ...(p.corpo !== undefined ? { corpo: p.corpo(ids) } : {}),
  });
}

function casoDoSimulador(p: PedidoDoSimulador): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      const retratos = async () => [
        await retratoDeG(),
        await retratoDeH(),
        await retratoDoSimulador(cenario.grupoG),
        await retratoDoSimulador(cenario.grupoH),
      ];
      const antes = await retratos();

      // SIM-79: B com G na rota dá 404, sem dado de G na resposta e sem ler nem gravar nada de G.
      const r = await enviarAoSimulador(
        p,
        cenario.grupoG,
        idsDoSimulador(cenario.idsG.jogadorAtivo, deH.jogador),
        sessaoB,
      );
      expect(r.status, 'SIM-79: B com o id de G').toBe(404);
      const texto = await r.text();
      expect(texto).not.toContain('Toninho');
      expect(texto).not.toContain(cenario.idsG.jogadorAtivo);

      expect(await retratos()).toEqual(antes);
    },
  };
}

const ROTAS_DO_SIMULADOR: Record<string, Linha> = Object.fromEntries(
  Object.entries(PEDIDOS_DO_SIMULADOR).map(([rota, p]) => [rota, casoDoSimulador(p)]),
);

// ---------------------------------------------------------------- notificações (notificacoes T32)

/**
 * Rotas de push (NOT-53, NOT-54; AD-103). As públicas, com a sessão de B no cookie (o `contextoPublico` a descarta):
 * o slug de G só toca as assinaturas de G e o de H só as de H, mesmo com o endpoint e o `auth` de uma assinatura do
 * outro grupo. As da conta: B, com o mesmo endpoint e `auth` da assinatura de A, não consulta, não apaga nem troca a
 * dela. Os valores semeados nunca aparecem numa resposta (NOT-54). Os pedidos levam as VAPID (`pedirComPush`), senão o
 * `POST` responderia 503 antes de chegar à função.
 */
let pedirComPush: ReturnType<typeof cliente>;
let vapidDoTeste: Partial<Env> = {};

beforeAll(async () => {
  vapidDoTeste = (await chavesVapid()) as Partial<Env>;
  pedirComPush = cliente(aberto.url, vapidDoTeste);
  // G e H no Pro: o push só passa do 403 com o recurso liberado (AD-104).
  await aberto.db.query(
    `UPDATE grupos SET situacao_comercial = 'ativo', trial_inicio = NULL WHERE id IN ($1, $2)`,
    [aberto.cenario.grupoG, aberto.cenario.grupoH],
  );
});

/** Assinaturas semeadas: uma em G, uma em H e uma da conta A, com valores que não podem vazar. */
const SEMEADAS = {
  g: { endpoint: endpointDe('isolamento-g'), ...chavesAssinante(11) },
  h: { endpoint: endpointDe('isolamento-h'), ...chavesAssinante(12) },
  contaA: { endpoint: endpointDe('isolamento-conta-a'), ...chavesAssinante(13) },
};

async function semearPush(): Promise<void> {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM push_ranking WHERE grupo_id IN ($1, $2)', [
    cenario.grupoG,
    cenario.grupoH,
  ]);
  await db.query('DELETE FROM push_conta');
  for (const [grupo, s] of [
    [cenario.grupoG, SEMEADAS.g],
    [cenario.grupoH, SEMEADAS.h],
  ] as const) {
    await db.query(
      'INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
      [grupo, s.endpoint, s.p256dh, s.auth],
    );
  }
  await db.query(
    'INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
    [cenario.contaA, SEMEADAS.contaA.endpoint, SEMEADAS.contaA.p256dh, SEMEADAS.contaA.auth],
  );
}

/** As assinaturas de G, de H e de A, para provar que nada mudou. */
async function retratoDoPush(): Promise<string> {
  const { db, cenario } = aberto;
  const partes = await Promise.all([
    db.query(
      'SELECT grupo_id, endpoint, p256dh, auth FROM push_ranking WHERE grupo_id IN ($1, $2) ORDER BY id',
      [cenario.grupoG, cenario.grupoH],
    ),
    db.query('SELECT endpoint, p256dh, auth FROM push_conta WHERE conta_id = $1 ORDER BY id', [
      cenario.contaA,
    ]),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

/** O texto da resposta não tem nenhum dos valores semeados (NOT-54). */
function semValorSemeado(texto: string, rota: string): void {
  for (const s of Object.values(SEMEADAS)) {
    expect(texto, `${rota}: endpoint`).not.toContain(s.endpoint);
    expect(texto, `${rota}: p256dh`).not.toContain(s.p256dh);
    expect(texto, `${rota}: auth`).not.toContain(s.auth);
  }
}

const corpoComChaves = (s: { endpoint: string; p256dh: string; auth: string }) => ({
  endpoint: s.endpoint,
  chaves: { p256dh: s.p256dh, auth: s.auth },
});
const corpoComAuth = (s: { endpoint: string; auth: string }) => ({
  endpoint: s.endpoint,
  chaves: { auth: s.auth },
});

interface PedidoDePush {
  metodo: 'GET' | 'POST' | 'DELETE';
  caminho: string;
  /** O corpo com o endpoint e as chaves da assinatura do outro dono (H no slug de G; A na sessão de B). */
  corpo?: unknown;
}

/** Rotas públicas de push: com o slug de G e os dados de H, nada de H muda nem aparece; o contrário também. */
function casoPushPublico(p: Omit<PedidoDePush, 'corpo'>, corpoDe?: (s: typeof SEMEADAS.h) => unknown): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      await semearPush();
      const slugH = await slugDe(cenario.grupoH);
      const antes = await retratoDoPush();
      const enviar = (slug: string, dono: typeof SEMEADAS.h) =>
        pedirComPush(`/publico/${slug}${p.caminho}`, {
          metodo: p.metodo,
          sessao: sessaoB,
          ...(corpoDe ? { corpo: corpoDe(dono) } : {}),
        });

      const emG = await enviar(cenario.slugG, SEMEADAS.h);
      semValorSemeado(await emG.text(), `slug de G com a assinatura de H (${p.metodo})`);
      const emH = await enviar(slugH, SEMEADAS.g);
      semValorSemeado(await emH.text(), `slug de H com a assinatura de G (${p.metodo})`);

      if (p.metodo === 'POST' && p.caminho === '/push') {
        // NOT-53: o mesmo endpoint vira linha nova no grupo do slug; a do outro grupo fica igual.
        expect(emG.status).toBe(201);
        expect(emH.status).toBe(201);
        const r = await aberto.db.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM push_ranking WHERE grupo_id IN ($1, $2)',
          [cenario.grupoG, cenario.grupoH],
        );
        expect(r.rows[0]!.n).toBe(4);
        await semearPush();
      } else if (p.caminho === '/push/estado') {
        expect(await emG.json()).toEqual({ assinado: false });
        expect(await emH.json()).toEqual({ assinado: false });
      }
      expect(await retratoDoPush()).toBe(antes);
    },
  };
}

/** Rotas da conta: B, com o endpoint e o `auth` de A, não consulta, não apaga nem troca a assinatura de A. */
function casoPushConta(p: PedidoDePush): Linha {
  return {
    caso: async () => {
      await semearPush();
      const antes = await retratoDoPush();
      const r = await pedirComPush(p.caminho, {
        metodo: p.metodo,
        sessao: sessaoB,
        ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
      });
      expect(r.status, `${p.metodo} ${p.caminho} da conta B`).toBeLessThan(300);
      const texto = await r.text();
      semValorSemeado(texto, `${p.metodo} ${p.caminho}`);
      if (p.caminho === '/conta/push/estado') expect(JSON.parse(texto)).toEqual({ assinado: false });
      expect(await retratoDoPush()).toBe(antes);
      await aberto.db.query('DELETE FROM push_conta WHERE conta_id = $1', [aberto.cenario.contaB]);
    },
  };
}

const ROTAS_DE_PUSH: Record<string, Linha> = {
  'GET /api/publico/:slug/push': casoPushPublico({ metodo: 'GET', caminho: '/push' }),
  'POST /api/publico/:slug/push': casoPushPublico({ metodo: 'POST', caminho: '/push' }, corpoComChaves),
  'DELETE /api/publico/:slug/push': casoPushPublico(
    { metodo: 'DELETE', caminho: '/push' },
    corpoComAuth,
  ),
  'POST /api/publico/:slug/push/estado': casoPushPublico(
    { metodo: 'POST', caminho: '/push/estado' },
    corpoComAuth,
  ),
  'GET /api/conta/push': casoPushConta({ metodo: 'GET', caminho: '/conta/push' }),
  'POST /api/conta/push': casoPushConta({
    metodo: 'POST',
    caminho: '/conta/push',
    corpo: corpoComChaves({ ...SEMEADAS.contaA, ...chavesAssinante(14) }),
  }),
  'DELETE /api/conta/push': casoPushConta({
    metodo: 'DELETE',
    caminho: '/conta/push',
    corpo: corpoComAuth(SEMEADAS.contaA),
  }),
  'POST /api/conta/push/estado': casoPushConta({
    metodo: 'POST',
    caminho: '/conta/push/estado',
    corpo: corpoComAuth(SEMEADAS.contaA),
  }),
};

// ---------------------------------------------------------------- planos e cobrança (T39)

/** Asaas em memória das rotas do plano: nenhuma tentativa cruzada pode chamá-lo (PLA-32). */
const asaasDoIsolamento = asaasMemoria();
const TOKEN_WEBHOOK_ISOLAMENTO = 'token-do-webhook-do-isolamento-t39';
const FATURA_DE_G = 'https://sandbox.asaas.com/i/pay_t39_de_g';
const FATURA_DE_H = 'https://sandbox.asaas.com/i/pay_t39_de_h';

/** O que do plano de G e de H nenhuma rota cruzada pode mudar. */
async function retratoDoPlano(): Promise<string> {
  const { db, cenario } = aberto;
  const grupos = [cenario.grupoG, cenario.grupoH];
  const partes = await Promise.all([
    db.query(
      `SELECT id, situacao_comercial, trial_inicio::text FROM grupos WHERE id = ANY($1::uuid[]) ORDER BY id`,
      [grupos],
    ),
    db.query(
      `SELECT grupo_id, asaas_assinatura_id, situacao, pago_ate::text, fatura_url FROM assinaturas
        WHERE grupo_id = ANY($1::uuid[]) ORDER BY asaas_assinatura_id`,
      [grupos],
    ),
    db.query(
      `SELECT count(*)::int AS n FROM auditoria WHERE grupo_id = ANY($1::uuid[]) AND acao LIKE 'plano\\_%' ESCAPE '\\'`,
      [grupos],
    ),
  ]);
  return JSON.stringify(partes.map((p) => p.rows));
}

/** Uma assinatura pendente em G (de C) e outra em H (de B), com a fatura, apagadas no fim do caso. */
async function comAssinaturasSemeadas(fn: () => Promise<void>): Promise<void> {
  const { db, cenario } = aberto;
  await db.query(
    `INSERT INTO assinaturas (grupo_id, asaas_cliente_id, asaas_assinatura_id, valor_centavos, situacao, fatura_url,
       criada_por, criada_em)
     VALUES ($1, 'cus_t39_g', 'sub_t39_g', 990, 'aguardando_pagamento', $2, $3, now()),
            ($4, 'cus_t39_h', 'sub_t39_h', 990, 'aguardando_pagamento', $5, $6, now())`,
    [cenario.grupoG, FATURA_DE_G, cenario.contaC, cenario.grupoH, FATURA_DE_H, cenario.contaB],
  );
  try {
    await fn();
  } finally {
    await db.query(`DELETE FROM assinaturas WHERE asaas_assinatura_id IN ('sub_t39_g', 'sub_t39_h')`);
  }
}

/** Pedido ao app com o Asaas em memória (o `cliente` do apoio não o recebe). */
async function pedirComAsaas(
  caminho: string,
  p: { metodo: string; sessao?: string; corpo?: unknown; token?: string },
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    'cf-connecting-ip': '203.0.113.39',
  });
  if (p.sessao) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${p.sessao}`);
  if (p.token) headers.set('asaas-access-token', p.token);
  const ctx = contextoFalso();
  const r = await criarApp({ fabricaBanco: fabricaComoApp().fabrica, asaas: asaasDoIsolamento }).request(
    `/api${caminho}`,
    {
      method: p.metodo,
      headers,
      ...(p.corpo !== undefined ? { body: JSON.stringify(p.corpo) } : {}),
    },
    envAcesso(aberto.url, { ASAAS_WEBHOOK_TOKEN: TOKEN_WEBHOOK_ISOLAMENTO }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

/** Caso de rota de grupo do plano: B contra G e C contra H dão 404, sem Asaas, sem fatura do outro e sem mudança. */
function casoDoPlano(p: { metodo: string; corpo?: unknown }): Linha {
  return {
    caso: async () => {
      const { cenario } = aberto;
      await comAssinaturasSemeadas(async () => {
        const antes = await retratoDoPlano();
        asaasDoIsolamento.limpar();

        const bEmG = await pedirComAsaas(`/grupos/${cenario.grupoG}/${p.metodo === 'GET' ? 'plano' : 'assinatura'}`, {
          metodo: p.metodo,
          sessao: sessaoB,
          ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
        });
        expect(bEmG.status, `PLA-09: B com o id de G (${p.metodo})`).toBe(404);
        expect(await bEmG.text()).not.toContain(FATURA_DE_G);

        const cEmH = await pedirComAsaas(`/grupos/${cenario.grupoH}/${p.metodo === 'GET' ? 'plano' : 'assinatura'}`, {
          metodo: p.metodo,
          sessao: sessaoA,
          ...(p.corpo !== undefined ? { corpo: p.corpo } : {}),
        });
        expect(cEmH.status, `PLA-09: C com o id de H (${p.metodo})`).toBe(404);
        expect(await cEmH.text()).not.toContain(FATURA_DE_H);

        expect(asaasDoIsolamento.chamadas, 'PLA-32: nenhuma chamada ao Asaas').toEqual([]);
        expect(await retratoDoPlano()).toBe(antes);
      });
    },
  };
}

const ROTAS_DO_PLANO: Record<string, Linha> = {
  'GET /api/grupos/:grupoId/plano': casoDoPlano({ metodo: 'GET' }),
  'POST /api/grupos/:grupoId/assinatura': casoDoPlano({
    metodo: 'POST',
    corpo: { nome: 'Intrusa da Silva', cpf: '529.982.247-25' },
  }),
  'DELETE /api/grupos/:grupoId/assinatura': casoDoPlano({ metodo: 'DELETE' }),
  'POST /api/webhooks/asaas': {
    caso: async () => {
      await comAssinaturasSemeadas(async () => {
        const antes = await retratoDoPlano();
        // Sem o token, a sessão de B não dá acesso a nada: 401, e o corpo com a assinatura de G não muda G.
        const corpo = {
          id: 'evt_t39_isolamento',
          event: 'SUBSCRIPTION_DELETED',
          dateCreated: '2026-11-05 10:00:00',
          subscription: { id: 'sub_t39_g' },
        };
        const r = await pedirComAsaas('/webhooks/asaas', { metodo: 'POST', sessao: sessaoB, corpo });
        expect(r.status, 'webhook sem token, com a sessão de B').toBe(401);
        expect(await r.text()).not.toContain(FATURA_DE_G);
        expect(await retratoDoPlano()).toBe(antes);
        const gravados = await aberto.db.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM eventos_asaas WHERE id = 'evt_t39_isolamento'`,
        );
        expect(gravados.rows[0]!.n).toBe(0);
      });
    },
  },
};

/** Uma linha por rota do Hono (`MÉTODO caminho`). */
const TABELA: Record<string, Linha> = {
  ...ROTAS_DO_PLANO,
  ...ROTAS_DE_GRUPO,
  ...ROTAS_DO_FINANCEIRO,
  ...ROTAS_DE_PARTIDAS,
  ...ROTAS_PUBLICAS,
  ...ROTAS_DO_SIMULADOR,
  ...ROTAS_DE_PUSH,
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
      const r = await pedir('/conta/senha', {
        corpo: { senhaAtual: aberto.cenario.senhaA, senhaNova: 'outra senha 123' },
        sessao: sessaoB,
      });
      expect(r.status).toBe(401);
    },
  },
  'POST /api/conta/excluir': {
    caso: async () => {
      const r = await pedir('/conta/excluir', {
        corpo: { senha: aberto.cenario.senhaA },
        sessao: sessaoB,
      });
      expect(r.status).toBe(401);
    },
  },
  'POST /api/convites/aceitar': {
    caso: async () => {
      // Convite do grupo A para outro e-mail: B não vira admin de A.
      const token = await conviteDeTeste(
        aberto.db,
        aberto.cenario.grupoA,
        'isolamento@exemplo.test',
        aberto.cenario.contaA,
      );
      const r = await pedir('/convites/aceitar', { corpo: { token }, sessao: sessaoB });
      expect(r.status).toBe(403);
      await aberto.db.query(
        `UPDATE convites_admin SET cancelado_em = now() WHERE email = 'isolamento@exemplo.test'`,
      );
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
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/convites`, {
        corpo: { email: 'intrusa@exemplo.test' },
        sessao: sessaoB,
      });
      expect(r.status).toBe(404);
    },
  },
  'DELETE /api/grupos/:grupoId/admins/convites/:id': {
    caso: async () => {
      const c = await aberto.db.query<{ id: string }>(
        'SELECT id FROM convites_admin WHERE grupo_id = $1 LIMIT 1',
        [aberto.cenario.grupoA],
      );
      const id = c.rows[0]?.id ?? '00000000-0000-4000-8000-000000000000';
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/convites/${id}`, {
        metodo: 'DELETE',
        sessao: sessaoB,
      });
      expect(r.status).toBe(404);
    },
  },
  'DELETE /api/grupos/:grupoId/admins/:contaId': {
    caso: async () => {
      const r = await pedir(`/grupos/${aberto.cenario.grupoA}/admins/${aberto.cenario.contaA}`, {
        metodo: 'DELETE',
        sessao: sessaoB,
      });
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
    const app = criarApp({
      registrarExtras: (api) => api.get('/teste/rota-nova', (c) => c.json({ ok: true })),
    });
    expect(rotasSemLinha(app, TABELA)).toEqual(['GET /api/teste/rota-nova']);
  });

  it('FIN-33: toda rota do financeiro registrada tem pedido na lista do financeiro', () => {
    const doFinanceiro = rotasDoApp(criarApp()).filter((r) => r.includes('/financeiro'));
    expect(doFinanceiro.length).toBeGreaterThanOrEqual(9);
    expect(doFinanceiro.filter((r) => !(r in PEDIDOS_DO_FINANCEIRO))).toEqual([]);
    const comNova = criarApp({
      registrarExtras: (api) =>
        api.get('/grupos/:grupoId/financeiro/nova', (c) => c.json({ ok: true })),
    });
    expect(
      rotasDoApp(comNova).filter((r) => r.includes('/financeiro') && !(r in PEDIDOS_DO_FINANCEIRO)),
    ).toEqual(['GET /api/grupos/:grupoId/financeiro/nova']);
  });

  it('PAR-138: as 13 rotas de admin da partidas-e-ranking estão no app e têm caso de isolamento', () => {
    const rotas = new Set(rotasDoApp(criarApp()));
    const deAdmin = [...Object.keys(PEDIDOS_DE_PARTIDAS), 'GET /api/grupos/:grupoId'];
    expect(deAdmin).toHaveLength(13);
    for (const rota of deAdmin) {
      expect(rotas.has(rota), rota).toBe(true);
      expect('caso' in (TABELA[rota] ?? {}), rota).toBe(true);
    }
  });

  it('PAR-137: o meta-teste falha com uma rota nova de partidas ou pública sem caso', () => {
    const app = criarApp({
      registrarExtras: (api) => {
        api.get('/grupos/:grupoId/partidas/:data/extra', (c) => c.json({ ok: true }));
        api.get('/publico/:slug/extra', (c) => c.json({ ok: true }));
      },
    });
    const novas = ['GET /api/grupos/:grupoId/partidas/:data/extra', 'GET /api/publico/:slug/extra'];
    const semLinha = rotasSemLinha(app, TABELA);
    for (const rota of novas) expect(semLinha, rota).toContain(rota);
    // Sem as rotas extras, nenhuma rota de partidas, pesos, uso, prévia ou pública fica sem linha.
    const daFeature =
      /\/(pesos|partidas|uso)\b|\/jogadores\/:id\/(reativar|periodos\/:periodoId|inicio)\/previa$|\/api\/publico\//;
    expect(rotasSemLinha(criarApp(), TABELA).filter((r) => daFeature.test(r))).toEqual([]);
  });

  it('PAR-139: as 3 rotas públicas estão no app e têm caso', () => {
    const publicas = rotasDoApp(criarApp()).filter((r) => r.includes('/api/publico/'));
    expect(publicas.sort()).toEqual(Object.keys(PEDIDOS_PUBLICOS).sort());
    for (const rota of publicas) expect('caso' in (TABELA[rota] ?? {}), rota).toBe(true);
  });

  it.each(Object.entries(PEDIDOS_DO_FINANCEIRO))(
    'FIN-33: %s com a admin de G sem acesso dá 403 sem_permissao_financeiro e nada muda',
    async (_rota, p) => {
      const { cenario } = aberto;
      const antes = await retratoDoCaixa(cenario.grupoG);
      // No PATCH de acesso, O tenta mudar o acesso de C.
      const ids = { ...idsDoCaixaDeG(), conta: cenario.contaC };
      const r = await enviarAoCaixa(p, cenario.grupoG, ids, sessaoO);
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        erro: 'Você não tem acesso ao financeiro deste grupo.',
        codigo: 'sem_permissao_financeiro',
      });
      expect(await retratoDoCaixa(cenario.grupoG)).toBe(antes);
    },
  );

  it('FIN-37: com G arquivado, a criadora recebe 409 nas escritas e 200 nas leituras; a outra admin, 404 em tudo', async () => {
    const { db, cenario } = aberto;
    const antes = await retratoDoCaixa(cenario.grupoG);
    await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]);
    try {
      for (const [rota, p] of Object.entries(PEDIDOS_DO_FINANCEIRO)) {
        const daCriadora = await enviarAoCaixa(p, cenario.grupoG, idsDoCaixaDeG(), sessaoA);
        if (p.metodo === 'GET') {
          expect(daCriadora.status, `${rota}: leitura da criadora`).toBe(200);
        } else {
          expect(daCriadora.status, `${rota}: escrita da criadora`).toBe(409);
          expect(await daCriadora.json()).toMatchObject({ codigo: 'grupo_arquivado' });
        }
        const daOutra = await enviarAoCaixa(p, cenario.grupoG, idsDoCaixaDeG(), sessaoO);
        expect(daOutra.status, `${rota}: outra admin`).toBe(404);
      }
    } finally {
      await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [cenario.grupoG]);
    }
    expect(await retratoDoCaixa(cenario.grupoG)).toBe(antes);
  });

  it('SIM-83: as 5 rotas do simulador estão no app e têm caso; o meta-teste falha com uma rota nova sem caso', () => {
    const rotas = new Set(rotasDoApp(criarApp()));
    expect(Object.keys(PEDIDOS_DO_SIMULADOR)).toHaveLength(5);
    for (const rota of Object.keys(PEDIDOS_DO_SIMULADOR)) {
      expect(rotas.has(rota), rota).toBe(true);
      expect('caso' in (TABELA[rota] ?? {}), rota).toBe(true);
    }
    const comNova = criarApp({
      registrarExtras: (api) => {
        api.post('/grupos/:grupoId/simulador/extra', (c) => c.json({ ok: true }));
        api.get('/grupos/:grupoId/escalacoes/extra', (c) => c.json({ ok: true }));
      },
    });
    expect(rotasSemLinha(comNova, TABELA).sort()).toEqual([
      'GET /api/grupos/:grupoId/escalacoes/extra',
      'POST /api/grupos/:grupoId/simulador/extra',
    ]);
    // Sem as extras, nenhuma rota do simulador ou de escalação fica sem linha.
    const doSimulador = /\/(simulador|escalacoes)\b/;
    expect(rotasSemLinha(criarApp(), TABELA).filter((r) => doSimulador.test(r))).toEqual([]);
  });

  it.each(Object.entries(PEDIDOS_DO_SIMULADOR))(
    'SIM-79: %s sem sessão dá 401 e nada muda',
    async (_rota, p) => {
      const { cenario } = aberto;
      const antes = await retratoDoSimulador(cenario.grupoG);
      const r = await enviarAoSimulador(
        p,
        cenario.grupoG,
        idsDoSimulador(cenario.idsG.jogadorAtivo, deH.jogador),
      );
      expect(r.status).toBe(401);
      expect(await r.text()).not.toContain('Toninho');
      expect(await retratoDoSimulador(cenario.grupoG)).toBe(antes);
    },
  );

  it.each(Object.entries(PEDIDOS_DO_SIMULADOR).filter(([, p]) => p.comJogadores))(
    'SIM-80: %s com o jogador de H em G (e o de G em H) dá 422 sem o apelido nem o id do outro grupo',
    async (_rota, p) => {
      const { cenario } = aberto;
      const antes = [
        await retratoDoSimulador(cenario.grupoG),
        await retratoDoSimulador(cenario.grupoH),
      ];

      const emG = await enviarAoSimulador(
        p,
        cenario.grupoG,
        idsDoSimulador(cenario.idsG.jogadorAtivo, deH.jogador),
        sessaoA,
      );
      expect(emG.status, 'A em G com o jogador de H').toBe(422);
      const textoG = await emG.text();
      expect(textoG).not.toContain('Isolado de H');
      expect(textoG).not.toContain(deH.jogador);
      expect(JSON.parse(textoG)).toMatchObject({ codigo: 'dados_invalidos' });

      const emH = await enviarAoSimulador(
        p,
        cenario.grupoH,
        idsDoSimulador(deH.jogador, cenario.idsG.jogadorAtivo),
        sessaoB,
      );
      expect(emH.status, 'B em H com o jogador de G').toBe(422);
      const textoH = await emH.text();
      expect(textoH).not.toContain('Toninho');
      expect(textoH).not.toContain(cenario.idsG.jogadorAtivo);

      expect([
        await retratoDoSimulador(cenario.grupoG),
        await retratoDoSimulador(cenario.grupoH),
      ]).toEqual(antes);
    },
  );

  it('SIM-83: com G arquivado, os POST do simulador dão 409 à criadora e a leitura do contexto, 200', async () => {
    const { db, cenario } = aberto;
    const antes = await retratoDoSimulador(cenario.grupoG);
    await db.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]);
    try {
      for (const [rota, p] of Object.entries(PEDIDOS_DO_SIMULADOR)) {
        const r = await enviarAoSimulador(
          p,
          cenario.grupoG,
          idsDoSimulador(cenario.idsG.jogadorAtivo, SEM_JOGADOR_1),
          sessaoA,
        );
        if (p.metodo === 'GET') {
          expect(r.status, `${rota}: leitura da criadora`).toBe(200);
        } else {
          expect(r.status, `${rota}: escrita da criadora`).toBe(409);
          expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
        }
      }
    } finally {
      await db.query('UPDATE grupos SET arquivado_em = NULL WHERE id = $1', [cenario.grupoG]);
    }
    expect(await retratoDoSimulador(cenario.grupoG)).toBe(antes);
  });

  it('NOT-54: as 8 rotas de push estão no app e têm caso; uma rota de push nova sem caso reprova', () => {
    const rotas = new Set(rotasDoApp(criarApp()));
    expect(Object.keys(ROTAS_DE_PUSH)).toHaveLength(8);
    for (const rota of Object.keys(ROTAS_DE_PUSH)) {
      expect(rotas.has(rota), rota).toBe(true);
      expect('caso' in (TABELA[rota] ?? {}), rota).toBe(true);
    }
    const comNova = criarApp({
      registrarExtras: (api) => {
        api.get('/publico/:slug/push/extra', (c) => c.json({ ok: true }));
        api.get('/conta/push/extra', (c) => c.json({ ok: true }));
      },
    });
    expect(rotasSemLinha(comNova, TABELA).filter((r) => r.includes('/push')).sort()).toEqual([
      'GET /api/conta/push/extra',
      'GET /api/publico/:slug/push/extra',
    ]);
  });

  it('PLA-09: as 4 rotas do plano estão no app e têm caso; uma rota de plano nova sem caso reprova', () => {
    const rotas = new Set(rotasDoApp(criarApp()));
    expect(Object.keys(ROTAS_DO_PLANO)).toHaveLength(4);
    for (const rota of Object.keys(ROTAS_DO_PLANO)) {
      expect(rotas.has(rota), rota).toBe(true);
      expect('caso' in (TABELA[rota] ?? {}), rota).toBe(true);
    }
    const comNova = criarApp({
      registrarExtras: (api) => {
        api.get('/grupos/:grupoId/assinatura/extra', (c) => c.json({ ok: true }));
        api.post('/webhooks/asaas/extra', (c) => c.json({ ok: true }));
      },
    });
    expect(
      rotasSemLinha(comNova, TABELA)
        .filter((r) => r.includes('/assinatura') || r.includes('/webhooks'))
        .sort(),
    ).toEqual(['GET /api/grupos/:grupoId/assinatura/extra', 'POST /api/webhooks/asaas/extra']);
  });

  it('NOT-54: nenhuma resposta GET do app, nem da criadora e admin de G, contém endpoint, p256dh ou auth semeados', async () => {
    const { cenario } = aberto;
    await semearPush();
    const valores: Record<string, string> = {
      grupoId: cenario.grupoG,
      slug: cenario.slugG,
      id: cenario.idsG.jogadorAtivo,
      jogadorId: cenario.idsG.jogadorAtivo,
      data: DATA_DE_G,
      periodoId: periodoDeG,
      habilidadeId: cenario.idsG.habilidade,
      contaId: cenario.contaA,
      mes: '2026-01',
    };
    const gets = rotasDoApp(criarApp()).filter((r) => r.startsWith('GET '));
    let lidas = 0;
    for (const rota of gets) {
      const caminho = rota.slice('GET /api'.length);
      const params = [...caminho.matchAll(/:(\w+)/g)].map((m) => m[1]!);
      if (params.some((p) => !(p in valores))) continue;
      const concreto = caminho.replace(/:(\w+)/g, (_t, p: string) => valores[p]!);
      for (const sessaoDaVez of [sessaoA, sessaoO]) {
        const r = await pedirComPush(concreto, { sessao: sessaoDaVez });
        semValorSemeado(await r.text(), rota);
      }
      lidas += 1;
    }
    expect(lidas).toBeGreaterThan(10);
  });

  const casos = Object.entries(TABELA).filter(
    (e): e is [string, { caso: () => Promise<void> }] => 'caso' in e[1],
  );

  it.each(casos)(
    'ACE-41: %s com a conta B não muda nada do grupo nem da conta de A',
    async (_rota, linha) => {
      limparCaixa();
      await aberto.db.query('DELETE FROM pedidos_email_origem');
      const antes = await retratoDeA();
      await linha.caso();
      expect(await retratoDeA()).toBe(antes);
    },
  );
});
