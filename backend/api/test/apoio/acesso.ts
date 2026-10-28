import { remetenteMemoria } from '../../src/infraestrutura/email/memoria.ts';
import type { Remetente } from '../../src/infraestrutura/email/remetente.ts';
import { chamar, type RespostaTeste } from './cliente.ts';

/** Remetente que sempre falha, como o Resend fora do ar ou com a cota diária esgotada (ACE-52). */
export const REMETENTE_QUE_FALHA: Remetente = { enviar: () => Promise.resolve('falhou') };

export const SENHA = 'senha-de-teste-1';

export interface Extras {
  cookie?: string;
  ip?: string;
  remetente?: Remetente;
  /** Ambiente do Worker no lugar do padrão do teste (ex.: outro `LIMITE_EMAILS_DIA`, T63). */
  env?: Cloudflare.Env;
}

/** Chamadas JSON às rotas de acesso, com um remetente em memória que guarda os e-mails do teste. */
export function cenarioDeAcesso() {
  const remetente = remetenteMemoria();

  function pedir(metodo: string, caminho: string, corpo?: unknown, extras: Extras = {}): Promise<RespostaTeste> {
    const headers: Record<string, string> = { 'X-Pelada': '1' };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (extras.cookie) headers['Cookie'] = extras.cookie;
    if (extras.ip) headers['CF-Connecting-IP'] = extras.ip;
    const init: RequestInit = { method: metodo, headers };
    if (corpo !== undefined) init.body = JSON.stringify(corpo);
    return chamar(caminho, init, {
      app: { remetente: extras.remetente ?? remetente },
      ...(extras.env ? { env: extras.env } : {}),
    });
  }

  /** Último token de link que o e-mail de `para` recebeu (`#t=` no link). */
  function tokenDoEmail(para: string, assuntoContem?: string): string {
    const m = [...remetente.mensagens]
      .reverse()
      .find((x) => x.para === para && (!assuntoContem || x.assunto.includes(assuntoContem)));
    const token = m ? /#t=([A-Za-z0-9_-]{43})/.exec(m.texto)?.[1] : undefined;
    if (!token) throw new Error(`nenhum link enviado a ${para}`);
    return token;
  }

  /** Cadastra e confirma pelo link do e-mail: devolve a conta pronta para entrar. */
  async function contaConfirmada(nome = 'Pessoa Teste') {
    const email = `acesso-${crypto.randomUUID()}@exemplo.com`;
    const cadastro = await pedir('POST', '/api/conta', { nome, email, senha: SENHA, termos: true });
    if (cadastro.status !== 201) throw new Error(`cadastro falhou: ${cadastro.status}`);
    const confirmar = await pedir('POST', '/api/conta/confirmar', { token: tokenDoEmail(email) });
    if (confirmar.status >= 300) throw new Error(`confirmação falhou: ${confirmar.status}`);
    return { email, nome, senha: SENHA };
  }

  return { remetente, pedir, tokenDoEmail, contaConfirmada };
}

/** O par `__Host-sessao=token` do `Set-Cookie` da resposta, pronto para o cabeçalho `Cookie`. */
export function cookieDaResposta(r: RespostaTeste): string {
  const par = (r.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
  if (!par.startsWith('__Host-sessao=') || par === '__Host-sessao=') throw new Error('a resposta não abriu sessão');
  return par;
}
