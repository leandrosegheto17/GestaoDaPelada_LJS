import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CODIGO_LIMITE_ASSINATURAS, CODIGO_PUSH_INDISPONIVEL } from '@pelada/contrato/push';
import type { Env, LimiteDeTaxa } from '../../src/entrada/ambiente.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { sessaoDe } from './apoio-financeiro.ts';
import {
  chavesAssinante,
  chavesVapid,
  clientePush,
  corpoAssinatura,
  corpoCancelar,
  endpointDe,
  SEM_VAPID,
  type PedidoPush,
  type VariaveisVapid,
} from './apoio-push.ts';

/**
 * Rotas `/api/conta/push*` (notificacoes T31; NOT-44, NOT-45, NOT-53, NOT-61), com o app real como `pelada_app` e
 * sessões gravadas direto no banco. A criadora de G é a conta C (= A); a O é admin de G só por vínculo; a B criou H.
 * As linhas de `push_conta` são conferidas como superusuário (a `pelada_app` não lê a tabela, AD-101).
 */

let aberto: CenarioGruposAberto;
let vapid: Required<VariaveisVapid>;
let pedir: ReturnType<typeof clientePush>;
let sessaoC: string;
let sessaoO: string;
let sessaoB: string;
let sessaoSemGrupo: string;
let contaSemGrupo: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  vapid = await chavesVapid();
  pedir = clientePush(aberto.url, vapid as Partial<Env>);
  const r = await aberto.db.query<{ id: string }>(
    `INSERT INTO contas (email, nome, senha_hash, criada_em)
     VALUES ('sem-grupo-push@exemplo.test', 'Sem Grupo', 'x', now()) RETURNING id`,
  );
  contaSemGrupo = r.rows[0]!.id;
  sessaoC = await sessaoDe(aberto, aberto.cenario.contaC);
  sessaoO = await sessaoDe(aberto, aberto.cenario.contaO);
  sessaoB = await sessaoDe(aberto, aberto.cenario.contaB);
  sessaoSemGrupo = await sessaoDe(aberto, contaSemGrupo);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await reativar(aberto.db, aberto.cenario.grupoH);
  await aberto.db.query('DELETE FROM push_conta');
});

/** Pedido com a sessão no cookie; `null` = sem sessão. */
function comSessao(caminho: string, sessao: string | null, p: PedidoPush = {}) {
  return pedir(caminho, { ...p, sessao });
}

const linhasDa = async (conta: string) =>
  (
    await aberto.db.query<{ endpoint: string; auth: string }>(
      'SELECT endpoint, auth FROM push_conta WHERE conta_id = $1 ORDER BY id',
      [conta],
    )
  ).rows;

describe('NOT-44: GET /api/conta/push', () => {
  it('NOT-44: a criadora de um grupo ativo recebe oferecer true e a chave pública', async () => {
    const r = await comSessao('/conta/push', sessaoC);
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ oferecer: true, chavePublica: vapid.VAPID_PUBLICA });
    expect(texto).not.toContain(vapid.VAPID_PRIVADA);
  });

  it('NOT-44: admin convidada e conta sem grupo recebem oferecer false', async () => {
    for (const sessao of [sessaoO, sessaoSemGrupo]) {
      const r = await comSessao('/conta/push', sessao);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ oferecer: false, chavePublica: null });
    }
  });

  it('NOT-44: a criadora com o único grupo arquivado recebe oferecer false', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoH);
    const r = await comSessao('/conta/push', sessaoB);
    expect(await r.json()).toEqual({ oferecer: false, chavePublica: null });
  });

  it('NOT-61: sem VAPID, oferecer false mesmo para a criadora', async () => {
    const r = await comSessao('/conta/push', sessaoC, { env: SEM_VAPID });
    expect(await r.json()).toEqual({ oferecer: false, chavePublica: null });
  });

  it('NOT-45: sem sessão, 401', async () => {
    expect((await comSessao('/conta/push', null)).status).toBe(401);
  });
});

describe('NOT-45: POST, DELETE e estado', () => {
  it('NOT-45: POST 201, de novo 200, e uma linha só da conta', async () => {
    const corpo = corpoAssinatura('conta', 1);
    expect((await comSessao('/conta/push', sessaoC, { corpo })).status).toBe(201);
    const r = await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura('conta', 2) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ assinado: true });
    const l = await linhasDa(aberto.cenario.contaC);
    expect(l).toHaveLength(1);
    expect(l[0]!.auth).toBe(chavesAssinante(2).auth);
  });

  it('NOT-45: estado true com a linha e false depois do DELETE; o DELETE repetido é 204', async () => {
    await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura('conta') });
    const antes = await comSessao('/conta/push/estado', sessaoC, { corpo: corpoCancelar('conta') });
    expect(antes.status).toBe(200);
    expect(await antes.json()).toEqual({ assinado: true });

    const apaga = { metodo: 'DELETE', corpo: corpoCancelar('conta') };
    expect((await comSessao('/conta/push', sessaoC, apaga)).status).toBe(204);
    expect((await comSessao('/conta/push', sessaoC, apaga)).status).toBe(204);
    expect(await linhasDa(aberto.cenario.contaC)).toEqual([]);

    const depois = await comSessao('/conta/push/estado', sessaoC, {
      corpo: corpoCancelar('conta'),
    });
    expect(await depois.json()).toEqual({ assinado: false });
  });

  it('NOT-45: sem sessão, 401 em POST, DELETE e estado, sem gravar', async () => {
    expect((await comSessao('/conta/push', null, { corpo: corpoAssinatura('x') })).status).toBe(
      401,
    );
    expect(
      (await comSessao('/conta/push', null, { metodo: 'DELETE', corpo: corpoCancelar('x') }))
        .status,
    ).toBe(401);
    expect(
      (await comSessao('/conta/push/estado', null, { corpo: corpoCancelar('x') })).status,
    ).toBe(401);
    expect((await aberto.db.query('SELECT 1 FROM push_conta')).rows).toEqual([]);
  });

  it.each(['POST', 'DELETE'] as const)(
    'NOT-45: %s sem X-Pelada, 403 sem gravar nem apagar',
    async (metodo) => {
      if (metodo === 'DELETE')
        await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura('pelada') });
      const corpo = metodo === 'POST' ? corpoAssinatura('outra') : corpoCancelar('pelada');
      const r = await comSessao('/conta/push', sessaoC, { metodo, corpo, semPelada: true });
      expect(r.status).toBe(403);
      expect((await linhasDa(aberto.cenario.contaC)).map((l) => l.endpoint)).toEqual(
        metodo === 'POST' ? [] : [endpointDe('pelada')],
      );
    },
  );

  it('NOT-45: acima do LIMITE_ESCRITA, 429 sem gravar; a chave é a da conta', async () => {
    const chaves: string[] = [];
    const nega: LimiteDeTaxa = {
      limit: async ({ key }) => {
        chaves.push(key);
        return { success: false };
      },
    };
    const r = await comSessao('/conta/push', sessaoC, {
      corpo: corpoAssinatura('limite'),
      env: { LIMITE_ESCRITA: nega },
    });
    expect(r.status).toBe(429);
    expect(chaves).toEqual([`conta:${aberto.cenario.contaC}`]);
    expect(await linhasDa(aberto.cenario.contaC)).toEqual([]);
  });

  it('NOT-45: corpo fora do contrato dá 422, acima de 4 KB dá 413', async () => {
    const ruim = await comSessao('/conta/push', sessaoC, {
      corpo: { ...corpoAssinatura('x'), extra: 1 },
    });
    expect(ruim.status).toBe(422);
    const host = await comSessao('/conta/push', sessaoC, {
      corpo: { ...corpoAssinatura('x'), endpoint: 'https://push.mal.example/x' },
    });
    expect(host.status).toBe(422);
    const grande = await comSessao('/conta/push', sessaoC, {
      cru: JSON.stringify({ ...corpoAssinatura('x'), x: 'a'.repeat(5000) }),
    });
    expect(grande.status).toBe(413);
    expect(await linhasDa(aberto.cenario.contaC)).toEqual([]);
  });

  it('NOT-45: com 10 assinaturas, a 11.ª dá 409 limite_assinaturas (AD-107)', async () => {
    for (let i = 0; i < 10; i += 1)
      expect(
        (await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura(`teto-${i}`, i) }))
          .status,
      ).toBe(201);
    const r = await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura('teto-10') });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: CODIGO_LIMITE_ASSINATURAS });
    expect(await linhasDa(aberto.cenario.contaC)).toHaveLength(10);
  });

  it('NOT-61: sem VAPID, POST 503 push_indisponivel sem gravar; DELETE segue 204', async () => {
    const r = await comSessao('/conta/push', sessaoC, {
      corpo: corpoAssinatura('sem'),
      env: SEM_VAPID,
    });
    expect(r.status).toBe(503);
    expect(await r.json()).toMatchObject({ codigo: CODIGO_PUSH_INDISPONIVEL });
    expect(await linhasDa(aberto.cenario.contaC)).toEqual([]);
    const apaga = await comSessao('/conta/push', sessaoC, {
      metodo: 'DELETE',
      corpo: corpoCancelar('sem'),
      env: SEM_VAPID,
    });
    expect(apaga.status).toBe(204);
  });
});

describe('NOT-53: isolamento entre contas', () => {
  it('NOT-53: a conta B, com o mesmo endpoint e auth, não consulta nem apaga a assinatura de A', async () => {
    await comSessao('/conta/push', sessaoC, { corpo: corpoAssinatura('compartilhado') });
    const estadoB = await comSessao('/conta/push/estado', sessaoB, {
      corpo: corpoCancelar('compartilhado'),
    });
    expect(await estadoB.json()).toEqual({ assinado: false });
    const apagaB = await comSessao('/conta/push', sessaoB, {
      metodo: 'DELETE',
      corpo: corpoCancelar('compartilhado'),
    });
    expect(apagaB.status).toBe(204);
    expect(await linhasDa(aberto.cenario.contaC)).toHaveLength(1);
  });

  it('NOT-53: o mesmo endpoint assinado por A e B vira duas linhas, uma por conta', async () => {
    const corpo = corpoAssinatura('dois');
    expect((await comSessao('/conta/push', sessaoC, { corpo })).status).toBe(201);
    expect((await comSessao('/conta/push', sessaoB, { corpo })).status).toBe(201);
    expect(await linhasDa(aberto.cenario.contaC)).toHaveLength(1);
    expect(await linhasDa(aberto.cenario.contaB)).toHaveLength(1);
  });
});
