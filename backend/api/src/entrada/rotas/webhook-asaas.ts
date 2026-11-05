import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { asaasEventoCorpo, type AsaasEventoCorpo } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comBanco, SEM_CONTEXTO } from '../middlewares/com-banco.ts';
import { limiteTaxa } from '../middlewares/limite-taxa.ts';
import { MENSAGEM_CORPO_GRANDE } from './publico.ts';
import { eventoDoCorpo } from '../../aplicacao/plano/evento-asaas.ts';
import type { RegistroAsaas } from '../../infraestrutura/asaas/cliente.ts';
import { tokenDoWebhookConfere } from '../../infraestrutura/asaas/token-webhook.ts';
import type { OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import { eventosAsaas } from '../../infraestrutura/db/repositorios/eventos-asaas.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';

/**
 * `POST /api/webhooks/asaas` (planos-e-cobranca T35; PLA-39, PLA-40, PLA-50; AD-093). Sem sessão e fora do
 * `exigirCabecalhoPelada` (a exceção mora lá). Na ordem, antes de abrir o banco:
 * 1. `LIMITE_WEBHOOK` com chave fixa (o Asaas sai de vários IPs; o limite é do webhook inteiro): 429 (PLA-40);
 * 2. `asaas-access-token` contra `ASAAS_WEBHOOK_TOKEN`, em tempo constante: 401 sem gravar e sem logar o valor
 *    (PLA-39); a chave da API no header também é recusada (são segredos diferentes);
 * 3. corpo acima de 64 KiB: 413, antes de ler o JSON (PLA-40);
 * 4. JSON inválido ou sem `id`/`event`: 400; campo novo segue (contrato tolerante, PLA-50);
 * 5. transação sem conta e sem slug (a `asaas_evento_registrar` recusa outro contexto) e `processar`; 200 depois de
 *    gravar (PLA-41). Erro no processamento: 500 pelo `onError` e `ROLLBACK`, e o Asaas reenvia.
 */

export const LIMITE_CORPO_WEBHOOK_BYTES = 64 * 1024;
/** Chave fixa do `LIMITE_WEBHOOK`. */
export const CHAVE_LIMITE_WEBHOOK = 'webhook:asaas';
export const HEADER_TOKEN_ASAAS = 'asaas-access-token';

/** O que a rota faz com o evento já validado, dentro da transação. */
export type ProcessarEvento = (db: Db, corpo: AsaasEventoCorpo) => Promise<unknown>;

/** Processamento da T35: só registra o evento (a aplicação do efeito vem na T36). */
export const registrarEvento: ProcessarEvento = (db, corpo) =>
  eventosAsaas.registrar(db, eventoDoCorpo(corpo));

const registroPadrao: RegistroAsaas = (linha) => console.error(JSON.stringify(linha));

export interface OpcoesWebhookAsaas {
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
  processar?: ProcessarEvento;
  /** Só para os testes: o log do 401 (nunca com o valor recebido). */
  registrar?: RegistroAsaas;
}

export function rotasWebhookAsaas(opcoes: OpcoesWebhookAsaas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const processar = opcoes.processar ?? registrarEvento;
  const registrar = opcoes.registrar ?? registroPadrao;

  rotas.post(
    '/webhooks/asaas',
    limiteTaxa('LIMITE_WEBHOOK', () => CHAVE_LIMITE_WEBHOOK),
    async (c, next) => {
      const recebido = c.req.header(HEADER_TOKEN_ASAAS);
      if (!(await tokenDoWebhookConfere(recebido, c.env.ASAAS_WEBHOOK_TOKEN))) {
        registrar({ evento: 'webhook_asaas_recusado', comHeader: recebido !== undefined ? 'sim' : 'nao' });
        return c.json({ erro: 'nao_autorizado' }, 401);
      }
      await next();
    },
    bodyLimit({
      maxSize: LIMITE_CORPO_WEBHOOK_BYTES,
      onError: (c) => c.json({ erro: MENSAGEM_CORPO_GRANDE }, 413),
    }),
    comBanco(() => SEM_CONTEXTO, opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    async (c) => {
      let json: unknown;
      try {
        json = await c.req.json();
      } catch {
        return c.json({ erro: 'corpo_invalido' }, 400);
      }
      const corpo = asaasEventoCorpo.safeParse(json);
      if (!corpo.success) return c.json({ erro: 'corpo_invalido' }, 400);
      await processar(c.var.db, corpo.data);
      return c.json({ recebido: true }, 200);
    },
  );

  return rotas;
}
