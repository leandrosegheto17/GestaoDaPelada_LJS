import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  camposProibidosEm,
  CAMPOS_PROIBIDOS_PUBLICO,
  MENSAGEM_MES_FORA_DO_HISTORICO,
  MENSAGEM_MES_PUBLICO,
  rankingPublico,
} from '@pelada/contrato';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, arquivar, NOME_G, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/publico/:slug/ranking?mes=` (partidas-e-ranking T45; PAR-64 a PAR-66, PAR-76, PAR-77, PAR-90, PAR-93), com
 * o app real como `pelada_app` e o relógio fixo em 14/03/2026 15:00Z. O cenário de grupos é o do seed das rotas: G
 * (quinta), Toninho e Bira ativos desde 2026-01-01 e a partida de 2026-01-08 com Bira presente; o `beforeAll` acrescenta
 * a de 2026-03-12 com chuva e Toninho presente. O mês da primeira partida é 2026-01.
 */

let aberto: CenarioGruposAberto;

const AGORA = '2026-03-14T15:00:00.000Z';
const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(AGORA) });

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function ranking(slug: string, consulta = '', conta?: string): Promise<Response> {
  const headers = new Headers();
  if (conta) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${await sessao(conta)}`);
  const ctx = contextoFalso();
  const r = await app.request(`/api/publico/${slug}/ranking${consulta}`, { method: 'GET', headers }, envAcesso(aberto.url), ctx);
  await ctx.esperar();
  return r;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  const p = await db.query<{ id: string }>(
    `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
     VALUES ($1, '2026-03-12', true, $2, now(), $2, now()) RETURNING id`,
    [cenario.grupoG, cenario.contaC],
  );
  await db.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
    p.rows[0]!.id,
    cenario.idsG.jogadorAtivo,
    cenario.grupoG,
  ]);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('GET /api/publico/:slug/ranking', () => {
  it('PAR-64: sem mes, responde 200 com o grupo, o mês de hoje, geradoEm do relógio e uma rodada por partida', async () => {
    const r = await ranking(aberto.cenario.slugG);
    expect(r.status).toBe(200);
    const corpo = rankingPublico.parse(await r.json());
    expect(corpo.grupo).toEqual({
      nome: NOME_G,
      slug: aberto.cenario.slugG,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:00',
    });
    expect(corpo).toMatchObject({
      mes: '2026-03',
      hoje: '2026-03-14',
      geradoEm: AGORA,
      navegacao: { mesAnterior: '2026-02', mesSeguinte: null },
      resumoMes: { partidas: 1, comChuva: 1 },
      partidas: [{ data: '2026-03-12', choveu: true }],
    });
    expect(corpo.linhas.map((l) => l.apelido).sort()).toEqual(['Bira', 'Toninho']);
    for (const l of corpo.linhas) expect(l.rodadas).toHaveLength(1);
  });

  it('PAR-76: a resposta não tem nenhum campo de CAMPOS_PROIBIDOS_PUBLICO, em nenhum nível', async () => {
    const json = await (await ranking(aberto.cenario.slugG, '?mes=2026-01')).json();
    expect(camposProibidosEm(json)).toEqual([]);
    const texto = JSON.stringify(json);
    expect(texto).not.toContain(aberto.cenario.grupoG);
    expect(texto).not.toContain(aberto.cenario.idsG.jogadorAtivo);
    expect(CAMPOS_PROIBIDOS_PUBLICO).toContain('jogadorId');
  });

  it('PAR-64: mes=2026-01 traz a partida de 08/01 e a navegação a partir do primeiro mês', async () => {
    const corpo = rankingPublico.parse(await (await ranking(aberto.cenario.slugG, '?mes=2026-01')).json());
    expect(corpo.partidas).toEqual([{ data: '2026-01-08', choveu: false }]);
    expect(corpo.navegacao).toEqual({ mesAnterior: null, mesSeguinte: '2026-02' });
  });

  it.each(['2026-1', '2026-13', 'marco', ''])('PAR-65: mes=%j responde 422 "Mês inválido."', async (mes) => {
    const r = await ranking(aberto.cenario.slugG, `?mes=${encodeURIComponent(mes)}`);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { mes: MENSAGEM_MES_PUBLICO } });
    expect(MENSAGEM_MES_PUBLICO).toBe('Mês inválido.');
  });

  it.each([
    ['antes da primeira partida', '2025-12'],
    ['depois do mês de hoje', '2026-04'],
  ])('PAR-66: mês %s responde 422 "Mês fora do histórico do grupo."', async (_nome, mes) => {
    const r = await ranking(aberto.cenario.slugG, `?mes=${mes}`);
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ mensagens: { mes: MENSAGEM_MES_FORA_DO_HISTORICO } });
    expect(MENSAGEM_MES_FORA_DO_HISTORICO).toBe('Mês fora do histórico do grupo.');
  });

  it('PAR-90: slug inexistente e slug de grupo arquivado têm o mesmo status e corpo', async () => {
    const inexistente = await ranking('grupo-que-nao-existe');
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const arquivado = await ranking(aberto.cenario.slugG);
    expect(inexistente.status).toBe(404);
    expect({ status: arquivado.status, corpo: await arquivado.json() }).toEqual({
      status: inexistente.status,
      corpo: await inexistente.json(),
    });
  });

  it('PAR-93: reativado, o slug volta a responder 200', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    expect((await ranking(aberto.cenario.slugG)).status).toBe(404);
    await reativar(aberto.db, aberto.cenario.grupoG);
    expect((await ranking(aberto.cenario.slugG)).status).toBe(200);
  });

  it('PAR-77: o admin do outro grupo, logado, vê o ranking de G como visitante', async () => {
    const r = await ranking(aberto.cenario.slugG, '', aberto.cenario.contaB);
    expect(r.status).toBe(200);
    expect(rankingPublico.parse(await r.json()).grupo.slug).toBe(aberto.cenario.slugG);
  });
});
