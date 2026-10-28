import { cadastroCorpo, emailCorpo, TERMOS_VERSAO, tokenCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import * as contas from '../../infraestrutura/db/repositorios/contas.ts';
import * as links from '../../infraestrutura/db/repositorios/links.ts';
import { modeloCadastroDuplicado, modeloConfirmacao } from '../../infraestrutura/email/modelos.ts';
import { gerarToken, sha256 } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { chaveDeEnvio, enviarModelo } from '../enviar-email.ts';
import { emailIndisponivel, linkInvalido } from '../erros.ts';

const MENSAGEM_ENVIADO = 'Enviamos um link de confirmação para o seu e-mail';

/** Cadastro, confirmação do e-mail e novo link de confirmação (ACE-01 a ACE-08, ACE-51, ACE-52). */
export const rotaContaCadastro = new Hono<AppEnv>()
  .post('/api/conta', async (c) => {
    const corpo = await lerCorpo(c, cadastroCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { nome, email, senha } = corpo.dado;

    const link = await gerarToken();
    const cadastro = await contas.cadastrar(c.var.db, {
      email,
      nome,
      senha,
      termosVersao: TERMOS_VERSAO,
      tokenHash: link.hash,
    });
    if (cadastro.enviar) {
      const urlPublica = c.env.URL_PUBLICA;
      // Conta nova recebe o link; e-mail que já tem conta recebe o aviso, e a resposta é a mesma (ACE-04).
      const envio =
        cadastro.situacao === 'nova'
          ? {
              modelo: modeloConfirmacao({ urlPublica, nome, token: link.token }),
              chave: chaveDeEnvio('confirmacao', link.hash),
            }
          : {
              modelo: modeloCadastroDuplicado({ urlPublica }),
              chave: chaveDeEnvio('aviso-cadastro', link.hash),
            };
      // Falhou: 503, e o fim da transação desfaz a conta e o registro do envio, então pedir de novo funciona.
      if (!(await enviarModelo(c, { para: email, ...envio }))) return emailIndisponivel(c);
    }
    return c.json({ mensagem: MENSAGEM_ENVIADO }, 201);
  })
  .post('/api/conta/confirmar', async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return corpo.resposta;

    // ACE-06: confirmar só marca o e-mail como confirmado; não abre sessão e não manda cookie.
    const contaId = await links.confirmar(c.var.db, await sha256(corpo.dado.token));
    if (!contaId) return linkInvalido(c);
    return c.body(null, 204);
  })
  .post('/api/conta/reenviar-confirmacao', async (c) => {
    const corpo = await lerCorpo(c, emailCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { email } = corpo.dado;

    const link = await gerarToken();
    const pedido = await links.pedir(c.var.db, email, 'confirmacao', link.hash);
    if (pedido.enviar && pedido.nome !== null) {
      const modelo = modeloConfirmacao({ urlPublica: c.env.URL_PUBLICA, nome: pedido.nome, token: link.token });
      const chave = chaveDeEnvio('confirmacao', link.hash);
      if (!(await enviarModelo(c, { para: email, modelo, chave }))) return emailIndisponivel(c);
    }
    // A mesma resposta exista a conta ou não, esteja confirmada ou não (ACE-08).
    return c.json({ mensagem: MENSAGEM_ENVIADO });
  });
