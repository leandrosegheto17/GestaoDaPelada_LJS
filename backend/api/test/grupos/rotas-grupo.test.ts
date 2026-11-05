import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MENSAGEM_DIA_SEMANA,
  MENSAGEM_FREQUENCIA,
  MENSAGEM_HORARIO_AUSENTE,
  MENSAGEM_HORARIO_INVALIDO,
  MENSAGEM_NOME_GRUPO,
} from '@pelada/contrato';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente, URL_PUBLICA_TESTE } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, NOME_G, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET` e `PATCH /api/grupos/:grupoId` (T29; GEL-16 a GEL-21), com o app real como `pelada_app` contra o cenário de
 * grupos (C criadora de G, O outra admin, B só de H). G tem 2 jogadores com período aberto, 6 habilidades e 2 admins.
 */

let aberto: CenarioGruposAberto;

const DADOS_G = { nome: NOME_G, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' } as const;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function nomeDeG(): Promise<string | undefined> {
  const r = await aberto.db.query<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [aberto.cenario.grupoG]);
  return r.rows[0]?.nome;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await aberto.db.query(
    `UPDATE grupos SET nome = $2, dia_semana = 'quinta', frequencia = 'semanal', horario = '20:00' WHERE id = $1`,
    [aberto.cenario.grupoG, NOME_G],
  );
});

describe('GET /api/grupos/:grupoId', () => {
  it('GEL-20: traz as contagens e souCriador verdadeiro para a criadora', async () => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, { sessao: await sessao(cenario.contaC) });
    expect(r.status).toBe(200);
    const g = (await r.json()) as Record<string, unknown>;
    // A criadora tem acesso ao financeiro: o detalhe traz também o saldo (financeiro T30, FIN-34; autorização de
    // 2026-11-04 em `## Autorizações` do STATE.md). A lista continua exata.
    // E os 6 campos do início do grupo (partidas-e-ranking T43, PAR-132; autorização de 2026-11-04 do STATE.md).
    expect(Object.keys(g).sort()).toEqual(
      [
        'admins',
        'aparelhosNaSemana',
        'dataSugeridaPartida',
        'partidaNaDataSugerida',
        'partidasNoMes',
        'pesosPadrao',
        'pesosVigentesDesde',
        'diaSemana',
        'frequencia',
        'habilidades',
        'horario',
        'id',
        'jogadoresAtivos',
        'linkPublico',
        'nome',
        'saldoFinanceiroCentavos',
        'slug',
        'souCriador',
      ].sort(),
    );
    expect(g).toMatchObject({
      id: cenario.grupoG,
      nome: NOME_G,
      slug: cenario.slugG,
      jogadoresAtivos: 2,
      habilidades: 6,
      admins: 2,
      souCriador: true,
    });
  });

  it('GEL-20: souCriador é falso para a outra admin', async () => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, { sessao: await sessao(cenario.contaO) });
    expect(((await r.json()) as { souCriador: boolean }).souCriador).toBe(false);
  });

  it('GEL-17: o link público vem de URL_PUBLICA', async () => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url, { URL_PUBLICA: 'https://outro.exemplo.test' })(`/grupos/${cenario.grupoG}`, {
      sessao: await sessao(cenario.contaC),
    });
    expect(((await r.json()) as { linkPublico: string }).linkPublico).toBe(`https://outro.exemplo.test/g/${cenario.slugG}`);
  });

  it('GEL-21: B, sem vínculo, recebe 404', async () => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, { sessao: await sessao(cenario.contaB) });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
  });

  it('GEL-21: id que não existe, ou que não é uuid, dá 404', async () => {
    const { cenario } = aberto;
    const token = await sessao(cenario.contaC);
    expect((await cliente(aberto.url)('/grupos/00000000-0000-4000-8000-000000000000', { sessao: token })).status).toBe(404);
    expect((await cliente(aberto.url)('/grupos/nao-e-uuid', { sessao: token })).status).toBe(404);
  });

  it('GEL-08: sem sessão, 401', async () => {
    const { cenario } = aberto;
    expect((await cliente(aberto.url)(`/grupos/${cenario.grupoG}`)).status).toBe(401);
  });
});

describe('PATCH /api/grupos/:grupoId', () => {
  it('GEL-18, GEL-16: renomear devolve 200 com o nome novo, o mesmo slug e o mesmo link', async () => {
    const { cenario } = aberto;
    const token = await sessao(cenario.contaO);
    const antes = (await (await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, { sessao: token })).json()) as {
      slug: string;
      linkPublico: string;
    };
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, {
      metodo: 'PATCH',
      sessao: token,
      corpo: { nome: 'Pelada Renomeada', diaSemana: 'sexta', frequencia: 'mensal', horario: '07:30' },
    });
    expect(r.status).toBe(200);
    const depois = (await r.json()) as Record<string, unknown>;
    expect(depois).toMatchObject({
      nome: 'Pelada Renomeada',
      diaSemana: 'sexta',
      frequencia: 'mensal',
      horario: '07:30',
      slug: antes.slug,
      linkPublico: antes.linkPublico,
    });
    expect(depois.slug).toBe(cenario.slugG);
    expect(depois.linkPublico).toBe(`${URL_PUBLICA_TESTE}/g/${cenario.slugG}`);
    expect(await nomeDeG()).toBe('Pelada Renomeada');
  });

  it.each([
    ['nome curto', { nome: 'ab' }, 'nome', MENSAGEM_NOME_GRUPO],
    ['nome longo', { nome: 'y'.repeat(61) }, 'nome', MENSAGEM_NOME_GRUPO],
    ['dia fora da lista', { diaSemana: 'feriado' }, 'diaSemana', MENSAGEM_DIA_SEMANA],
    ['frequência fora da lista', { frequencia: 'anual' }, 'frequencia', MENSAGEM_FREQUENCIA],
    ['horário vazio', { horario: '' }, 'horario', MENSAGEM_HORARIO_AUSENTE],
    ['horário fora de HH:MM', { horario: '25:00' }, 'horario', MENSAGEM_HORARIO_INVALIDO],
  ] as const)('GEL-19: %s no PATCH dá 422 com a mesma mensagem da criação, e nada muda', async (_caso, mudanca, campo, mensagem) => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, {
      metodo: 'PATCH',
      sessao: await sessao(cenario.contaC),
      corpo: { ...DADOS_G, ...mudanca },
    });
    expect(r.status).toBe(422);
    const erro = (await r.json()) as { codigo: string; mensagens: Record<string, string> };
    expect(erro.codigo).toBe('dados_invalidos');
    expect(erro.mensagens[campo]).toBe(mensagem);
    expect(await nomeDeG()).toBe(NOME_G);
  });

  it.each([
    ['slug', { slug: 'outro-slug' }],
    ['urlPublica', { urlPublica: 'https://x.test' }],
  ] as const)('GEL-16, GEL-19: corpo com %s dá 422 e o slug não muda', async (_campo, extra) => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, {
      metodo: 'PATCH',
      sessao: await sessao(cenario.contaC),
      corpo: { ...DADOS_G, nome: 'Nome Com Extra', ...extra },
    });
    expect(r.status).toBe(422);
    const g = await aberto.db.query<{ slug: string; nome: string }>('SELECT slug, nome FROM grupos WHERE id = $1', [cenario.grupoG]);
    expect(g.rows[0]).toEqual({ slug: cenario.slugG, nome: NOME_G });
  });

  it('GEL-21: B, sem vínculo, recebe 404 e G não muda', async () => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}`, {
      metodo: 'PATCH',
      sessao: await sessao(cenario.contaB),
      corpo: { ...DADOS_G, nome: 'Invasão de B' },
    });
    expect(r.status).toBe(404);
    expect(await nomeDeG()).toBe(NOME_G);
  });
});
