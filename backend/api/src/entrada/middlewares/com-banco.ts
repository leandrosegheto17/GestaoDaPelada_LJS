import type { Context, MiddlewareHandler } from 'hono';
import type { Ambiente } from '../ambiente.ts';
import { criarCliente, fecharNoFim, type OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { kyselyDoCliente } from '../../infraestrutura/db/transacao.ts';

/**
 * Uma transação por requisição, com o contexto da RLS definido antes de qualquer consulta da
 * rota (FUN-16, design C4).
 *
 * Estados e casos limite (a conexão só abre na primeira consulta, T37):
 * - rota que não consulta: nenhuma conexão, nenhum BEGIN, nada a encerrar;
 * - GET e HEAD: `BEGIN TRANSACTION READ ONLY` (escrita falha no banco); os demais: `BEGIN`;
 * - logo depois do BEGIN, `set_config('app.conta_id'|'app.slug_publico', $n, true)`, com
 *   parâmetros e local à transação; sem contexto, os dois valem '' (a RLS não vê nada);
 * - status menor que 400 e sem erro: COMMIT; status 4xx ou 5xx, ou erro na rota: ROLLBACK;
 * - COMMIT que falha: a resposta vira 500 (a rota não pode dizer que gravou);
 * - ROLLBACK que falha: ignorado (a conexão fecha em seguida e o banco desfaz);
 * - contexto que lança: 500 pelo `onError`, sem abrir conexão;
 * - requisições simultâneas: cada uma tem o seu cliente e a sua transação; o contexto é local.
 *
 * [LACUNA] COMMIT que falha depois de a rota responder 2xx: a spec não define a resposta; o
 * rascunho responde 500 "Erro interno." (interpretação conservadora).
 */

export interface ContextoBanco {
  /** `app.conta_id`: a conta logada; nulo = sem conta. */
  conta: string | null;
  /** `app.slug_publico`: o slug da página pública; nulo = sem slug. */
  slug: string | null;
}

export const SEM_CONTEXTO: ContextoBanco = { conta: null, slug: null };

export type ObterContexto = (c: Context<Ambiente>) => ContextoBanco | Promise<ContextoBanco>;

export interface OpcoesComBanco {
  /** Só para os testes: troca a fábrica de conexões (ex.: para registrar as consultas). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

export const SQL_CONTEXTO = `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)`;

function somenteLeitura(metodo: string): boolean {
  const m = metodo.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

/**
 * Contexto padrão (T20; ACE-47): a conta da sessão que o `carregarSessao` resolveu antes, sem
 * slug. Sem sessão, `SEM_CONTEXTO`.
 */
export const contextoDaSessao: ObterContexto = (c) =>
  c.var.contaId ? { conta: c.var.contaId, slug: null } : SEM_CONTEXTO;

export function comBanco(
  obterContexto: ObterContexto = contextoDaSessao,
  opcoes: OpcoesComBanco = {},
): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const contexto = await obterContexto(c);
    const leitura = somenteLeitura(c.req.method);
    const cliente = criarCliente(c.env.HYPERDRIVE.connectionString, {
      ...(opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
      aoAbrir: async (consultar) => {
        await consultar(leitura ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN');
        await consultar(SQL_CONTEXTO, [contexto.conta ?? '', contexto.slug ?? '']);
      },
    });
    c.set('db', kyselyDoCliente(cliente));

    let erroDaRota = false;
    try {
      await next();
    } catch (erro) {
      // O Hono costuma tratar o erro da rota no onError antes de voltar aqui; isto cobre o resto.
      erroDaRota = true;
      throw erro;
    } finally {
      if (cliente.aberto()) {
        const confirmar = !erroDaRota && !c.error && c.res.status < 400;
        if (confirmar) {
          try {
            await cliente.consultar('COMMIT');
          } catch {
            c.res = c.json({ erro: 'Erro interno.' }, 500);
          }
        } else {
          await cliente.consultar('ROLLBACK').catch(() => undefined);
        }
      }
      await fecharNoFim(c, cliente);
    }
  };
}
