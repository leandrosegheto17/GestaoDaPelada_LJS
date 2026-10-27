import { entrarCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import { emTransacaoPropria } from '../../infraestrutura/db/index.ts';
import * as contas from '../../infraestrutura/db/repositorios/contas.ts';
import * as sessoes from '../../infraestrutura/db/repositorios/sessoes.ts';
import { definirCookieSessao, limparCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { gerarToken, hashIp } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, erroComStatus, sessaoExpirada } from '../erros.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

/** Sem `CF-Connecting-IP` (fora da Cloudflare), todos dividem a mesma chave: falha fechada, como no limitador. */
const IP_DESCONHECIDO = 'sem-ip';

/** Entrar, consultar a sessão e sair (ACE-09 a ACE-14, ACE-17, ACE-18). */
export const rotaSessao = new Hono<AppEnv>()
  .post('/api/sessao/entrar', async (c) => {
    const corpo = await lerCorpo(c, entrarCorpo);
    if (!corpo.ok) return corpo.resposta;

    const sessao = await gerarToken();
    const ipHash = await hashIp(c.req.header('CF-Connecting-IP') ?? IP_DESCONHECIDO);
    // Transação própria: a falha de login precisa ficar gravada mesmo com a resposta 401 (a da requisição desfaz).
    const resultado = await emTransacaoPropria(c.env.HYPERDRIVE.connectionString, {}, (db) =>
      contas.entrar(db, { email: corpo.dado.email, senha: corpo.dado.senha, ipHash, tokenHash: sessao.hash }),
    );

    switch (resultado.resultado) {
      case 'bloqueado':
        return erroComStatus(
          c,
          429,
          CODIGOS_ERRO.bloqueadoTemporariamente,
          'Muitas tentativas. Tente de novo em 15 minutos.',
        );
      case 'nao_confirmado':
        return erroComStatus(c, 403, CODIGOS_ERRO.emailNaoConfirmado, 'Confirme seu e-mail para entrar.');
      case 'invalida':
        return erroComStatus(c, 401, CODIGOS_ERRO.credenciaisInvalidas, 'E-mail ou senha incorretos.');
      case 'ok':
        definirCookieSessao(c, sessao.token);
        return c.json({ nome: resultado.nome, email: corpo.dado.email });
    }
  })
  .get('/api/sessao', exigirSessao, async (c) => {
    const eu = await contas.eu(c.var.db);
    // A conta da sessão sumiu (excluída entre a busca da sessão e a consulta): igual a sessão vencida.
    if (!eu) return sessaoExpirada(c);
    return c.json(eu);
  })
  .post('/api/sessao/sair', exigirSessao, async (c) => {
    const tokenHash = c.get('tokenHash');
    if (tokenHash) await sessoes.encerrarAtual(c.var.db, tokenHash);
    limparCookieSessao(c);
    return c.body(null, 204);
  });
