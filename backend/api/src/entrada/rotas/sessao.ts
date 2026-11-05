import { Hono } from 'hono';
import { corpoDoErro, entrarCorpo, type SessaoEu } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comBanco } from '../middlewares/com-banco.ts';
import { exigirSessao } from '../middlewares/sessao.ts';
import { contas } from '../../infraestrutura/db/repositorios/contas.ts';
import { encerrarAtual } from '../../infraestrutura/db/repositorios/sessoes.ts';
import { transacaoCurta } from '../../infraestrutura/db/transacao-curta.ts';
import { definirCookieSessao, vencerCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { gerarToken, hashIp } from '../../infraestrutura/sessao/token.ts';
import { comFabrica, ipDa, lerCorpo, type OpcoesRotas } from './apoio-acesso.ts';

/**
 * Rotas de sessão: entrar, consultar e sair (T26; ACE-09 a ACE-14, ACE-17, ACE-18, ACE-50,
 * ACE-74), da tabela do design do LJS (`design.md:157-159`).
 *
 * Casos limite e estados, listados antes do código:
 * - senha certa com o par (e-mail, IP) bloqueado ou com a conta no teto de 50 falhas: 429
 *   `bloqueado_temporariamente`, sem sessão; o texto é o mesmo nos dois bloqueios (ACE-74) e
 *   também para e-mail sem conta (a função decide, sem revelar se a conta existe);
 * - IP sem cabeçalho: a chave vira `sem-ip` (T13) e o par é (e-mail, `sem-ip`);
 * - a falha de login tem de ficar gravada numa resposta 401: o entrar roda em `transacaoCurta`,
 *   confirmada mesmo com o erro (o `comBanco` desfaria a falha, e o bloqueio nunca chegaria);
 * - e-mail inexistente e senha errada: o mesmo 401 `credenciais_invalidas`, mesmo corpo (ACE-11);
 * - senha certa de conta não confirmada: 403 `email_nao_confirmado`, sem cookie (ACE-12);
 * - sair sem sessão: 204 e o cookie vencido do mesmo jeito.
 *   [LACUNA] a spec só define o sair com sessão; o rascunho responde igual sem ela (sair é
 *   idempotente e não revela nada), em vez de 401.
 */

/** Texto único dos dois bloqueios de login (ACE-13, ACE-74), pedido na T26. */
export const MENSAGEM_BLOQUEIO = 'Muitas tentativas. Tente de novo em 15 minutos.';

export function rotasSessao(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const banco = comBanco(undefined, comFabrica(opcoes));

  rotas.post('/sessao/entrar', async (c) => {
    const corpo = await lerCorpo(c, entrarCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { email, senha } = corpo.dados;

    const { token, hash } = await gerarToken();
    const ipHash = await hashIp(ipDa(c), 64);
    const r = await transacaoCurta(
      c.env.HYPERDRIVE.connectionString,
      (db) => contas.entrar(db, { email, senha, ipHash, tokenHash: hash }),
      comFabrica(opcoes),
    );
    switch (r.resultado) {
      case 'ok':
        definirCookieSessao(c, token);
        return c.json({ nome: r.nome, email }, 200);
      case 'nao_confirmado':
        return c.json(corpoDoErro('email_nao_confirmado'), 403);
      case 'bloqueado':
        // SPEC_DEVIATION: o contrato tem "Tente de novo em alguns minutos."; a T26 pede este texto único.
        return c.json({ ...corpoDoErro('bloqueado_temporariamente'), erro: MENSAGEM_BLOQUEIO }, 429);
      default:
        return c.json(corpoDoErro('credenciais_invalidas'), 401);
    }
  });

  rotas.get('/sessao', exigirSessao, banco, async (c) => {
    const eu = await contas.eu(c.var.db);
    if (!eu) return c.json(corpoDoErro('sessao_expirada'), 401);
    const resposta: SessaoEu = {
      id: eu.id,
      nome: eu.nome,
      email: eu.email,
      grupos: eu.grupos.map((g) => ({ id: g.id, nome: g.nome, slug: g.slug, acessaFinanceiro: g.acessa_financeiro })),
    };
    return c.json(resposta, 200);
  });

  rotas.post('/sessao/sair', banco, async (c) => {
    const tokenHash = c.var.tokenHash;
    if (tokenHash) await encerrarAtual(c.var.db, tokenHash);
    vencerCookieSessao(c);
    return c.body(null, 204);
  });

  return rotas;
}
