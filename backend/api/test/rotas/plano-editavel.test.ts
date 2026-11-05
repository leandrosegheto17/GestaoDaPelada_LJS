import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { erroSomenteLeitura } from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { operacaoNaTrava } from '../../src/entrada/middlewares/plano-editavel.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  criarGrupoComoConta,
  NOME_G,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `exigirPlanoEditavel` (planos-e-cobranca T22; PLA-15, PLA-17, PLA-18, PLA-20, PLA-21; AD-092), com o app real como
 * `pelada_app` e o relógio fixo em 2026-11-20 (12h de São Paulo). G (de C, com O convidada) é posto em `trial` desde
 * 2026-10-01 (vencido em 2026-10-15: Free) como superusuário; o `afterAll` devolve a situação original. G tem 2 ativos
 * no cenário; o describe do excedente acrescenta 19 (21 ativos) e os inativa no fim.
 *
 * Evidência da rede (registrar na T22 do tasks.md, pelo /executar): tirar o `exigirPlanoEditavel` da cadeia deixa
 * vermelhos "partida 403" e "G2 403"; trocar `operacaoNaTrava` para devolver `escrita` no inativar deixa vermelho
 * "inativar 200".
 */

const DATA_PARTIDA = '2026-11-19';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo('2026-11-20T15:00:00Z') });

let aberto: CenarioGruposAberto;
let g2: string;
let original: { s: string; t: string | null };
const extras: string[] = [];

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function pedir(
  metodo: string,
  caminho: string,
  corpo?: unknown,
  conta = aberto.cenario.contaC,
): Promise<Response> {
  const headers = new Headers({
    'x-pelada': '1',
    'content-type': 'application/json',
    cookie: `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`,
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api${caminho}`,
    { method: metodo, headers, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }) },
    envAcesso(aberto.url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function situacao(grupo: string, s: string, t: string | null): Promise<void> {
  await aberto.db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = $3::date WHERE id = $1', [grupo, s, t]);
}

async function ativo(grupo: string, apelido: string, conta: string): Promise<string> {
  const { db } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'meia', $3, now(), $3, now()) RETURNING id`,
    [grupo, apelido, conta],
  );
  const id = r.rows[0]!.id;
  await db.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, '2026-01-01', NULL)`, [
    id,
    grupo,
  ]);
  return id;
}

async function contagens(grupo: string): Promise<Record<string, number>> {
  const r = await aberto.db.query<{ tabela: string; n: number }>(
    `SELECT 'partidas' AS tabela, count(*)::int AS n FROM partidas WHERE grupo_id = $1
     UNION ALL SELECT 'jogadores', count(*)::int FROM jogadores WHERE grupo_id = $1
     UNION ALL SELECT 'periodos', count(*)::int FROM periodos_ativos WHERE grupo_id = $1
     UNION ALL SELECT 'habilidades', count(*)::int FROM habilidades WHERE grupo_id = $1
     UNION ALL SELECT 'auditoria', count(*)::int FROM auditoria WHERE grupo_id = $1`,
    [grupo],
  );
  return Object.fromEntries(r.rows.map((l) => [l.tabela, l.n]));
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { cenario, db } = aberto;
  const r = await db.query<{ s: string; t: string | null }>(
    'SELECT situacao_comercial AS s, trial_inicio::text AS t FROM grupos WHERE id = $1',
    [cenario.grupoG],
  );
  original = r.rows[0]!;
  // G2 nasce depois de G: G é o mais antigo da criadora, o único editável no Free (PLA-17).
  g2 = (await criarGrupoComoConta(db, cenario.contaC, 'Pelada de Sábado', 'pelada-de-sabado-t22')).id;
});

afterAll(async () => {
  if (aberto) {
    await situacao(aberto.cenario.grupoG, original.s, original.t);
    await aberto.fechar();
  }
});

describe('operacaoNaTrava', () => {
  const g = '/api/grupos/00000000-0000-4000-8000-000000000001';
  it.each([
    ['GET', `${g}/jogadores`, null],
    ['HEAD', g, null],
    ['POST', `${g}/jogadores/x/reativar/previa`, null],
    ['POST', `${g}/jogadores/x/periodos/y/previa`, null],
    ['POST', `${g}/jogadores/x/inativar`, 'inativar_jogador'],
    ['POST', `${g}/jogadores/x/reativar`, 'reativar_jogador'],
    ['POST', `${g}/jogadores`, 'cadastrar_jogador'],
    ['PATCH', g, 'escrita'],
    ['PATCH', `${g}/jogadores/x`, 'escrita'],
    ['DELETE', `${g}/jogadores/x`, 'escrita'],
    ['PUT', `${g}/jogadores/x/notas/h`, 'escrita'],
    ['PATCH', `${g}/jogadores/x/periodos/y`, 'escrita'],
    ['PUT', `${g}/jogadores/x/inicio`, 'escrita'],
    ['POST', `${g}/habilidades`, 'escrita'],
    ['DELETE', `${g}/habilidades/h`, 'escrita'],
    ['POST', `${g}/partidas`, 'escrita'],
    ['PUT', `${g}/partidas/2026-11-19`, 'escrita'],
    ['DELETE', `${g}/partidas/2026-11-19`, 'escrita'],
    ['POST', `${g}/pesos`, 'escrita'],
    ['POST', `${g}/arquivar`, null],
    ['POST', `${g}/reativar`, null],
    ['POST', `${g}/admins/convites`, null],
    ['DELETE', `${g}/admins/c`, null],
    ['PATCH', `${g}/admins/c/financeiro`, null],
    ['POST', `${g}/assinatura`, null],
    ['DELETE', `${g}/assinatura`, null],
    ['POST', `${g}/simulador/sugerir`, null],
    ['POST', `${g}/escalacoes`, null],
    ['POST', `${g}/financeiro/lancamentos`, null],
    ['post', `${g}/partidas`, 'escrita'],
    ['POST', `${g}/rota-nova`, 'escrita'],
  ] as const)('PLA-15: %s %s → %s', (metodo, caminho, esperado) => {
    expect(operacaoNaTrava(metodo, caminho)).toBe(esperado);
  });
});

describe('excedente de jogadores no Free (21 ativos)', () => {
  let inativado: string | null = null;

  beforeAll(async () => {
    const { cenario } = aberto;
    await situacao(cenario.grupoG, 'trial', '2026-10-01');
    for (let i = 0; i < 19; i++) extras.push(await ativo(cenario.grupoG, `Extra ${i + 1}`, cenario.contaC));
  });

  afterEach(async () => {
    await aberto.db.query('DELETE FROM partidas WHERE grupo_id = $1 AND id <> $2', [
      aberto.cenario.grupoG,
      aberto.cenario.idsG.partida,
    ]);
  });

  afterAll(async () => {
    await aberto.db.query(
      `UPDATE periodos_ativos SET fim = '2026-01-02' WHERE jogador_id = ANY($1::uuid[]) AND fim IS NULL`,
      [extras],
    );
  });

  it('PLA-18: os GET do grupo somente leitura devolvem o mesmo corpo de antes da queda', async () => {
    const { cenario } = aberto;
    const caminhos = ['', '/jogadores', '/habilidades', '/partidas', '/pesos'].map((s) => `/grupos/${cenario.grupoG}${s}`);
    await situacao(cenario.grupoG, 'uso_proprio', null);
    const antes = await Promise.all(caminhos.map(async (c) => ({ c, r: await pedir('GET', c) })));
    const corposAntes = await Promise.all(antes.map(async ({ r }) => ({ status: r.status, corpo: await r.json() })));
    await situacao(cenario.grupoG, 'trial', '2026-10-01');
    const depois = await Promise.all(caminhos.map((c) => pedir('GET', c)));
    const corposDepois = await Promise.all(depois.map(async (r) => ({ status: r.status, corpo: await r.json() })));
    expect(corposDepois).toEqual(corposAntes);
    for (const { status } of corposDepois) expect(status).toBe(200);
  });

  it('PLA-15: trial vencido com 21 ativos → POST …/partidas 403 limite_jogadores e nada gravado', async () => {
    const { cenario } = aberto;
    const antes = await contagens(cenario.grupoG);
    const r = await pedir('POST', `/grupos/${cenario.grupoG}/partidas`, {
      data: DATA_PARTIDA,
      choveu: false,
      marcacoes: [],
    });
    expect(r.status).toBe(403);
    const corpo = await r.json();
    expect(erroSomenteLeitura.parse(corpo)).toMatchObject({ erro: 'somente_leitura', motivo: 'limite_jogadores' });
    expect(await contagens(cenario.grupoG)).toEqual(antes);
  });

  it('PLA-15: PATCH do grupo, nota e habilidade também recebem 403 limite_jogadores', async () => {
    const { cenario } = aberto;
    const g = `/grupos/${cenario.grupoG}`;
    const respostas = await Promise.all([
      pedir('PATCH', g, { nome: NOME_G, diaSemana: 'quinta', frequencia: 'semanal', horario: '21:00' }),
      pedir('POST', `${g}/habilidades`, { nome: 'Cabeceio' }),
      pedir('POST', `${g}/jogadores`, { apelido: 'Novo', posicao: 'meia' }),
    ]);
    for (const r of respostas) {
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ erro: 'somente_leitura', motivo: 'limite_jogadores' });
    }
  });

  it('PLA-21: a prévia (só leitura) passa pela trava', async () => {
    const { cenario } = aberto;
    const r = await pedir('POST', `/grupos/${cenario.grupoG}/jogadores/${extras[0]}/reativar/previa`, {});
    expect(r.status).not.toBe(403);
  });

  it('PLA-15: POST …/inativar responde 200 com 21 ativos', async () => {
    const { cenario } = aberto;
    inativado = extras[extras.length - 1]!;
    const r = await pedir('POST', `/grupos/${cenario.grupoG}/jogadores/${inativado}/inativar`, { data: DATA_PARTIDA });
    expect(r.status).toBe(200);
  });

  it('PLA-20: depois de inativar um (20 ativos), o mesmo POST …/partidas é aceito', async () => {
    const { cenario } = aberto;
    expect(inativado).not.toBeNull();
    const r = await pedir('POST', `/grupos/${cenario.grupoG}/partidas`, {
      data: DATA_PARTIDA,
      choveu: false,
      marcacoes: [],
    });
    expect(r.status).toBe(201);
  });

  it('PLA-16 (via T22): com 20 ativos, cadastrar jogador ainda recebe 403 limite_jogadores', async () => {
    const { cenario } = aberto;
    const r = await pedir('POST', `/grupos/${cenario.grupoG}/jogadores`, { apelido: 'Vigésimo Primeiro', posicao: 'meia' });
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ erro: 'somente_leitura', motivo: 'limite_jogadores' });
  });

  it('PLA-15: grupo em trial válido com 20 ativos não trava', async () => {
    const { cenario } = aberto;
    await situacao(cenario.grupoG, 'trial', '2026-11-10');
    try {
      const r = await pedir('POST', `/grupos/${cenario.grupoG}/partidas`, {
        data: DATA_PARTIDA,
        choveu: false,
        marcacoes: [],
      });
      expect(r.status).toBe(201);
    } finally {
      await situacao(cenario.grupoG, 'trial', '2026-10-01');
    }
  });
});

describe('segundo grupo Free da criadora (PLA-17)', () => {
  beforeAll(async () => {
    await situacao(aberto.cenario.grupoG, 'trial', '2026-10-01');
    await situacao(g2, 'trial', '2026-10-01');
  });

  it('PLA-17: criadora com dois grupos Free edita o mais antigo e recebe 403 limite_grupos no outro', async () => {
    const { cenario } = aberto;
    const noAntigo = await pedir('PATCH', `/grupos/${cenario.grupoG}`, {
      nome: NOME_G,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    });
    expect(noAntigo.status).toBe(200);
    const antes = await contagens(g2);
    const noNovo = await pedir('PATCH', `/grupos/${g2}`, {
      nome: 'Pelada de Sábado',
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '21:00',
    });
    expect(noNovo.status).toBe(403);
    expect(await noNovo.json()).toMatchObject({ erro: 'somente_leitura', motivo: 'limite_grupos' });
    expect(await contagens(g2)).toEqual(antes);
  });

  it('PLA-17: com o grupo novo em Pro, o antigo segue editável e o novo também', async () => {
    const { cenario } = aberto;
    await situacao(g2, 'ativo', null);
    try {
      const r = await pedir('PATCH', `/grupos/${g2}`, {
        nome: 'Pelada de Sábado',
        diaSemana: 'quinta',
        frequencia: 'semanal',
        horario: '20:00',
      });
      expect(r.status).toBe(200);
      const g = await pedir('PATCH', `/grupos/${cenario.grupoG}`, {
        nome: NOME_G,
        diaSemana: 'quinta',
        frequencia: 'semanal',
        horario: '20:00',
      });
      expect(g.status).toBe(200);
    } finally {
      await situacao(g2, 'trial', '2026-10-01');
    }
  });
});
