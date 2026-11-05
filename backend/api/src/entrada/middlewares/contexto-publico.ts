import type { Hono, MiddlewareHandler } from 'hono';
import { corpoDoErro } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { comBanco, SEM_CONTEXTO, type ObterContexto } from './com-banco.ts';
import { limiteTaxa } from './limite-taxa.ts';

/**
 * Contexto das rotas públicas `/api/publico/:slug/*` (partidas-e-ranking T37; PAR-77, PAR-78, PAR-90, AD-034,
 * AD-045, `BD:220-222`).
 *
 * Casos limite e estados:
 * - acima do `LIMITE_PUBLICO` (chave do IP, `chaveIp(ip, 64)`): 429 com a mensagem do `limiteTaxa`, antes do slug e
 *   do banco; o IP só vira chave do binding, nunca log (PAR-78);
 * - slug fora de `^[a-z0-9-]{1,64}$` (maiúscula, sublinhado, espaço, acento, mais de 64): 404 `nao_encontrado` sem
 *   abrir conexão (PAR-90);
 * - slug válido: a conta da sessão é apagada (`contaId` e `tokenHash`) e a transação abre só com
 *   `app.slug_publico`, então um admin logado vê o grupo do slug como qualquer visitante (PAR-77, AD-034);
 * - slug válido que não existe, ou de grupo arquivado: a RLS não mostra a linha e a rota responde o mesmo 404
 *   (PAR-90, T45 em diante);
 * - a leitura da sessão (`carregarSessao`, global) roda antes; o `contextoPublico` só a descarta.
 */

export const SLUG_PUBLICO = /^[a-z0-9-]{1,64}$/;

/** Caminho das rotas públicas, relativo a /api. */
export const ROTAS_PUBLICAS = '/publico/:slug/*';

export const contextoPublico: MiddlewareHandler<Ambiente> = async (c, next) => {
  const slug = c.req.param('slug') ?? '';
  if (!SLUG_PUBLICO.test(slug)) return c.json(corpoDoErro('nao_encontrado'), 404);
  c.set('contaId', undefined);
  c.set('tokenHash', undefined);
  c.set('slugPublico', slug);
  await next();
};

/** Contexto da RLS nas rotas públicas: só o slug, nunca a conta (AD-034). */
export const contextoDoSlug: ObterContexto = (c) =>
  c.var.slugPublico ? { conta: null, slug: c.var.slugPublico } : SEM_CONTEXTO;

export interface OpcoesRotasPublicas {
  /** Só para os testes: fábrica de conexões do `comBanco` (ex.: como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

/**
 * Cadeia das rotas públicas em `criarApp`, depois do `carregarSessao`: limite por IP (AD-045), slug e transação com
 * o slug. As rotas de `/api/publico/:slug/*` só declaram o handler.
 */
export function protegerRotasPublicas(api: Hono<Ambiente>, opcoes: OpcoesRotasPublicas = {}): void {
  api.use(
    ROTAS_PUBLICAS,
    limiteTaxa('LIMITE_PUBLICO'),
    contextoPublico,
    comBanco(contextoDoSlug, opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
  );
}
