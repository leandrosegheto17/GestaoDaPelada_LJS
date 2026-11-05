import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { corpoDoErro } from '@pelada/contrato';
import {
  CODIGO_LIMITE_ASSINATURAS,
  CODIGO_PUSH_INDISPONIVEL,
  criarAssinaturaPushCorpo,
  criarCancelarPushCorpo,
  hostsPushDev,
  LIMITE_CORPO_PUSH_BYTES,
  MENSAGEM_LIMITE_ASSINATURAS,
  MENSAGEM_PUSH_INDISPONIVEL,
  type DisponibilidadePush,
  type ErroPush,
  type EstadoPush,
} from '@pelada/contrato/push';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { push } from '../../infraestrutura/db/repositorios/push.ts';
import { chavesVapidDoAmbiente } from '../../infraestrutura/push/vapid.ts';
import { grupoDoSlug, MENSAGEM_CORPO_GRANDE } from './publico.ts';

/**
 * Rotas públicas do push do ranking `/api/publico/:slug/push*` (notificacoes T28 a T30; AD-103). A cadeia das rotas
 * públicas vem antes, no `criarApp`: `X-Pelada: 1` nas escritas (ACE-49), `LIMITE_PUBLICO` com o IP só como chave
 * (AD-045, NOT-11), slug no formato (404 sem consulta, PAR-90) e a transação só com o slug, sem conta (AD-034).
 *
 * `GET …/push` (T28; NOT-01, NOT-14, NOT-61): `{ disponivel, chavePublica }`.
 * - sem as três VAPID (vazia ou só espaços conta como ausente): `disponivel: false`, `chavePublica: null`;
 * - grupo sem push pelo plano (`recursoLiberado(…, 'push')`, o ponto único, AD-104): idem;
 * - slug inexistente ou de grupo arquivado: o 404 do PAR-90.
 *   SPEC_DEVIATION: a T28 pede `disponivel: false` no arquivado; a RLS do slug não mostra o grupo arquivado e o PAR-90
 *   manda o mesmo corpo para inexistente e arquivado, então ele responde 404 como o ranking. O front esconde o controle
 *   quando o `GET` falha (T37), o que dá o mesmo efeito na tela.
 * - a chave privada nunca sai (NOT-14): a resposta é montada só com a pública.
 *
 * `POST …/push/estado` (T28; NOT-71): `endpoint` e `chaves.auth` provam a posse; `{ assinado }`.
 * - corpo acima de 4 KB: 413 antes de ler o JSON; não JSON ou fora do contrato: 422 (NOT-67);
 * - `auth` errado devolve `assinado: false`, igual a não ter linha: não enumera endpoints;
 * - slug inexistente ou arquivado: 404 do PAR-90.
 */

/** O `bodyLimit` das rotas de push: 413 com a mesma mensagem do `POST …/eventos`. */
export function limiteCorpoPush() {
  return bodyLimit({
    maxSize: LIMITE_CORPO_PUSH_BYTES,
    onError: (c) => c.json({ erro: MENSAGEM_CORPO_GRANDE }, 413),
  });
}

/** Hosts do serviço de push falso, só no ambiente local e no e2e (T27; NOT-63). */
export const hostsExtras = (c: Context<Ambiente>): string[] => hostsPushDev(c.env.PUSH_HOSTS_DEV);

/** 403 (sem push pelo plano) ou 503 (sem VAPID) `push_indisponivel` (NOT-09, NOT-61). */
export function respostaPushIndisponivel(c: Context<Ambiente>, status: 403 | 503): Response {
  const erro: ErroPush = { erro: MENSAGEM_PUSH_INDISPONIVEL, codigo: CODIGO_PUSH_INDISPONIVEL };
  return c.json(erro, status);
}

export function rotasPublicoPush(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/publico/:slug/push', async (c) => {
    const grupo = await grupoDoSlug(c);
    if (grupo instanceof Response) return grupo;
    const vapid = chavesVapidDoAmbiente(c.env);
    let resposta: DisponibilidadePush = { disponivel: false, chavePublica: null };
    if (vapid !== null && (await c.var.recursoLiberado(c.var.db, grupo.id, 'push')))
      resposta = { disponivel: true, chavePublica: vapid.publica };
    return c.json(resposta, 200);
  });

  /**
   * `POST …/push` (T29; NOT-05 a NOT-11, NOT-61, NOT-65, NOT-67; AD-065, AD-104), na ordem:
   * 1. `X-Pelada` (403) e `LIMITE_PUBLICO` (429) já passaram no `criarApp`; o IP só foi chave do limitador;
   * 2. corpo acima de 4 KB: 413; não JSON: 422; fora do `assinaturaPushCorpo` (campo a mais, não https, host fora da
   *    lista, `p256dh` ou `auth` inválidos): 422 por campo (NOT-06, NOT-67);
   * 3. sem VAPID: 503 `push_indisponivel` (NOT-61);
   * 4. slug inexistente ou arquivado: 404 do PAR-90 (NOT-08);
   * 5. `recursoLiberado(…, 'push')` falso: 403 `push_indisponivel` (NOT-09, AD-104);
   * 6. `push_ranking_assinar`: `criada` 201, `atualizada` 200 (NOT-05, NOT-07, NOT-65), `limite` 409
   *    `limite_assinaturas` (NOT-10), `nao_encontrado` 404 do PAR-90 (o grupo arquivado entre a leitura e a função).
   * Toda recusa sai com status ≥ 400 e o `comBanco` desfaz: nada fica gravado. A resposta não ecoa endpoint nem chaves
   * (NOT-54).
   */
  rotas.post('/publico/:slug/push', limiteCorpoPush(), async (c) => {
    const corpo = await lerCorpoDoGrupo(c, criarAssinaturaPushCorpo(hostsExtras(c)));
    if (!corpo.ok) return corpo.resposta;
    if (chavesVapidDoAmbiente(c.env) === null) return respostaPushIndisponivel(c, 503);
    const grupo = await grupoDoSlug(c);
    if (grupo instanceof Response) return grupo;
    if (!(await c.var.recursoLiberado(c.var.db, grupo.id, 'push')))
      return respostaPushIndisponivel(c, 403);

    const resultado = await push.assinarRanking(c.var.db, c.var.slugPublico ?? '', {
      endpoint: corpo.dados.endpoint,
      p256dh: corpo.dados.chaves.p256dh,
      auth: corpo.dados.chaves.auth,
    });
    const assinado: EstadoPush = { assinado: true };
    switch (resultado) {
      case 'criada':
        return c.json(assinado, 201);
      case 'atualizada':
        return c.json(assinado, 200);
      case 'limite': {
        const erro: ErroPush = {
          erro: MENSAGEM_LIMITE_ASSINATURAS,
          codigo: CODIGO_LIMITE_ASSINATURAS,
        };
        return c.json(erro, 409);
      }
      case 'nao_encontrado':
        return c.json(corpoDoErro('nao_encontrado'), 404);
    }
  });

  rotas.post('/publico/:slug/push/estado', limiteCorpoPush(), async (c) => {
    const corpo = await lerCorpoDoGrupo(c, criarCancelarPushCorpo(hostsExtras(c)));
    if (!corpo.ok) return corpo.resposta;
    const estado = await push.estadoRanking(
      c.var.db,
      c.var.slugPublico ?? '',
      corpo.dados.endpoint,
      corpo.dados.chaves.auth,
    );
    if (estado === 'nao_encontrado') return c.json(corpoDoErro('nao_encontrado'), 404);
    const resposta: EstadoPush = { assinado: estado === 'ativa' };
    return c.json(resposta, 200);
  });

  return rotas;
}
