import { Hono } from 'hono';
import {
  cadastroCorpo,
  corpoDoErro,
  emailCorpo,
  MENSAGENS,
  TERMOS_VERSAO,
  tokenCorpo,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comBanco } from '../middlewares/com-banco.ts';
import { enviarEmailDeConta, limiteEmailsDia } from '../../aplicacao/acesso/enviar-email.ts';
import { contas, links } from '../../infraestrutura/db/repositorios/contas.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailAvisoCadastro, emailConfirmacao } from '../../infraestrutura/email/modelos.ts';
import { gerarToken, hashToken } from '../../infraestrutura/sessao/token.ts';
import {
  comFabrica,
  contarPedidoDeEmail,
  emailIndisponivel,
  hex,
  lerCorpo,
  type OpcoesRotas,
} from './apoio-acesso.ts';

/**
 * Rotas de cadastro e confirmação (T25; ACE-01 a ACE-08, ACE-50, ACE-58, ACE-68), da tabela do
 * design do LJS (`design.md:152-157`). O `LIMITE_ENTRAR` vem do `criarApp` (T19).
 */

/** Mensagem da confirmação, que a tela de `/entrar` mostra (ACE-06). */
export const MENSAGEM_CONFIRMADO = 'E-mail confirmado. Entre com a sua senha.';

export function rotasConta(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const banco = comBanco(undefined, comFabrica(opcoes));

  // Cadastro: e-mail existente recebe a mesma resposta e o dono recebe o aviso (ACE-04).
  rotas.post('/conta', contarPedidoDeEmail(opcoes), banco, async (c) => {
    const corpo = await lerCorpo(c, cadastroCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { nome, email, senha } = corpo.dados;

    const { token, hash } = await gerarToken();
    const r = await contas.cadastrar(c.var.db, {
      email,
      nome,
      senha,
      termosVersao: TERMOS_VERSAO,
      tokenHash: hash,
    });
    // [LACUNA] o aviso de cadastro duplicado não tem o nome do dono (a função não o devolve, e o
    // nome do corpo é de quem tentou); o rascunho saúda pelo próprio endereço.
    const nova = r.situacao === 'nova';
    const conteudo = nova
      ? emailConfirmacao({ urlPublica: c.env.URL_PUBLICA, nome, token })
      : emailAvisoCadastro({ urlPublica: c.env.URL_PUBLICA, nome: email });
    const tipo = nova ? 'confirmacao' : 'aviso_cadastro';
    const envio = await enviarEmailDeConta(c.var.db, remetenteDoAmbiente(c.env), {
      enviar: r.enviar,
      categoria: 'cadastro',
      limiteDia: limiteEmailsDia(c.env.LIMITE_EMAILS_DIA),
      mensagem: { tipo, para: email, ...conteudo, idempotencia: `${tipo}:${hex(hash)}` },
    });
    if (envio === 'indisponivel') return emailIndisponivel(c);
    return c.json({ mensagem: MENSAGENS.cadastro }, 201);
  });

  // Confirmação: sem sessão nova (ACE-06); link vencido, usado, inexistente ou malformado: 410 (ACE-07).
  rotas.post('/conta/confirmar', banco, async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return c.json(corpoDoErro('link_invalido'), 410);
    const conta = await links.confirmar(c.var.db, await hashToken(corpo.dados.token));
    if (!conta) return c.json(corpoDoErro('link_invalido'), 410);
    return c.json({ mensagem: MENSAGEM_CONFIRMADO }, 200);
  });

  // Reenvio: invalida o link anterior e envia outro; mesma resposta exista ou não a conta (ACE-08).
  rotas.post('/conta/reenviar-confirmacao', contarPedidoDeEmail(opcoes), banco, async (c) => {
    const corpo = await lerCorpo(c, emailCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { email } = corpo.dados;

    const { token, hash } = await gerarToken();
    const r = await links.pedir(c.var.db, email, 'confirmacao', hash);
    if (r.enviar) {
      const conteudo = emailConfirmacao({
        urlPublica: c.env.URL_PUBLICA,
        nome: r.nome ?? email,
        token,
      });
      const envio = await enviarEmailDeConta(c.var.db, remetenteDoAmbiente(c.env), {
        enviar: true,
        categoria: 'cadastro',
        limiteDia: limiteEmailsDia(c.env.LIMITE_EMAILS_DIA),
        mensagem: {
          tipo: 'confirmacao',
          para: email,
          ...conteudo,
          idempotencia: `confirmacao:${hex(hash)}`,
        },
      });
      if (envio === 'indisponivel') return emailIndisponivel(c);
    }
    return c.json({ mensagem: MENSAGENS.reenvio }, 200);
  });

  return rotas;
}
