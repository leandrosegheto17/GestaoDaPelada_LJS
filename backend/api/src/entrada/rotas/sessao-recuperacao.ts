import { emailCorpo, novaSenhaCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import * as links from '../../infraestrutura/db/repositorios/links.ts';
import { modeloRecuperacao } from '../../infraestrutura/email/modelos.ts';
import { gerarToken, sha256 } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { chaveDeEnvio, enviarModelo } from '../enviar-email.ts';
import { emailIndisponivel, linkInvalido } from '../erros.ts';

const MENSAGEM_PEDIDO = 'Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha';

/** Recuperação de senha por e-mail (ACE-22 a ACE-25, ACE-51, ACE-52). */
export const rotaSessaoRecuperacao = new Hono<AppEnv>()
  .post('/api/sessao/esqueci-senha', async (c) => {
    const corpo = await lerCorpo(c, emailCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { email } = corpo.dado;

    const link = await gerarToken();
    const pedido = await links.pedir(c.var.db, email, 'recuperacao', link.hash);
    if (pedido.enviar && pedido.nome !== null) {
      const modelo = modeloRecuperacao({ urlPublica: c.env.URL_PUBLICA, nome: pedido.nome, token: link.token });
      const chave = chaveDeEnvio('recuperacao', link.hash);
      if (!(await enviarModelo(c, { para: email, modelo, chave }))) return emailIndisponivel(c);
    }
    // A mesma resposta exista a conta ou não (ACE-22).
    return c.json({ mensagem: MENSAGEM_PEDIDO });
  })
  .post('/api/sessao/nova-senha', async (c) => {
    const corpo = await lerCorpo(c, novaSenhaCorpo);
    if (!corpo.ok) return corpo.resposta;

    const trocou = await links.novaSenha(c.var.db, await sha256(corpo.dado.token), corpo.dado.senha);
    if (!trocou) return linkInvalido(c);
    return c.json({ mensagem: 'Senha alterada. Entre com a nova senha.' });
  });
