import { Hono } from 'hono';
import { corpoDoErro, excluirCorpo, trocarSenhaCorpo } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { exigirSessao } from '../middlewares/sessao.ts';
import { contas } from '../../infraestrutura/db/repositorios/contas.ts';
import { transacaoCurta } from '../../infraestrutura/db/transacao-curta.ts';
import { vencerCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { comFabrica, lerCorpo, type OpcoesRotas } from './apoio-acesso.ts';

/**
 * Rotas de minha conta: trocar senha e excluir (T28; ACE-26 a ACE-30, ACE-70), da tabela do
 * design do LJS (`design.md:162-163`). Com sessão; o `LIMITE_ENTRAR` vem do `criarApp` (T19).
 *
 * A senha atual errada grava a falha (5 em 15 min bloqueiam troca e exclusão, ACE-70) e a rota
 * responde 401: por isso as duas rodam em `transacaoCurta`, confirmada mesmo com o erro (o
 * `comBanco` desfaria a falha). Bloqueado: 429 `bloqueado_temporariamente`, a mesma resposta
 * para a senha certa e para a errada (a função nem confere a senha).
 */

export function rotasMinhaConta(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.post('/conta/senha', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, trocarSenhaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const tokenHash = c.var.tokenHash;
    if (!tokenHash) return c.json(corpoDoErro('sessao_expirada'), 401);

    const r = await transacaoCurta(
      c.env.HYPERDRIVE.connectionString,
      (db) => contas.trocarSenha(db, { senhaAtual: corpo.dados.senhaAtual, senhaNova: corpo.dados.senhaNova, tokenHash }),
      { ...comFabrica(opcoes), conta: c.var.contaId ?? null },
    );
    if (r === 'bloqueado') return c.json(corpoDoErro('bloqueado_temporariamente'), 429);
    if (r === 'senha_incorreta') return c.json(corpoDoErro('senha_atual_incorreta'), 401);
    // A sessão atual continua; as outras da conta foram encerradas (ACE-26).
    return c.body(null, 204);
  });

  rotas.post('/conta/excluir', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, excluirCorpo);
    if (!corpo.ok) return corpo.resposta;

    const r = await transacaoCurta(c.env.HYPERDRIVE.connectionString, (db) => contas.excluir(db, corpo.dados.senha), {
      ...comFabrica(opcoes),
      conta: c.var.contaId ?? null,
    });
    switch (r.resultado) {
      case 'ok':
        // Sessões, vínculos e links apagados e a conta anonimizada (ACE-28): o cookie vence.
        vencerCookieSessao(c);
        return c.body(null, 204);
      case 'unico_admin':
        return c.json(corpoDoErro('unico_admin', { grupos: r.grupos }), 409);
      case 'bloqueado':
        return c.json(corpoDoErro('bloqueado_temporariamente'), 429);
      default:
        // Senha errada: nada apagado (ACE-30).
        return c.json(corpoDoErro('senha_atual_incorreta'), 401);
    }
  });

  return rotas;
}
