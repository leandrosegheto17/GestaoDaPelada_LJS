import type { TipoAvisoCobrancaFila } from '@pelada/contrato/fila-avisos';
import { formatarPreco } from '@pelada/dominio';
import { escaparHtml, montarLink, nomeDoGrupoNoEmail, type Conteudo } from './modelos.ts';

/**
 * E-mail de aviso de cobrança à criadora do grupo (notificacoes T23; NOT-40), em texto e HTML, no molde dos e-mails de
 * conta (`modelos.ts`). Leva o nome do grupo, o tipo do evento em texto claro, o valor em reais formatado de centavos
 * inteiros, o vencimento em dd/mm/aaaa e um único link: Meu plano, `URL_PUBLICA` + `/app/grupos/<id>/plano` (S-05,
 * AD-063). Nenhum link de pagamento nem domínio do Asaas.
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - 1 centavo, 990 e 100000: "R$ 0,01", "R$ 9,90" e "R$ 1.000,00" (`formatarPreco` do domínio, PLA-06);
 * - vencimento no dia 31 e em 1.º de janeiro: a data do Asaas (`dueDate`, `AAAA-MM-DD`) já é uma data do calendário,
 *   sem hora; vira dd/mm/aaaa sem passar por `Date`, então nenhum fuso a desloca para o dia anterior;
 * - nome do grupo com `<script>` e `&`: escapado no HTML; no texto e no assunto, numa linha só e sem virar link
 *   (`nomeDoGrupoNoEmail`, SEC-006 da grupos-e-elenco);
 * - vencimento que não é data `AAAA-MM-DD` ou valor que não é centavo inteiro: lança (a mensagem da fila já foi
 *   conferida, T16; isto é defesa);
 * - sem `URL_PUBLICA`: lança, como os e-mails de conta (nunca monta link relativo).
 *
 * [LACUNA] O título do tipo atrasado: a T23 diz "Pagamento em atraso" e o push (T5, `NOME_DO_TIPO`) diz "Pagamento
 * atrasado". A spec só pede "o tipo do evento em texto claro"; aqui segue a T23. O /executar confirma se unifica.
 */

export const TITULO_DO_AVISO: Readonly<Record<TipoAvisoCobrancaFila, string>> = Object.freeze({
  cobranca_gerada: 'Cobrança gerada',
  pagamento_confirmado: 'Pagamento confirmado',
  pagamento_atrasado: 'Pagamento em atraso',
});

/** O que cada tipo diz à criadora, depois do título. */
const FRASE_DO_AVISO: Readonly<Record<TipoAvisoCobrancaFila, string>> = Object.freeze({
  cobranca_gerada: 'Foi gerada a cobrança do plano Pro do grupo',
  pagamento_confirmado: 'O pagamento do plano Pro foi confirmado para o grupo',
  pagamento_atrasado: 'O pagamento do plano Pro está em atraso no grupo',
});

/** Caminho de Meu plano (S-05, AD-063). */
export function caminhoMeuPlano(grupoId: string): string {
  return `/app/grupos/${encodeURIComponent(grupoId)}/plano`;
}

/** `AAAA-MM-DD` → `dd/mm/aaaa`, sem fuso. */
export function dataBrasileira(data: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!partes) throw new RangeError('Vencimento inválido.');
  return `${partes[3]}/${partes[2]}/${partes[1]}`;
}

export interface DadosEmailCobranca {
  urlPublica: string;
  tipo: TipoAvisoCobrancaFila;
  grupoId: string;
  grupoNome: string;
  valorCentavos: number;
  /** `AAAA-MM-DD`. */
  vencimento: string;
}

export function emailCobranca(d: DadosEmailCobranca): Conteudo {
  const link = montarLink(d.urlPublica, caminhoMeuPlano(d.grupoId));
  const grupo = nomeDoGrupoNoEmail(d.grupoNome);
  const titulo = TITULO_DO_AVISO[d.tipo];
  const valor = formatarPreco(d.valorCentavos);
  const vencimento = dataBrasileira(d.vencimento);
  const frase = FRASE_DO_AVISO[d.tipo];

  const texto = [
    `${titulo}: ${grupo}`,
    '',
    `${frase} ${grupo}.`,
    `Valor: ${valor}`,
    `Vencimento: ${vencimento}`,
    '',
    `Veja em Meu plano: ${link}`,
  ].join('\n');

  const html = [
    '<!doctype html>',
    '<html lang="pt-BR"><body>',
    `<h1>${escaparHtml(titulo)}</h1>`,
    `<p>${escaparHtml(frase)} <strong>${escaparHtml(grupo)}</strong>.</p>`,
    `<p>Valor: ${escaparHtml(valor)}<br>Vencimento: ${escaparHtml(vencimento)}</p>`,
    `<p><a href="${escaparHtml(link)}">Ver Meu plano</a></p>`,
    '</body></html>',
  ].join('\n');

  return { assunto: `${titulo}: ${grupo}`, texto, html };
}
