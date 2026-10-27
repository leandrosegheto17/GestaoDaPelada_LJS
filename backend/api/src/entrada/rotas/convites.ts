import { conviteCadastroCorpo, TERMOS_VERSAO, tokenCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import * as convites from '../../infraestrutura/db/repositorios/convites.ts';
import { definirCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { gerarToken, sha256 } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, erroComStatus, linkInvalido } from '../erros.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

/** Convites de admin vistos por quem recebe: ler, aceitar e cadastrar pelo convite (ACE-33 a ACE-36, ACE-67). */
export const rotaConvites = new Hono<AppEnv>()
  .post('/api/convites/ler', async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return corpo.resposta;

    const convite = await convites.ler(c.var.db, await sha256(corpo.dado.token));
    if (!convite) return linkInvalido(c);
    return c.json(convite);
  })
  .post('/api/convites/aceitar', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return corpo.resposta;

    const aceite = await convites.aceitar(c.var.db, await sha256(corpo.dado.token));
    if (aceite.resultado === 'convite_de_outro_email') {
      return erroComStatus(
        c,
        403,
        CODIGOS_ERRO.conviteDeOutroEmail,
        'Este convite foi enviado a outro e-mail. Entre com a conta que o recebeu.',
      );
    }
    if (aceite.resultado === 'link_invalido') return linkInvalido(c);
    return c.json({ grupoId: aceite.grupoId });
  })
  .post('/api/convites/cadastrar', async (c) => {
    const corpo = await lerCorpo(c, conviteCadastroCorpo);
    if (!corpo.ok) return corpo.resposta;

    const sessao = await gerarToken();
    const cadastro = await convites.cadastrar(c.var.db, {
      tokenHash: await sha256(corpo.dado.token),
      nome: corpo.dado.nome,
      senha: corpo.dado.senha,
      termosVersao: TERMOS_VERSAO,
      tokenSessaoHash: sessao.hash,
    });
    if (cadastro.resultado === 'link_invalido') return linkInvalido(c);
    if (cadastro.resultado === 'conta_existente') {
      return erroComStatus(
        c,
        409,
        CODIGOS_ERRO.contaExistente,
        'Este e-mail já tem conta. Entre para aceitar o convite.',
      );
    }
    definirCookieSessao(c, sessao.token);
    return c.json({ grupoId: cadastro.grupoId }, 201);
  });
