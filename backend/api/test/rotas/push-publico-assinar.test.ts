import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { corpoDoErro } from '@pelada/contrato';
import {
  CODIGO_LIMITE_ASSINATURAS,
  CODIGO_PUSH_INDISPONIVEL,
  paraBase64url,
} from '@pelada/contrato/push';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import { MENSAGEM_LIMITE } from '../../src/entrada/middlewares/limite-taxa.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import {
  assinaturasDoGrupo,
  chavesVapid,
  clientePush,
  corpoAssinatura,
  endpointDe,
  limparAssinaturas,
  planoDoGrupo,
  SEM_VAPID,
  semearAssinatura,
  type PedidoPush,
} from './apoio-push.ts';

/**
 * `POST /api/publico/:slug/push` (notificacoes T29; NOT-05 a NOT-11, NOT-61, NOT-65, NOT-67), com o app real como
 * `pelada_app` no contexto do slug. As linhas são conferidas como superusuário (a `pelada_app` não lê `push_ranking`).
 */

let aberto: CenarioGruposAberto;
let pedir: ReturnType<typeof clientePush>;

const IP = '203.0.113.77';

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  pedir = clientePush(aberto.url, (await chavesVapid()) as Partial<Env>);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await planoDoGrupo(aberto.db, aberto.cenario.grupoG, 'ativo');
  await limparAssinaturas(aberto.db, aberto.cenario.grupoG);
});

const assinar = (corpo: unknown, extra: PedidoPush = {}, slug = aberto.cenario.slugG) =>
  pedir(`/publico/${slug}/push`, { corpo, ip: IP, ...extra });

const linhas = () => assinaturasDoGrupo(aberto.db, aberto.cenario.grupoG);

describe('NOT-05, NOT-07: grava e atualiza', () => {
  it('NOT-05: assinatura válida responde 201 e grava a linha com as chaves', async () => {
    const corpo = corpoAssinatura('a');
    const r = await assinar(corpo);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ assinado: true });
    expect(await linhas()).toEqual([
      { endpoint: corpo.endpoint, p256dh: corpo.chaves.p256dh, auth: corpo.chaves.auth },
    ]);
  });

  it('NOT-07: o mesmo endpoint de novo responde 200 e troca as chaves, com uma linha só', async () => {
    expect((await assinar(corpoAssinatura('a', 1))).status).toBe(201);
    const nova = corpoAssinatura('a', 2);
    const r = await assinar(nova);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ assinado: true });
    const l = await linhas();
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ p256dh: nova.chaves.p256dh, auth: nova.chaves.auth });
  });

  it('NOT-05: a resposta não ecoa o endpoint nem as chaves', async () => {
    const corpo = corpoAssinatura('eco');
    const texto = await (await assinar(corpo)).text();
    expect(texto).not.toContain(corpo.endpoint);
    expect(texto).not.toContain(corpo.chaves.p256dh);
    expect(texto).not.toContain(corpo.chaves.auth);
  });
});

describe('NOT-06: recusas do contrato', () => {
  const valido = () => corpoAssinatura('contrato');
  const comprimida = new Uint8Array(33).fill(2);
  const sem04 = new Uint8Array(65).fill(5);
  const casos: Array<[string, () => unknown]> = [
    ['campo a mais no topo', () => ({ ...valido(), extra: 1 })],
    ['campo a mais em chaves', () => ({ ...valido(), chaves: { ...valido().chaves, x: 'y' } })],
    ['endpoint http', () => ({ ...valido(), endpoint: 'http://fcm.googleapis.com/fcm/send/x' })],
    ['host fora da lista', () => ({ ...valido(), endpoint: 'https://push.mal.example/x' })],
    [
      'host parecido',
      () => ({ ...valido(), endpoint: 'https://fcm.googleapis.com.mal.example/x' }),
    ],
    ['IP literal', () => ({ ...valido(), endpoint: 'https://10.0.0.1/x' })],
    ['porta explícita', () => ({ ...valido(), endpoint: 'https://fcm.googleapis.com:443/x' })],
    [
      'endpoint acima de 1024',
      () => ({ ...valido(), endpoint: `${endpointDe('x')}${'a'.repeat(1024)}` }),
    ],
    [
      'p256dh comprimido',
      () => ({ ...valido(), chaves: { ...valido().chaves, p256dh: paraBase64url(comprimida) } }),
    ],
    [
      'p256dh sem 0x04',
      () => ({ ...valido(), chaves: { ...valido().chaves, p256dh: paraBase64url(sem04) } }),
    ],
    [
      'auth de 15 bytes',
      () => ({
        ...valido(),
        chaves: { ...valido().chaves, auth: paraBase64url(new Uint8Array(15)) },
      }),
    ],
    ['sem chaves', () => ({ endpoint: valido().endpoint })],
    ['corpo que não é objeto', () => [valido()]],
  ];

  it.each(casos)('NOT-06: %s dá 422 sem gravar', async (_nome, corpo) => {
    const r = await assinar(corpo());
    expect(r.status).toBe(422);
    expect(await r.json()).toMatchObject({ codigo: 'dados_invalidos' });
    expect(await linhas()).toEqual([]);
  });
});

describe('NOT-08: slug indisponível', () => {
  it('NOT-08: slug malformado, inexistente e de grupo arquivado dão o mesmo corpo do PAR-90, sem gravar', async () => {
    const esperado = corpoDoErro('nao_encontrado');
    for (const slug of ['Grupo_Mal', 'grupo-que-nao-existe']) {
      const r = await assinar(corpoAssinatura('slug'), {}, slug);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual(esperado);
    }
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await assinar(corpoAssinatura('slug'));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(esperado);
    expect(await linhas()).toEqual([]);
  });
});

describe('NOT-09, NOT-10, NOT-61: plano, teto e VAPID', () => {
  it('NOT-09: grupo Free responde 403 push_indisponivel, nada gravado', async () => {
    await planoDoGrupo(aberto.db, aberto.cenario.grupoG, 'inadimplente');
    const r = await assinar(corpoAssinatura('free'));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: CODIGO_PUSH_INDISPONIVEL });
    expect(await linhas()).toEqual([]);
  });

  it('NOT-10: com 200 assinaturas de outros endpoints, 409 limite_assinaturas, nada gravado', async () => {
    for (let i = 0; i < 200; i += 1)
      await semearAssinatura(aberto.db, aberto.cenario.grupoG, `teto-${i}`, i);
    const r = await assinar(corpoAssinatura('novo'));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: CODIGO_LIMITE_ASSINATURAS });
    const l = await linhas();
    expect(l).toHaveLength(200);
    expect(l.some((x) => x.endpoint === endpointDe('novo'))).toBe(false);
  });

  it('NOT-10: com 200, reassinar um endpoint que já existe continua valendo (200)', async () => {
    for (let i = 0; i < 200; i += 1)
      await semearAssinatura(aberto.db, aberto.cenario.grupoG, `teto-${i}`, i);
    const r = await assinar(corpoAssinatura('teto-0', 99));
    expect(r.status).toBe(200);
  });

  it('NOT-61: sem VAPID, 503 push_indisponivel, nada gravado', async () => {
    const r = await assinar(corpoAssinatura('sem-vapid'), { env: SEM_VAPID });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: CODIGO_PUSH_INDISPONIVEL });
    expect(await linhas()).toEqual([]);
  });
});

describe('NOT-11: cabeçalho, limite e IP', () => {
  it('NOT-11: sem X-Pelada, 403 e nada gravado', async () => {
    const r = await assinar(corpoAssinatura('pelada'), { semPelada: true });
    expect(r.status).toBe(403);
    expect(await linhas()).toEqual([]);
  });

  it('NOT-11: acima do LIMITE_PUBLICO, 429 e nada gravado', async () => {
    const nega: LimiteDeTaxa = { limit: async () => ({ success: false }) };
    const r = await assinar(corpoAssinatura('limite'), { env: { LIMITE_PUBLICO: nega } });
    expect(r.status).toBe(429);
    expect(await r.json()).toEqual({ erro: MENSAGEM_LIMITE });
    expect(await linhas()).toEqual([]);
  });

  it('NOT-11: o IP é só a chave do limitador: não está na linha nem no log', async () => {
    const chaves: string[] = [];
    const conta: LimiteDeTaxa = {
      limit: async ({ key }) => {
        chaves.push(key);
        return { success: true };
      },
    };
    const saidas: unknown[][] = [];
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation((...a: unknown[]) => {
        saidas.push(a);
      }),
    );
    try {
      const r = await assinar(corpoAssinatura('ip'), { env: { LIMITE_PUBLICO: conta } });
      expect(r.status).toBe(201);
    } finally {
      for (const e of espioes) e.mockRestore();
    }
    expect(chaves.length).toBeGreaterThan(0);
    const linha = await aberto.db.query<{ t: string }>(
      'SELECT row_to_json(p)::text AS t FROM push_ranking p WHERE grupo_id = $1',
      [aberto.cenario.grupoG],
    );
    expect(linha.rows).toHaveLength(1);
    expect(linha.rows[0]!.t).not.toContain(IP);
    expect(JSON.stringify(saidas)).not.toContain(IP);
  });
});

describe('NOT-65: assinaturas simultâneas', () => {
  it('NOT-65: dois POST simultâneos do mesmo endpoint respondem 201 e 200, com uma linha', async () => {
    const corpo = corpoAssinatura('paralelo');
    const [a, b] = await Promise.all([assinar(corpo), assinar(corpo)]);
    expect([a!.status, b!.status].sort()).toEqual([200, 201]);
    expect(await linhas()).toHaveLength(1);
  });
});

describe('NOT-67: corpo grande ou não JSON', () => {
  it('NOT-67: corpo de 5 KB dá 413, sem gravar', async () => {
    const r = await assinar(undefined, {
      cru: JSON.stringify({ ...corpoAssinatura('grande'), x: 'a'.repeat(5 * 1024) }),
    });
    expect(r.status).toBe(413);
    expect(await linhas()).toEqual([]);
  });

  it('NOT-67: corpo que não é JSON dá 422', async () => {
    const r = await assinar(undefined, { cru: '{endpoint:' });
    expect(r.status).toBe(422);
    expect(await linhas()).toEqual([]);
  });
});
