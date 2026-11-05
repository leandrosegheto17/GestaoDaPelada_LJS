import { Buffer } from 'node:buffer';
import { sql } from 'kysely';
import { criarCliente, type OpcoesCliente } from '../../infraestrutura/db/cliente.ts';
import type { Db } from '../../infraestrutura/db/repositorios/tipos.ts';
import type { Mensagem, Remetente } from '../../infraestrutura/email/resend.ts';
import { hashIp } from '../../infraestrutura/sessao/token.ts';

/**
 * Envio de e-mail de conta com cota e intervalo (T24; ACE-51, ACE-52, ACE-72, ACE-73, ACE-75).
 *
 * Casos limite e estados, listados antes do código:
 * - intervalo de 60 s (ACE-51): o repositório (`conta_cadastrar`, `link_pedir…`, `convite_criar`)
 *   já devolve `enviar = false` dentro dos 60 s; aqui não se reserva cota nem se chama o
 *   remetente, e o resultado é o mesmo sucesso (`enviado`);
 * - cota de cadastro cheia com recuperação livre (ACE-72): cadastro, reenvio e convite usam 80%
 *   de `LIMITE_EMAILS_DIA` (o 80.º sai, o 81.º não); recuperação de conta confirmada usa 100%;
 *   recuperação de conta não confirmada usa os 80% (ACE-73);
 * - remetente falha (ACE-52) ou demora mais de 10 s (o `remetenteResend` aborta e devolve
 *   `falhou`, ACE-75): `indisponivel` (a rota responde 503 `email_indisponivel`) e a reserva
 *   da cota é desfeita por um `ROLLBACK TO SAVEPOINT`, então a cota não é gasta mesmo que a
 *   transação siga; a rota com 503 ainda desfaz o resto (link, intervalo), e pedir de novo envia;
 * - trava da cota acima de 2 s (`lock_timeout` da `email_cota_reservar`, ACE-75): o banco falha
 *   com 55P03; vira `indisponivel`, sem chamar o remetente;
 * - 21.º pedido da origem em 1 h (ACE-73): `registrarOrigem` devolve falso e a rota responde
 *   429 `muitas_requisicoes` sem enviar. O pedido conta "ao chegar, mesmo que a rota depois o
 *   recuse": por isso o registro roda numa transação curta própria, que não é desfeita pelo
 *   ROLLBACK de uma resposta 4xx ou 5xx da rota.
 */

/** Teto de pedidos de e-mail por origem (IPv4 inteiro ou /48) em 1 h (ACE-73). */
export const TETO_ORIGEM_HORA = 20;

/** `LIMITE_EMAILS_DIA` quando a variável falta ou é inválida (o Resend Free, ACE-72). */
export const LIMITE_EMAILS_DIA_PADRAO = 100;

/** `cadastro`: cadastro, reenvio, convite e recuperação de conta não confirmada (80%); `recuperacao`: 100%. */
export type CategoriaEmail = 'cadastro' | 'recuperacao';

export type ResultadoEnvioConta = 'enviado' | 'indisponivel';

/** O limite diário do ambiente: inteiro positivo, senão o padrão. */
export function limiteEmailsDia(valor: string | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n > 0 ? n : LIMITE_EMAILS_DIA_PADRAO;
}

/** Teto da categoria: 80% (arredondado para baixo) ou 100% do limite diário. */
export function tetoDaCategoria(categoria: CategoriaEmail, limite: number): number {
  return categoria === 'recuperacao' ? limite : Math.floor(limite * 0.8);
}

/** Recuperação só usa a reserva de 100% quando o e-mail da conta já foi confirmado (ACE-73). */
export function categoriaDaRecuperacao(confirmada: boolean): CategoriaEmail {
  return confirmada ? 'recuperacao' : 'cadastro';
}

export interface OpcoesOrigem {
  /** Só para os testes: troca a fábrica de conexões (ex.: para rodar como `pelada_app`). */
  fabrica?: NonNullable<OpcoesCliente['fabrica']>;
}

/**
 * Registra o pedido de e-mail da origem (chave /48 do IP, ACE-73) numa transação própria e
 * devolve falso quando a origem já fez 20 pedidos na última hora (nada é gravado então).
 */
export async function registrarOrigem(urlBanco: string, ip: string | null | undefined, opcoes: OpcoesOrigem = {}): Promise<boolean> {
  const chave = Buffer.from(await hashIp(ip, 48));
  const cliente = criarCliente(urlBanco, {
    ...(opcoes.fabrica ? { fabrica: opcoes.fabrica } : {}),
    aoAbrir: async (consultar) => {
      await consultar('BEGIN');
    },
  });
  try {
    const r = await cliente.consultar<{ ok: boolean }>('SELECT email_origem_registrar($1, $2) AS ok', [chave, TETO_ORIGEM_HORA]);
    await cliente.consultar('COMMIT');
    return r.rows[0]?.ok === true;
  } catch (erro) {
    if (cliente.aberto()) await cliente.consultar('ROLLBACK').catch(() => undefined);
    throw erro;
  } finally {
    await cliente.fechar();
  }
}

export interface PedidoEnvio {
  /** O `enviar` que o repositório devolveu: falso dentro dos 60 s (ACE-51). */
  enviar: boolean;
  categoria: CategoriaEmail;
  /** `LIMITE_EMAILS_DIA` já lido (`limiteEmailsDia`). */
  limiteDia: number;
  mensagem: Mensagem;
}

/** Erro do banco com código SQLSTATE (o `pg` põe em `code`). */
function codigoSql(erro: unknown): string | undefined {
  return typeof erro === 'object' && erro !== null && 'code' in erro && typeof erro.code === 'string' ? erro.code : undefined;
}

/**
 * Envia um e-mail de conta na transação da rota: reserva a cota da categoria e chama o
 * remetente. Falha do remetente ou da trava desfaz só a reserva (savepoint) e devolve
 * `indisponivel`; a rota responde 503 `email_indisponivel`.
 */
export async function enviarEmailDeConta(db: Db, remetente: Remetente, p: PedidoEnvio): Promise<ResultadoEnvioConta> {
  if (!p.enviar) return 'enviado';

  await sql`SAVEPOINT cota_email`.execute(db);
  let reservada: boolean;
  try {
    const r = await sql<{ ok: boolean }>`
      SELECT email_cota_reservar(${tetoDaCategoria(p.categoria, p.limiteDia)}) AS ok`.execute(db);
    reservada = r.rows[0]?.ok === true;
  } catch (erro) {
    // 55P03 (lock_not_available): a trava do dia passou de 2 s (ACE-75). Outro erro sobe.
    await sql`ROLLBACK TO SAVEPOINT cota_email`.execute(db);
    if (codigoSql(erro) === '55P03') return 'indisponivel';
    throw erro;
  }
  if (!reservada) {
    await sql`RELEASE SAVEPOINT cota_email`.execute(db);
    return 'indisponivel';
  }

  const resultado = await remetente.enviar(p.mensagem);
  if (resultado !== 'enviado') {
    await sql`ROLLBACK TO SAVEPOINT cota_email`.execute(db);
    return 'indisponivel';
  }
  await sql`RELEASE SAVEPOINT cota_email`.execute(db);
  return 'enviado';
}
