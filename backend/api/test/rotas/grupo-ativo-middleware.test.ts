import type { Context, Hono } from 'hono';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../src/entrada/app.ts';
import { exigirGrupoAtivo } from '../../src/entrada/middlewares/grupo-ativo.ts';
import { chamar, ehErroPadrao } from '../apoio/cliente.ts';
import { criarSessao, noBanco, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// exigirGrupoAtivo (T25; GEL-26): no grupo arquivado, toda escrita sob /api/grupos/:grupoId/* recebe 409
// grupo_arquivado, também para a criadora; a única exceção é POST /api/grupos/:grupoId/reativar. GET e HEAD passam.

let executadas: string[] = [];
const ESCRITAS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

/** Rotas de prova sob o prefixo de grupo (já com sessão e vínculo do app) e o middleware, como o app o monta. */
function rotasDeProva(app: Hono<AppEnv>): void {
  app.use('/api/grupos/:grupoId/*', exigirGrupoAtivo);
  const registrar = (nome: string) => (c: Context<AppEnv>) => {
    executadas.push(`${c.req.method} ${nome}`);
    return c.json({ ok: true });
  };
  app.on(['GET', 'HEAD', ...ESCRITAS], '/api/grupos/:grupoId/prova', registrar('prova'));
  app.post('/api/grupos/:grupoId/reativar', registrar('reativar'));
  app.post('/api/grupos/:grupoId/prova/reativar', registrar('prova/reativar'));
}

const opcoes = { preparar: rotasDeProva };
const pedido = (method: string, cookie: string) => ({ method, headers: { Cookie: cookie, 'X-Pelada': '1' } });

/** Grupo criado pela função do banco, com a conta da sessão como criadora; arquivado se pedido. */
async function grupoDe(s: SessaoDeTeste, arquivado: boolean): Promise<string> {
  const id = await noBanco(s.contaId, async (db) => {
    const { rows } = await sql<{ id: string }>`
      SELECT id FROM grupo_criar('Grupo Ativo Teste', 'quarta', 'semanal', '20:00', ${`ativo-${crypto.randomUUID()}`},
                                 ARRAY['Passe']::text[])
    `.execute(db);
    return rows[0]?.id as string;
  });
  if (arquivado) {
    await noBanco(s.contaId, (db) =>
      db
        .updateTable('grupos')
        .set({ arquivado_em: sql<Date>`now()` })
        .where('id', '=', id)
        .execute(),
    );
  }
  return id;
}

describe('exigirGrupoAtivo no grupo arquivado (GEL-26)', () => {
  it.each(ESCRITAS)(
    '%s → 409 grupo_arquivado, no formato padrão, e a rota não roda (também para a criadora)',
    async (metodo) => {
      executadas = [];
      const s = await criarSessao();
      const grupo = await grupoDe(s, true);
      const r = await chamar(`/api/grupos/${grupo}/prova`, pedido(metodo, s.cookie), opcoes);
      expect(r.status).toBe(409);
      expect(ehErroPadrao(r.corpo)).toBe(true);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
      expect(executadas).toEqual([]);
    },
  );

  it('GET e HEAD passam', async () => {
    executadas = [];
    const s = await criarSessao();
    const grupo = await grupoDe(s, true);
    const get = await chamar(`/api/grupos/${grupo}/prova`, { headers: { Cookie: s.cookie } }, opcoes);
    const head = await chamar(`/api/grupos/${grupo}/prova`, { method: 'HEAD', headers: { Cookie: s.cookie } }, opcoes);
    expect([get.status, head.status]).toEqual([200, 200]);
    expect(executadas).toEqual(['GET prova', 'HEAD prova']);
  });

  it('POST /api/grupos/:grupoId/reativar passa mesmo arquivado', async () => {
    executadas = [];
    const s = await criarSessao();
    const grupo = await grupoDe(s, true);
    const r = await chamar(`/api/grupos/${grupo}/reativar`, pedido('POST', s.cookie), opcoes);
    expect(r.status).toBe(200);
    expect(executadas).toEqual(['POST reativar']);
  });

  it('outro caminho que termina em /reativar (ex.: de jogador) continua barrado', async () => {
    executadas = [];
    const s = await criarSessao();
    const grupo = await grupoDe(s, true);
    const r = await chamar(`/api/grupos/${grupo}/prova/reativar`, pedido('POST', s.cookie), opcoes);
    expect(r.status).toBe(409);
    expect(executadas).toEqual([]);
  });
});

describe('exigirGrupoAtivo no grupo ativo', () => {
  it.each([...ESCRITAS, 'GET'])('%s passa', async (metodo) => {
    executadas = [];
    const s = await criarSessao();
    const grupo = await grupoDe(s, false);
    const r = await chamar(`/api/grupos/${grupo}/prova`, pedido(metodo, s.cookie), opcoes);
    expect(r.status).toBe(200);
    expect(executadas).toEqual([`${metodo} prova`]);
  });
});
