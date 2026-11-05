import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../../src/entrada/ambiente.ts';
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
  corpoCancelar,
  endpointDe,
  limparAssinaturas,
  planoDoGrupo,
  SEM_VAPID,
  semearAssinatura,
  type PedidoPush,
} from './apoio-push.ts';

/**
 * `DELETE /api/publico/:slug/push` (notificacoes T30; NOT-16, NOT-17, NOT-18, NOT-67), com o app real como
 * `pelada_app` no contexto do slug.
 */

let aberto: CenarioGruposAberto;
let pedir: ReturnType<typeof clientePush>;

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

const caminho = () => `/publico/${aberto.cenario.slugG}/push`;
const cancelar = (corpo: unknown, extra: PedidoPush = {}) =>
  pedir(caminho(), { metodo: 'DELETE', corpo, ...extra });
const linhas = () => assinaturasDoGrupo(aberto.db, aberto.cenario.grupoG);

describe('NOT-16, NOT-17: cancelar', () => {
  it('NOT-16: assinar e cancelar: a linha some e a resposta é 204 sem corpo', async () => {
    expect((await pedir(caminho(), { corpo: corpoAssinatura('c') })).status).toBe(201);
    const r = await cancelar(corpoCancelar('c'));
    expect(r.status).toBe(204);
    expect(await r.text()).toBe('');
    expect(await linhas()).toEqual([]);
  });

  it('NOT-17: o DELETE repetido, sem linha que coincida, também responde 204', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    expect((await cancelar(corpoCancelar('c'))).status).toBe(204);
    expect((await cancelar(corpoCancelar('c'))).status).toBe(204);
    expect(await linhas()).toEqual([]);
  });

  it('NOT-17: auth errado responde 204 e não apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c', 1);
    expect((await cancelar(corpoCancelar('c', 2))).status).toBe(204);
    expect(await linhas()).toHaveLength(1);
  });

  it('NOT-17: apaga só o endpoint do corpo', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c', 1);
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'outro', 1);
    expect((await cancelar(corpoCancelar('c'))).status).toBe(204);
    expect((await linhas()).map((l) => l.endpoint)).toEqual([endpointDe('outro')]);
  });

  it('NOT-16: sem X-Pelada, 403 e não apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    expect((await cancelar(corpoCancelar('c'), { semPelada: true })).status).toBe(403);
    expect(await linhas()).toHaveLength(1);
  });
});

describe('NOT-18: cancelar em qualquer situação do grupo', () => {
  it('NOT-18: grupo arquivado responde 204 e apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    await arquivar(aberto.db, aberto.cenario.grupoG);
    expect((await cancelar(corpoCancelar('c'))).status).toBe(204);
    expect(await linhas()).toEqual([]);
  });

  it('NOT-18: grupo Free responde 204 e apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    await planoDoGrupo(aberto.db, aberto.cenario.grupoG, 'inadimplente');
    expect((await cancelar(corpoCancelar('c'))).status).toBe(204);
    expect(await linhas()).toEqual([]);
  });

  it('NOT-18: sem VAPID, cancelar continua valendo', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    expect((await cancelar(corpoCancelar('c'), { env: SEM_VAPID })).status).toBe(204);
    expect(await linhas()).toEqual([]);
  });
});

describe('NOT-67: corpo grande ou não JSON', () => {
  it('NOT-67: corpo acima de 4 KB dá 413 e não apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    const r = await cancelar(undefined, {
      cru: JSON.stringify({ ...corpoCancelar('c'), x: 'a'.repeat(5 * 1024) }),
    });
    expect(r.status).toBe(413);
    expect(await linhas()).toHaveLength(1);
  });

  it('NOT-67: corpo que não é JSON dá 422 e não apaga', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'c');
    expect((await cancelar(undefined, { cru: 'apagar' })).status).toBe(422);
    expect(await linhas()).toHaveLength(1);
  });

  it('NOT-67: corpo fora do contrato (com p256dh) dá 422', async () => {
    expect((await cancelar(corpoAssinatura('c'))).status).toBe(422);
  });
});
