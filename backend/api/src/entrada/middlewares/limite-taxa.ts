import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { Ambiente, NomeLimite } from '../ambiente.ts';
import { chaveIp, SEM_IP } from '../../infraestrutura/sessao/token.ts';

/** Chave usada quando a requisição não traz `cf-connecting-ip` (só fora da Cloudflare). */
export const CHAVE_SEM_IP = SEM_IP;

/** Espera sugerida no 429, igual ao período dos bindings (60 s, wrangler.jsonc). */
export const ESPERA_SEGUNDOS = 60;

export const MENSAGEM_LIMITE = 'Muitas requisições. Tente de novo em instantes.';

/**
 * Limite de taxa por IP (FUN-26), com o binding do wrangler.jsonc. Negado: 429 com
 * `Retry-After` e um corpo sem detalhe interno, sem chamar o handler.
 *
 * A chave é a do IP pela `chaveIp(ip, 64)` (T19; ACE-71): IPv4 inteiro, IPv6 pelo /64 (quem
 * tem um /64 troca de endereço à vontade dentro dele), e `sem-ip` sem o cabeçalho.
 *
 * `chaveDe` troca a chave (grupos-e-elenco T23; SEC-003: `conta:<id>` nas escritas de grupo).
 * Quando devolve `undefined`, o limitador não se aplica à requisição e ela segue sem gastar cota.
 */
export function limiteTaxa(
  binding: NomeLimite,
  chaveDe: (c: Context<Ambiente>) => string | undefined = (c) =>
    chaveIp(c.req.header('cf-connecting-ip'), 64),
): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    const chave = chaveDe(c);
    if (chave === undefined) {
      await next();
      return;
    }
    const { success } = await c.env[binding].limit({ key: chave });
    if (!success) {
      return c.json({ erro: MENSAGEM_LIMITE }, 429, { 'Retry-After': String(ESPERA_SEGUNDOS) });
    }
    await next();
  };
}

/**
 * Rotas de acesso com `LIMITE_ENTRAR` (T19; ACE-50, ACE-70): as sem sessão da tabela do design
 * do LJS (`design.md:152-170`) e, pelo ACE-70, trocar senha e excluir conta. Todas são POST.
 * Caminhos relativos a /api.
 */
export const ROTAS_LIMITE_ENTRAR = [
  '/conta',
  '/conta/confirmar',
  '/conta/reenviar-confirmacao',
  '/sessao/entrar',
  '/sessao/esqueci-senha',
  '/sessao/nova-senha',
  '/convites/ler',
  '/convites/cadastrar',
  '/conta/senha',
  '/conta/excluir',
] as const;

/**
 * Registra o `LIMITE_ENTRAR` nas rotas de acesso, antes das rotas e da leitura da sessão: acima
 * do limite, 429 sem nenhuma consulta ao banco (ACE-70). Chamar em `criarApp` depois do
 * `exigirCabecalhoPelada` (ACE-49).
 */
export function limitarRotasDeAcesso(api: Hono<Ambiente>): void {
  const limite = limiteTaxa('LIMITE_ENTRAR');
  for (const rota of ROTAS_LIMITE_ENTRAR) api.on('POST', rota, limite);
}
