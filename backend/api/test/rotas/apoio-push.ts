import { paraBase64url } from '@pelada/contrato/push';
import type { Env } from '../../src/entrada/ambiente.ts';
import { criarApp, type OpcoesApp } from '../../src/entrada/app.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';

/**
 * Apoio dos testes das rotas de push (notificacoes T28 a T31). Como os das rotas públicas (`publico-pdf.test.ts`), o app
 * é o `criarApp` real com o banco como `pelada_app` e os limitadores liberados. Nenhum serviço de push é chamado: as
 * rotas só gravam e leem a assinatura (NOT-63).
 */

export interface Consulta {
  query: <T = Record<string, unknown>>(sql: string, valores?: unknown[]) => Promise<{ rows: T[] }>;
}

export type VariaveisVapid = Pick<Env, 'VAPID_PUBLICA' | 'VAPID_PRIVADA' | 'VAPID_ASSUNTO'>;

/** Par VAPID de verdade (P-256), como o do `pnpm vapid:gerar`. */
export async function chavesVapid(): Promise<Required<VariaveisVapid>> {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
  ])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', par.privateKey)) as JsonWebKey;
  const publica = new Uint8Array(
    (await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer,
  );
  return {
    VAPID_PUBLICA: paraBase64url(publica),
    VAPID_PRIVADA: jwk.d ?? '',
    VAPID_ASSUNTO: 'mailto:avisos@exemplo.com',
  };
}

/** `p256dh` (65 bytes, `0x04…`) e `auth` (16 bytes) válidos, em base64url. */
export function chavesAssinante(semente = 1): { p256dh: string; auth: string } {
  const ponto = new Uint8Array(65).fill(semente % 256);
  ponto[0] = 0x04;
  const auth = new Uint8Array(16).fill((semente * 7) % 256);
  return { p256dh: paraBase64url(ponto), auth: paraBase64url(auth) };
}

export const endpointDe = (nome: string): string =>
  `https://fcm.googleapis.com/fcm/send/rotas-${nome}`;

/** Corpo do `POST …/push` (o `PushSubscription.toJSON()` na forma do contrato). */
export function corpoAssinatura(nome: string, semente = 1) {
  const { p256dh, auth } = chavesAssinante(semente);
  return { endpoint: endpointDe(nome), chaves: { p256dh, auth } };
}

/** Corpo do `DELETE …/push` e do `POST …/push/estado`. */
export function corpoCancelar(nome: string, semente = 1) {
  return { endpoint: endpointDe(nome), chaves: { auth: chavesAssinante(semente).auth } };
}

export interface PedidoPush {
  metodo?: string;
  corpo?: unknown;
  /** Corpo cru, para JSON inválido e corpo grande. */
  cru?: string;
  /** Sem o `X-Pelada: 1` (NOT-11, ACE-49). */
  semPelada?: boolean;
  ip?: string;
  env?: Partial<Env>;
  /** Token do cookie `__Host-sessao` (rotas da conta, T31). */
  sessao?: string | null;
}

/** Cliente das rotas `/api…` com o env do teste (`base`) e o do pedido por cima. */
export function clientePush(url: string, base: Partial<Env>, opcoes: OpcoesApp = {}) {
  const app = criarApp({ fabricaBanco: fabricaComoApp().fabrica, ...opcoes });
  return async (caminho: string, p: PedidoPush = {}): Promise<Response> => {
    const headers = new Headers({ 'cf-connecting-ip': p.ip ?? '203.0.113.77' });
    if (!p.semPelada) headers.set('x-pelada', '1');
    if (p.sessao) headers.set('cookie', `${NOME_COOKIE_SESSAO}=${p.sessao}`);
    let body: string | undefined;
    if (p.cru !== undefined) body = p.cru;
    else if (p.corpo !== undefined) body = JSON.stringify(p.corpo);
    if (body !== undefined) headers.set('content-type', 'application/json');
    const ctx = contextoFalso();
    const r = await app.request(
      `/api${caminho}`,
      {
        method: p.metodo ?? (body !== undefined ? 'POST' : 'GET'),
        headers,
        ...(body !== undefined ? { body } : {}),
      },
      envAcesso(url, { ...base, ...p.env }),
      ctx,
    );
    await ctx.esperar();
    return r;
  };
}

/** Sem as três VAPID (NOT-61): o env do pedido as apaga. */
export const SEM_VAPID: Partial<Env> = {
  VAPID_PUBLICA: undefined,
  VAPID_PRIVADA: undefined,
  VAPID_ASSUNTO: undefined,
} as unknown as Partial<Env>;

/** Plano do grupo, como superusuário: `ativo` é Pro, `inadimplente` é Free (`planoEfetivo`). */
export async function planoDoGrupo(
  db: Consulta,
  grupo: string,
  situacao: 'ativo' | 'inadimplente',
): Promise<void> {
  await db.query('UPDATE grupos SET situacao_comercial = $2, trial_inicio = NULL WHERE id = $1', [
    grupo,
    situacao,
  ]);
}

export interface LinhaPushRanking {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** As assinaturas do grupo, lidas como superusuário (a `pelada_app` não lê a tabela, AD-101). */
export async function assinaturasDoGrupo(db: Consulta, grupo: string): Promise<LinhaPushRanking[]> {
  const r = await db.query<LinhaPushRanking>(
    'SELECT endpoint, p256dh, auth FROM push_ranking WHERE grupo_id = $1 ORDER BY id',
    [grupo],
  );
  return r.rows;
}

/** Grava uma assinatura direto, como superusuário (o cenário de um teste que não passa pela rota). */
export async function semearAssinatura(
  db: Consulta,
  grupo: string,
  nome: string,
  semente = 1,
): Promise<void> {
  const { p256dh, auth } = chavesAssinante(semente);
  await db.query(
    'INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4)',
    [grupo, endpointDe(nome), p256dh, auth],
  );
}

export async function limparAssinaturas(db: Consulta, grupo: string): Promise<void> {
  await db.query('DELETE FROM push_ranking WHERE grupo_id = $1', [grupo]);
}
