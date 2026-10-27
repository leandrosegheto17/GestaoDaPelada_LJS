import { excluirCorpo, trocarSenhaCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import * as contas from '../../infraestrutura/db/repositorios/contas.ts';
import { limparCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, corpoErro, erroComStatus, sessaoExpirada } from '../erros.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

const senhaAtualIncorreta = (c: Parameters<typeof erroComStatus>[0]) =>
  erroComStatus(c, 401, CODIGOS_ERRO.senhaAtualIncorreta, 'A senha atual está incorreta.');

/** Minha conta: trocar a senha e excluir a conta (ACE-26 a ACE-30, ACE-69). */
export const rotaContaMinha = new Hono<AppEnv>()
  .post('/api/conta/senha', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, trocarSenhaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const tokenSessaoHash = c.get('tokenHash');
    if (!tokenSessaoHash) return sessaoExpirada(c);

    const trocou = await contas.trocarSenha(c.var.db, {
      senhaAtual: corpo.dado.senhaAtual,
      senhaNova: corpo.dado.novaSenha,
      tokenSessaoHash,
    });
    if (!trocou) return senhaAtualIncorreta(c);
    return c.body(null, 204);
  })
  .post('/api/conta/excluir', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, excluirCorpo);
    if (!corpo.ok) return corpo.resposta;

    const resultado = await contas.excluir(c.var.db, corpo.dado.senha);
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
