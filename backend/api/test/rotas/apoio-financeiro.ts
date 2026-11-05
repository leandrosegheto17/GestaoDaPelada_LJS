import { Buffer } from 'node:buffer';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { NOME_COOKIE_SESSAO } from '../../src/infraestrutura/sessao/cookie.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';
import type { CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Apoio das rotas do financeiro (T25 a T27): app real como `pelada_app` com relógio fixo, sessão nova por pedido e o
 * estado inicial do caixa de G (`cenario-grupos.ts`: mensalidade 5000, saldo inicial 0 desde 2026-01-01, um lançamento
 * de 2026-01-05 vinculado ao pagamento de Bira em 2026-01), que `restaurarCaixa` devolve depois de cada teste.
 *
 * Molde: `escalacoes.test.ts:27-52` (sessão e pedido).
 */

/** 2026-10-15 12:00 em São Paulo: hoje = 2026-10-15, mês padrão 2026-10. */
export const AGORA_FINANCEIRO = '2026-10-15T15:00:00.000Z';
export const HOJE_FINANCEIRO = '2026-10-15';

export function appFinanceiro(agora = AGORA_FINANCEIRO) {
  return criarApp({ fabricaBanco: fabricaComoApp().fabrica, relogio: relogioFixo(agora) });
}

export async function sessaoDe(aberto: CenarioGruposAberto, conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

export interface Pedido {
  metodo: string;
  caminho: string;
  conta: string;
  /** Corpo já em texto (para mandar JSON inválido) ou objeto serializado aqui. */
  corpo?: unknown;
  app?: ReturnType<typeof criarApp>;
}

/** Pede `/api<caminho>` com `X-Pelada: 1` e a sessão da conta. */
export async function pedir(aberto: CenarioGruposAberto, p: Pedido): Promise<Response> {
  const headers = new Headers({ 'x-pelada': '1', cookie: `${NOME_COOKIE_SESSAO}=${await sessaoDe(aberto, p.conta)}` });
  const init: RequestInit = { method: p.metodo, headers };
  if (p.corpo !== undefined) {
    headers.set('content-type', 'application/json');
    init.body = typeof p.corpo === 'string' ? p.corpo : JSON.stringify(p.corpo);
  }
  const ctx = contextoFalso();
  const r = await (p.app ?? appFinanceiro()).request(`/api${p.caminho}`, init, envAcesso(aberto.url), ctx);
  await ctx.esperar();
  return r;
}

/**
 * O `saldoFinanceiroCentavos` do detalhe do grupo: ausente (`undefined`), nulo ou inteiro seguro; outro valor lança. O
 * detalhe inteiro também traz o início do grupo da partidas-e-ranking (T43), então não se confere pelo `grupoDetalhe`
 * estrito.
 */
export async function saldoDe(r: Response): Promise<number | null | undefined> {
  const corpo = (await r.json()) as Record<string, unknown>;
  const valor = corpo['saldoFinanceiroCentavos'];
  if (valor === undefined || valor === null) return valor;
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor)) throw new Error(`saldoFinanceiroCentavos inválido: ${String(valor)}`);
  return valor;
}

export interface LinhaConfig {
  mensalidade_centavos: number | null;
  saldo_inicial_centavos: number;
  data_saldo_inicial: string;
}

/** A configuração de G lida como superusuário. */
export async function configDe(aberto: CenarioGruposAberto, grupo: string): Promise<LinhaConfig | null> {
  const r = await aberto.db.query<LinhaConfig>(
    `SELECT mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial::text AS data_saldo_inicial
       FROM config_financeira WHERE grupo_id = $1`,
    [grupo],
  );
  return r.rows[0] ?? null;
}

/** Quantas linhas de auditoria com a ação em G. */
export async function auditorias(aberto: CenarioGruposAberto, grupo: string, acao: string): Promise<number> {
  const r = await aberto.db.query<{ n: string }>('SELECT count(*) AS n FROM auditoria WHERE grupo_id = $1 AND acao = $2', [
    grupo,
    acao,
  ]);
  return Number(r.rows[0]?.n ?? 0);
}

/**
 * Volta o caixa de G ao estado do cenário, como superusuário: configuração original, só o lançamento e o pagamento do
 * cenário, e o vínculo de O sem acesso.
 */
export async function restaurarCaixa(aberto: CenarioGruposAberto): Promise<void> {
  const { db, cenario } = aberto;
  const g = cenario.grupoG;
  await db.query('DELETE FROM pagamentos_mes WHERE grupo_id = $1 AND lancamento_id IS DISTINCT FROM $2', [
    g,
    cenario.idsG.lancamento,
  ]);
  await db.query('DELETE FROM lancamentos WHERE grupo_id = $1 AND id <> $2', [g, cenario.idsG.lancamento]);
  // O lançamento e o pagamento do cenário (Bira, 2026-01) voltam iguais, mesmo se um teste os editou ou apagou.
  await db.query(
    `INSERT INTO lancamentos (id, grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 'entrada', '2026-01-05', 'Mensalidade', 5000, $3, now(), $3, now())
     ON CONFLICT (id) DO UPDATE SET tipo = 'entrada', data = '2026-01-05', descricao = 'Mensalidade', valor_centavos = 5000`,
    [cenario.idsG.lancamento, g, cenario.contaC],
  );
  await db.query(
    `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
     VALUES ($1, $2, '2026-01', $3, $4, now())
     ON CONFLICT (jogador_id, mes) DO NOTHING`,
    [g, cenario.idsG.jogadorHistorico, cenario.idsG.lancamento, cenario.contaC],
  );
  await db.query(
    `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
     VALUES ($1, 5000, 0, '2026-01-01')
     ON CONFLICT (grupo_id) DO UPDATE SET mensalidade_centavos = 5000, saldo_inicial_centavos = 0,
                                          data_saldo_inicial = '2026-01-01'`,
    [g],
  );
  await db.query('UPDATE vinculos_admin SET acessa_financeiro = false WHERE grupo_id = $1 AND conta_id = $2', [
    g,
    cenario.contaO,
  ]);
}
