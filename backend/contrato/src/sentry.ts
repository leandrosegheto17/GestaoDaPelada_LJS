/**
 * Limpeza do evento do Sentry (FUN-24), usada no `beforeSend` do Worker e do front. Nenhum dado
 * pessoal sai para terceiros: tira o corpo e os cookies da requisição, todos os cabeçalhos fora de uma lista de
 * permissão (cookie, authorization, tokens), e troca todo e-mail que aparecer em qualquer texto do evento
 * (mensagem, exceções, breadcrumbs, `extra`, contextos, tags, usuário).
 *
 * Não depende dos tipos do Sentry: recebe e devolve o mesmo formato. É pura: o evento de
 * entrada não é alterado.
 */

export const EMAIL_REMOVIDO = '[email removido]';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

/**
 * Lista de permissão (A-07): só estes cabeçalhos seguem no evento. Segredo que chega em cabeçalho (como o
 * `asaas-access-token` do webhook) nunca sai, mesmo sem ninguém ter pensado nele.
 */
const CABECALHOS_PERMITIDOS = new Set([
  'accept',
  'accept-encoding',
  'accept-language',
  'content-length',
  'content-type',
  'host',
  'origin',
  'referer',
  'user-agent',
  'x-pelada',
]);

type Objeto = Record<string, unknown>;

function objeto(v: unknown): v is Objeto {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Cópia profunda, com todo e-mail de todo texto trocado. */
function semEmails(v: unknown): unknown {
  if (typeof v === 'string') return v.replace(EMAIL, EMAIL_REMOVIDO);
  if (Array.isArray(v)) return v.map(semEmails);
  if (objeto(v)) {
    const copia: Objeto = {};
    for (const [chave, valor] of Object.entries(v))
      copia[chave.replace(EMAIL, EMAIL_REMOVIDO)] = semEmails(valor);
    return copia;
  }
  return v;
}

function limparRequisicao(requisicao: Objeto): Objeto {
  const resto: Objeto = { ...requisicao };
  delete resto.data;
  delete resto.cookies;
  if (objeto(resto.headers)) {
    const cabecalhos: Objeto = {};
    for (const [nome, valor] of Object.entries(resto.headers)) {
      if (CABECALHOS_PERMITIDOS.has(nome.toLowerCase())) cabecalhos[nome] = valor;
    }
    resto.headers = cabecalhos;
  }
  return resto;
}

export function limparEvento<T extends object>(evento: T): T {
  const copia = semEmails(evento) as Objeto;
  if (objeto(copia.request)) copia.request = limparRequisicao(copia.request);
  return copia as T;
}
