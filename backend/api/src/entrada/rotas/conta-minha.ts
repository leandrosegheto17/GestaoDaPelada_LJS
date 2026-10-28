import { excluirCorpo, trocarSenhaCorpo } from '@pelada/contrato';
import { Hono, type Context } from 'hono';
import { emTransacaoPropria, type Db } from '../../infraestrutura/db/index.ts';
import * as contas from '../../infraestrutura/db/repositorios/contas.ts';
import { limparCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, corpoErro, erroComStatus, sessaoExpirada } from '../erros.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

const senhaAtualIncorreta = (c: Parameters<typeof erroComStatus>[0]) =>
  erroComStatus(c, 401, CODIGOS_ERRO.senhaAtualIncorreta, 'A senha atual está incorreta.');

/** O mesmo erro do bloqueio do login (ACE-13), agora por conta (ACE-70). */
const bloqueado = (c: Parameters<typeof erroComStatus>[0]) =>
  erroComStatus(c, 429, CODIGOS_ERRO.bloqueadoTemporariamente, 'Muitas tentativas. Tente de novo em 15 minutos.');

/**
 * Transação própria com a conta da sessão: a falha da senha atual precisa ficar gravada mesmo com a resposta 401 (a
 * transação da requisição desfaz respostas de erro), senão o bloqueio por conta nunca chegaria (ACE-70).
 */
const comContaDaSessao = <T>(c: Context<AppEnv>, acao: (db: Db) => Promise<T>) =>
  emTransacaoPropria(c.env.HYPERDRIVE.connectionString, { contaId: c.get('contaId') }, acao);

/** Minha conta: trocar a senha e excluir a conta (ACE-26 a ACE-30, ACE-69, ACE-70). */
export const rotaContaMinha = new Hono<AppEnv>()
  .post('/api/conta/senha', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, trocarSenhaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const tokenSessaoHash = c.get('tokenHash');
    if (!tokenSessaoHash) return sessaoExpirada(c);

    const trocou = await comContaDaSessao(c, (db) =>
      contas.trocarSenha(db, {
        senhaAtual: corpo.dado.senhaAtual,
        senhaNova: corpo.dado.novaSenha,
        tokenSessaoHash,
      }),
    );
    if (trocou === 'bloqueado') return bloqueado(c);
    if (!trocou) return senhaAtualIncorreta(c);
    return c.body(null, 204);
  })
  .post('/api/conta/excluir', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, excluirCorpo);
    if (!corpo.ok) return corpo.resposta;

    const resultado = await comContaDaSessao(c, (db) => contas.excluir(db, corpo.dado.senha));
    if (resultado.resultado === 'bloqueado') return bloqueado(c);
    if (resultado.resultado === 'senha_incorreta') return senhaAtualIncorreta(c);
    if (resultado.resultado === 'unico_admin') {
      const base = corpoErro(
        CODIGOS_ERRO.unicoAdmin,
        'Você é a única pessoa admin de grupos. Passe a administração antes de excluir a conta.',
      );
      return c.json({ erro: { ...base.erro, grupos: resultado.grupos } }, 409);
    }
    limparCookieSessao(c);
    return c.body(null, 204);
  });
