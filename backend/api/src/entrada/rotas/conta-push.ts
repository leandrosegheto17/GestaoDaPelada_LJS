import { Hono, type Context } from 'hono';
import { sql } from 'kysely';
import {
  CODIGO_LIMITE_ASSINATURAS,
  criarAssinaturaPushCorpo,
  criarCancelarPushCorpo,
  MENSAGEM_LIMITE_ASSINATURAS,
  type DisponibilidadePush,
  type ErroPush,
  type EstadoPush,
} from '@pelada/contrato/push';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { chaveConta } from '../middlewares/limite-escrita.ts';
import { limiteTaxa } from '../middlewares/limite-taxa.ts';
import { exigirSessao } from '../middlewares/sessao.ts';
import { push } from '../../infraestrutura/db/repositorios/push.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import { transacaoCurta } from '../../infraestrutura/db/transacao-curta.ts';
import { chavesVapidDoAmbiente } from '../../infraestrutura/push/vapid.ts';
import { comFabrica, type OpcoesRotas } from './apoio-acesso.ts';
import { hostsExtras, limiteCorpoPush, respostaPushIndisponivel } from './publico-push.ts';

/**
 * Rotas do push de cobrança da organizadora `/api/conta/push*` (notificacoes T31; NOT-44, NOT-45, NOT-53, NOT-61;
 * AD-103, AD-106, AD-107). Todas com sessão (401 `sessao_expirada` sem ela); o `X-Pelada: 1` das escritas vem do
 * `criarApp` (403 antes de tudo, ACE-49). As escritas contam no `LIMITE_ESCRITA` com a chave da conta (a mesma do
 * `limitarEscritasDeGrupo`, SEC-003), depois da sessão: sem conta não há chave. As funções da T9 só tocam as linhas da
 * conta do contexto: a conta B não vê, cancela nem consulta a assinatura da conta A (NOT-53).
 *
 * Como em minha conta (`rotas/minha-conta.ts`), `/api/conta/*` não passa pelo `comBanco`: cada rota abre a
 * `transacaoCurta` com a conta da sessão. Nas recusas (409, 422, 503) nada é gravado porque a função não roda ou não grava.
 *
 * - `GET /api/conta/push`: `{ oferecer, chavePublica }`; `oferecer` só com VAPID e para a criadora de ao menos um grupo
 *   não arquivado (o aviso de cobrança vai só para ela, NOT-38). Admin convidada ou conta sem grupo: `false`.
 * - `POST /api/conta/push`: 413 e 422 do corpo; sem VAPID 503 `push_indisponivel`; `criada` 201, `atualizada` 200,
 *   `limite` (10 por conta, AD-107) 409 `limite_assinaturas`.
 * - `DELETE /api/conta/push`: 204 sempre, com ou sem linha (sem VAPID também).
 * - `POST /api/conta/push/estado`: `{ assinado }`; `auth` errado dá `false`.
 *
 * SPEC_DEVIATION: a T31 não diz se a não criadora pode assinar; o `POST` não recusa (a assinatura só recebe aviso se a
 * conta for criadora quando o aviso sair, `aviso_cobranca_destino`). O front só mostra o controle com `oferecer: true`.
 */

const limiteEscritaDaConta = limiteTaxa('LIMITE_ESCRITA', (c) =>
  c.var.contaId ? chaveConta(c.var.contaId) : undefined,
);

/** A conta do contexto criou algum grupo não arquivado (a RLS de `grupos` já mostra só os visíveis a ela). */
async function criadoraDeGrupoAtivo(db: Db): Promise<boolean> {
  const r = await sql<{ e: boolean }>`
    SELECT EXISTS (
      SELECT 1 FROM grupos g WHERE g.criado_por = app_conta_id() AND g.arquivado_em IS NULL
    ) AS e`.execute(db);
  return r.rows[0]?.e === true;
}

export function rotasContaPush(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  const naConta = <T>(c: Context<Ambiente>, fn: (db: Db) => Promise<T>): Promise<T> =>
    transacaoCurta(c.env.HYPERDRIVE.connectionString, fn, {
      ...comFabrica(opcoes),
      conta: c.var.contaId ?? null,
    });

  rotas.get('/conta/push', exigirSessao, async (c) => {
    const vapid = chavesVapidDoAmbiente(c.env);
    let resposta: { oferecer: boolean; chavePublica: DisponibilidadePush['chavePublica'] } = {
      oferecer: false,
      chavePublica: null,
    };
    if (vapid !== null && (await naConta(c, criadoraDeGrupoAtivo)))
      resposta = { oferecer: true, chavePublica: vapid.publica };
    return c.json(resposta, 200);
  });

  rotas.post('/conta/push', exigirSessao, limiteEscritaDaConta, limiteCorpoPush(), async (c) => {
    const corpo = await lerCorpoDoGrupo(c, criarAssinaturaPushCorpo(hostsExtras(c)));
    if (!corpo.ok) return corpo.resposta;
    if (chavesVapidDoAmbiente(c.env) === null) return respostaPushIndisponivel(c, 503);
    const resultado = await naConta(c, (db) =>
      push.assinarConta(db, {
        endpoint: corpo.dados.endpoint,
        p256dh: corpo.dados.chaves.p256dh,
        auth: corpo.dados.chaves.auth,
      }),
    );
    const assinado: EstadoPush = { assinado: true };
    if (resultado === 'criada') return c.json(assinado, 201);
    if (resultado === 'atualizada') return c.json(assinado, 200);
    const erro: ErroPush = { erro: MENSAGEM_LIMITE_ASSINATURAS, codigo: CODIGO_LIMITE_ASSINATURAS };
    return c.json(erro, 409);
  });

  rotas.delete('/conta/push', exigirSessao, limiteEscritaDaConta, limiteCorpoPush(), async (c) => {
    const corpo = await lerCorpoDoGrupo(c, criarCancelarPushCorpo(hostsExtras(c)));
    if (!corpo.ok) return corpo.resposta;
    await naConta(c, (db) =>
      push.cancelarConta(db, corpo.dados.endpoint, corpo.dados.chaves.auth),
    );
    return c.body(null, 204);
  });

  rotas.post(
    '/conta/push/estado',
    exigirSessao,
    limiteEscritaDaConta,
    limiteCorpoPush(),
    async (c) => {
      const corpo = await lerCorpoDoGrupo(c, criarCancelarPushCorpo(hostsExtras(c)));
      if (!corpo.ok) return corpo.resposta;
      const estado = await naConta(c, (db) =>
        push.estadoConta(db, corpo.dados.endpoint, corpo.dados.chaves.auth),
      );
      const resposta: EstadoPush = { assinado: estado === 'ativa' };
      return c.json(resposta, 200);
    },
  );

  return rotas;
}
