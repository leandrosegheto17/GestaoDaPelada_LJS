import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  camposProibidosEm,
  MAX_COLUNAS_PDF,
  MENSAGEM_MES_FORA_DO_HISTORICO,
  MENSAGEM_MES_PUBLICO,
  pdfPublico,
} from '@pelada/contrato';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { criarApp } from '../../src/entrada/app.ts';
import { MENSAGEM_LIMITE } from '../../src/entrada/middlewares/limite-taxa.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  NOME_G,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/publico/:slug/pdf?mes=` (partidas-e-ranking T46; PAR-95, PAR-100, PAR-101), com o app real como
 * `pelada_app` e o relógio fixo em 14/03/2026. O `beforeAll` grava em G as quintas de 2025-11-06 a 2025-12-25 (8) e
 * de 2026-01-15 a 2026-03-12 (9), que com a de 2026-01-08 do cenário somam 18 partidas: o PDF de março passa de 12
 * colunas. Toninho, ativo desde 2025-11-01, é presente em todas; a primeira partida é de 2025-11.
 */

let aberto: CenarioGruposAberto;

const AGORA = '2026-03-14T15:00:00.000Z';
const URL_PUBLICA = 'https://pelada.exemplo.test';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

async function pdf(slug: string, consulta = '', extra: Partial<Env> = {}): Promise<Response> {
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${slug}/pdf${consulta}`,
    { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.9' } },
    envAcesso(aberto.url, { URL_PUBLICA, ...extra }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

async function ranking(slug: string, consulta = '', extra: Partial<Env> = {}): Promise<Response> {
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${slug}/ranking${consulta}`,
    { method: 'GET', headers: { 'cf-connecting-ip': '203.0.113.9' } },
    envAcesso(aberto.url, { URL_PUBLICA, ...extra }),
    ctx,
  );
  await ctx.esperar();
  return r;
}

/** Quintas de `de` até `ate`, inclusive. */
function quintas(de: string, ate: string): string[] {
  const datas: string[] = [];
  for (
    let d = new Date(`${de}T12:00:00Z`);
    d <= new Date(`${ate}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7)
  ) {
    datas.push(d.toISOString().slice(0, 10));
  }
  return datas;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  // Toninho entra antes das partidas de 2025, para estar ativo em todas.
  await db.query(`UPDATE periodos_ativos SET inicio = '2025-11-01' WHERE jogador_id = $1`, [
    cenario.idsG.jogadorAtivo,
  ]);
  await db.query(`UPDATE jogadores SET inicio_pontuacao = '2025-11-01' WHERE id = $1`, [
    cenario.idsG.jogadorAtivo,
  ]);
  await db.query(
    `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva,
       lesionado_sem_chuva, lesionado_com_chuva, expulso, registrado_por, registrado_em)
     VALUES ($1, '2025-11-01', 3, 4, 1, 2, -1, $2, now())`,
    [cenario.grupoG, cenario.contaC],
  );
  for (const data of [
    ...quintas('2025-11-06', '2025-12-25'),
    ...quintas('2026-01-15', '2026-03-12'),
  ]) {
    const p = await db.query<{ id: string }>(
      `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
       VALUES ($1, $2, false, $3, now(), $3, now()) RETURNING id`,
      [cenario.grupoG, data, cenario.contaC],
    );
    await db.query(
      `INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`,
      [p.rows[0]!.id, cenario.idsG.jogadorAtivo, cenario.grupoG],
    );
  }
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('GET /api/publico/:slug/pdf', () => {
  it('PAR-95: responde 200 com o grupo, o mês, geradoEm do relógio e urlPublica de URL_PUBLICA', async () => {
    const r = await pdf(aberto.cenario.slugG);
    expect(r.status).toBe(200);
    const corpo = pdfPublico.parse(await r.json());
    expect(corpo).toMatchObject({
      grupo: { nome: NOME_G, slug: aberto.cenario.slugG },
      mes: '2026-03',
      geradoEm: AGORA,
      urlPublica: `${URL_PUBLICA}/g/${aberto.cenario.slugG}`,
      semPartidasNoMes: false,
    });
  });

  it('PAR-101: resposta sem campo proibido e com no máximo 12 colunas, as mais recentes até o mês', async () => {
    const json = await (await pdf(aberto.cenario.slugG, '?mes=2026-03')).json();
    expect(camposProibidosEm(json)).toEqual([]);
    expect(JSON.stringify(json)).not.toContain(aberto.cenario.idsG.jogadorAtivo);
    const corpo = pdfPublico.parse(json);
    expect(corpo.colunas).toHaveLength(MAX_COLUNAS_PDF);
    expect(corpo.colunas.at(-1)).toEqual({ data: '2026-03-12', choveu: false, doMesExibido: true });
    expect(corpo.colunas[0]?.doMesExibido).toBe(false);
    for (const l of corpo.linhas) expect(l.rodadas).toHaveLength(corpo.colunas.length);
  });

  it('PAR-95: o ptsFinal de cada linha é o mesmo do ranking do mês', async () => {
    const p = pdfPublico.parse(await (await pdf(aberto.cenario.slugG, '?mes=2026-03')).json());
    const r = (await (await ranking(aberto.cenario.slugG, '?mes=2026-03')).json()) as {
      linhas: Array<{ apelido: string; ptsFinal: number }>;
    };
    expect(p.linhas.map((l) => [l.apelido, l.ptsFinal])).toEqual(
      r.linhas.map((l) => [l.apelido, l.ptsFinal]),
    );
  });
});

describe('PAR-100: recusas iguais às do ranking', () => {
  it.each(['?mes=2026-1', '?mes=2026-13', '?mes=', '?dia=1'])(
    'PAR-100: consulta %j responde como no ranking',
    async (consulta) => {
      const rp = await pdf(aberto.cenario.slugG, consulta);
      const rr = await ranking(aberto.cenario.slugG, consulta);
      expect(rp.status).toBe(422);
      expect({ status: rp.status, corpo: await rp.json() }).toEqual({
        status: rr.status,
        corpo: await rr.json(),
      });
    },
  );

  it('PAR-100: mês inválido traz "Mês inválido."', async () => {
    expect(await (await pdf(aberto.cenario.slugG, '?mes=2026-1')).json()).toMatchObject({
      mensagens: { mes: MENSAGEM_MES_PUBLICO },
    });
  });

  it.each(['?mes=2025-10', '?mes=2026-04'])(
    'PAR-100: %s fora do histórico responde como no ranking',
    async (consulta) => {
      const rp = await pdf(aberto.cenario.slugG, consulta);
      const rr = await ranking(aberto.cenario.slugG, consulta);
      expect(rp.status).toBe(422);
      expect(await rp.clone().json()).toMatchObject({
        mensagens: { mes: MENSAGEM_MES_FORA_DO_HISTORICO },
      });
      expect({ status: rp.status, corpo: await rp.json() }).toEqual({
        status: rr.status,
        corpo: await rr.json(),
      });
    },
  );

  it('PAR-100: slug inexistente e de grupo arquivado respondem como no ranking', async () => {
    const inexistente = await pdf('grupo-que-nao-existe');
    expect({ status: inexistente.status, corpo: await inexistente.json() }).toEqual({
      status: (await ranking('grupo-que-nao-existe')).status,
      corpo: await (await ranking('grupo-que-nao-existe')).json(),
    });
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const arquivado = await pdf(aberto.cenario.slugG);
    expect(arquivado.status).toBe(404);
    expect(await arquivado.json()).toEqual(await (await ranking(aberto.cenario.slugG)).json());
  });

  it('PAR-100: acima do LIMITE_PUBLICO responde 429 como no ranking', async () => {
    const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };
    const rp = await pdf(aberto.cenario.slugG, '', { LIMITE_PUBLICO: nega });
    const rr = await ranking(aberto.cenario.slugG, '', { LIMITE_PUBLICO: nega });
    expect(rp.status).toBe(429);
    expect(await rp.json()).toEqual({ erro: MENSAGEM_LIMITE });
    expect(rr.status).toBe(429);
  });
});
