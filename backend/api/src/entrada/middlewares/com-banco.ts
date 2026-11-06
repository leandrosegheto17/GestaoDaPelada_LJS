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
 * - GET e HEAD, e as prévias (caminho que termina em `/previa`, PAR-109): `BEGIN TRANSACTION READ ONLY`
 *   (escrita falha no banco); os demais: `BEGIN`;
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
 *
 * Tarefas depois do commit (notificacoes T15; NOT-20, NOT-21, NOT-22; AD-068, AD-098): a rota registra com
 * `c.var.aposCommit(fn)` o que deve acontecer só se a gravação ficar de pé (hoje, enfileirar o aviso do ranking).
 * - `COMMIT` bem-sucedido (ou resposta abaixo de 400 numa rota que nunca abriu conexão, sem nada a confirmar):
 *   as tarefas rodam em ordem, por `executionCtx.waitUntil`, depois de a resposta estar pronta e fora dela;
 * - status 4xx ou 5xx, erro na rota ou `COMMIT` que falha: as tarefas são descartadas, nenhuma roda;
 * - tarefa que lança (ou rejeita): o erro vai ao Sentry sem conteúdo (só um motivo fixo), as seguintes seguem e a
 *   resposta já enviada não muda;
 * - sem `executionCtx` (fora do Worker): as tarefas rodam sem esperar, também depois do `COMMIT`.
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
  /** Só para os testes: troca o relato ao Sentry de uma tarefa que falhou depois do commit. */
  reportarFalhaAposCommit?: () => void;
}

/**
 * O que vai ao Sentry quando uma tarefa depois do commit falha: nenhuma mensagem de erro, nenhum dado (NOT-22, NOT-33).
 * O Sentry é carregado só aqui, na falha, para o módulo continuar importável fora do Worker (testes em Node).
 */
function reportarFalhaPadrao(): void {
  void import('@sentry/cloudflare')
    .then((Sentry) =>
      Sentry.captureMessage('apos_commit_erro', {
        level: 'error',
        tags: { motivo: 'tarefa_falhou' },
      }),
    )
    .catch(() => undefined);
}

/** Roda as tarefas em ordem; a que lança é reportada e as outras seguem. Nunca rejeita. */
async function rodarTarefas(
  tarefas: ReadonlyArray<() => unknown>,
  reportar: () => void,
): Promise<void> {
  for (const tarefa of tarefas) {
    try {
      await tarefa();
    } catch {
      try {
        reportar();
      } catch {
        // o relato não pode derrubar as demais tarefas
      }
    }
  }
}

/** Agenda as tarefas para depois da resposta (`waitUntil`); sem contexto de execução, só dispara. */
function agendarTarefas(
  c: Context,
  tarefas: ReadonlyArray<() => unknown>,
  reportar: () => void,
): void {
  if (tarefas.length === 0) return;
  const andamento = rodarTarefas(tarefas, reportar);
  let ctx: { waitUntil(p: Promise<unknown>): void } | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx) ctx.waitUntil(andamento);
}

/**
 * Tetos de tempo da transação (SV-01): conexão `idle in transaction` por mais de 10 s e comando acima de 30 s são
 * encerrados pelo banco, para uma rota parada não segurar conexão do pool nem a trava do grupo. Locais à transação.
 */
export const IDLE_IN_TRANSACTION_MS = 10_000;
export const STATEMENT_TIMEOUT_MS = 30_000;

export const SQL_CONTEXTO = `SELECT set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true), set_config('idle_in_transaction_session_timeout', '${IDLE_IN_TRANSACTION_MS}ms', true), set_config('statement_timeout', '${STATEMENT_TIMEOUT_MS}ms', true)`;

/**
 * Prévia (partidas-e-ranking T36; PAR-109, AD-035, `BD:33-35`): caminho que termina em `/previa`, sem barra final.
 * As prévias são POST com corpo validado como na gravação, mas nada gravam.
 */
export function ehPrevia(caminho: string): boolean {
  return /\/previa$/.test(caminho);
}

/**
 * A transação da requisição é `READ ONLY`: GET e HEAD, e qualquer método nas prévias (PAR-109). O
 * `exigirGrupoAtivo` usa a mesma regra para não pedir `FOR KEY SHARE`, que o Postgres recusa em
 * transação de leitura (PAR-112).
 */
export function transacaoSomenteLeitura(metodo: string, caminho: string): boolean {
  const m = metodo.toUpperCase();
  return m === 'GET' || m === 'HEAD' || ehPrevia(caminho);
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
    const leitura = transacaoSomenteLeitura(c.req.method, c.req.path);
    const cliente = criarCliente(c.env.HYPERDRIVE.connectionString, {
      ...(opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
      aoAbrir: async (consultar) => {
        await consultar(leitura ? 'BEGIN TRANSACTION READ ONLY' : 'BEGIN');
        await consultar(SQL_CONTEXTO, [contexto.conta ?? '', contexto.slug ?? '']);
      },
    });
    c.set('db', kyselyDoCliente(cliente));
    const tarefas: Array<() => unknown> = [];
    c.set('aposCommit', (tarefa) => {
      tarefas.push(tarefa);
    });
    const reportar = opcoes.reportarFalhaAposCommit ?? reportarFalhaPadrao;

    let erroDaRota = false;
    try {
      await next();
    } catch (erro) {
      // O Hono costuma tratar o erro da rota no onError antes de voltar aqui; isto cobre o resto.
      erroDaRota = true;
      throw erro;
    } finally {
      const confirmar = !erroDaRota && !c.error && c.res.status < 400;
      let confirmado = confirmar;
      if (cliente.aberto()) {
        if (confirmar) {
          try {
            await cliente.consultar('COMMIT');
          } catch {
            confirmado = false;
            c.res = c.json({ erro: 'Erro interno.' }, 500);
          }
        } else {
          await cliente.consultar('ROLLBACK').catch(() => undefined);
        }
      }
      if (confirmado) agendarTarefas(c, tarefas, reportar);
      await fecharNoFim(c, cliente);
    }
  };
}
