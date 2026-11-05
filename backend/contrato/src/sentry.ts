/**
 * Limpeza do evento do Sentry (FUN-24), usada no `beforeSend` do Worker e do front. Nenhum dado
 * pessoal sai para terceiros: tira o corpo e os cookies da requisição, os cabeçalhos `cookie`,
 * `set-cookie` e `authorization`, e troca todo e-mail que aparecer em qualquer texto do evento
 * (mensagem, exceções, breadcrumbs, `extra`, contextos, tags, usuário).
 *
 * Não depende dos tipos do Sentry: recebe e devolve o mesmo formato. É pura: o evento de
 * entrada não é alterado.
 */

export const EMAIL_REMOVIDO = '[email removido]';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)*\.[A-Z]{2,}/gi;

const CABECALHOS_REMOVIDOS = new Set(['cookie', 'set-cookie', 'authorization']);

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
    for (const [chave, valor] of Object.entries(v)) copia[chave.replace(EMAIL, EMAIL_REMOVIDO)] = semEmails(valor);
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
      if (!CABECALHOS_REMOVIDOS.has(nome.toLowerCase())) cabecalhos[nome] = valor;
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
