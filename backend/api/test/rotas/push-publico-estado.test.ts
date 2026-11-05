import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { corpoDoErro } from '@pelada/contrato';
import type { Env } from '../../src/entrada/ambiente.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import {
  chavesVapid,
  clientePush,
  corpoCancelar,
  limparAssinaturas,
  planoDoGrupo,
  SEM_VAPID,
  semearAssinatura,
  type VariaveisVapid,
} from './apoio-push.ts';

/**
 * `GET /api/publico/:slug/push` e `POST /api/publico/:slug/push/estado` (notificacoes T28; NOT-01, NOT-14, NOT-61,
 * NOT-71; AD-103), com o app real como `pelada_app` no contexto do slug.
 */

let aberto: CenarioGruposAberto;
let vapid: Required<VariaveisVapid>;
let pedir: ReturnType<typeof clientePush>;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  vapid = await chavesVapid();
  pedir = clientePush(aberto.url, vapid as Partial<Env>);
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await planoDoGrupo(aberto.db, aberto.cenario.grupoG, 'ativo');
  await limparAssinaturas(aberto.db, aberto.cenario.grupoG);
});

const caminho = (slug: string) => `/publico/${slug}/push`;

describe('GET /api/publico/:slug/push', () => {
  it('NOT-01, NOT-14: grupo Pro com VAPID responde disponível e a chave pública; a privada nunca aparece', async () => {
    const r = await pedir(caminho(aberto.cenario.slugG));
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(JSON.parse(texto)).toEqual({ disponivel: true, chavePublica: vapid.VAPID_PUBLICA });
    expect(texto).not.toContain(vapid.VAPID_PRIVADA);
  });

  it('NOT-61: sem as variáveis VAPID, disponivel false e chavePublica null', async () => {
    const r = await pedir(caminho(aberto.cenario.slugG), { env: SEM_VAPID });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ disponivel: false, chavePublica: null });
  });

  it.each(['VAPID_PUBLICA', 'VAPID_PRIVADA', 'VAPID_ASSUNTO'] as const)(
    'NOT-61: faltando só %s, o push fica desligado',
    async (variavel) => {
      const r = await pedir(caminho(aberto.cenario.slugG), {
        env: { [variavel]: '   ' } as Partial<Env>,
      });
      expect(await r.json()).toEqual({ disponivel: false, chavePublica: null });
    },
  );

  it('NOT-01: grupo Free com VAPID responde disponivel false, sem a chave', async () => {
    await planoDoGrupo(aberto.db, aberto.cenario.grupoG, 'inadimplente');
    const r = await pedir(caminho(aberto.cenario.slugG));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ disponivel: false, chavePublica: null });
  });

  it('NOT-01: slug malformado, inexistente e de grupo arquivado respondem o 404 do PAR-90', async () => {
    const esperado = corpoDoErro('nao_encontrado');
    for (const slug of ['Grupo_Mal', 'grupo-que-nao-existe']) {
      const r = await pedir(caminho(slug));
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual(esperado);
    }
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await pedir(caminho(aberto.cenario.slugG));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(esperado);
  });
});

describe('POST /api/publico/:slug/push/estado', () => {
  const estado = (corpo: unknown, extra: Parameters<typeof pedir>[1] = {}) =>
    pedir(`${caminho(aberto.cenario.slugG)}/estado`, { corpo, ...extra });

  it('NOT-71: com a assinatura no servidor, assinado true; depois de apagada, false', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'estado');
    const antes = await estado(corpoCancelar('estado'));
    expect(antes.status).toBe(200);
    expect(await antes.json()).toEqual({ assinado: true });

    await limparAssinaturas(aberto.db, aberto.cenario.grupoG);
    const depois = await estado(corpoCancelar('estado'));
    expect(depois.status).toBe(200);
    expect(await depois.json()).toEqual({ assinado: false });
  });

  it('NOT-71: auth errado devolve assinado false (não enumera)', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'estado', 1);
    const r = await estado(corpoCancelar('estado', 2));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ assinado: false });
  });

  it('NOT-71: grupo arquivado responde o 404 do PAR-90', async () => {
    await semearAssinatura(aberto.db, aberto.cenario.grupoG, 'estado');
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await estado(corpoCancelar('estado'));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual(corpoDoErro('nao_encontrado'));
  });

  it('NOT-71: sem X-Pelada, 403 antes de consultar', async () => {
    const r = await estado(corpoCancelar('estado'), { semPelada: true });
    expect(r.status).toBe(403);
  });

  it('NOT-67: corpo acima de 4 KB dá 413 e corpo que não é JSON dá 422', async () => {
    const grande = await estado(undefined, {
      cru: JSON.stringify({ ...corpoCancelar('estado'), x: 'a'.repeat(5000) }),
    });
    expect(grande.status).toBe(413);
    const ruim = await estado(undefined, { cru: 'não é json' });
    expect(ruim.status).toBe(422);
  });

  it('NOT-71: corpo fora do contrato (campo a mais, sem auth) dá 422', async () => {
    const extra = await estado({ ...corpoCancelar('estado'), p256dh: 'x' });
    expect(extra.status).toBe(422);
    const semAuth = await estado({ endpoint: corpoCancelar('estado').endpoint, chaves: {} });
    expect(semAuth.status).toBe(422);
  });
});
