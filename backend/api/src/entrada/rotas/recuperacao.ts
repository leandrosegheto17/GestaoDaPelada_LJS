import { Hono } from 'hono';
import {
  corpoDoErro,
  emailCorpo,
  erroDeValidacao,
  MENSAGENS,
  novaSenhaCorpo,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comBanco } from '../middlewares/com-banco.ts';
import {
  categoriaDaRecuperacao,
  enviarEmailDeConta,
  limiteEmailsDia,
} from '../../aplicacao/acesso/enviar-email.ts';
import { links } from '../../infraestrutura/db/repositorios/contas.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailRecuperacao } from '../../infraestrutura/email/modelos.ts';
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
 * Rotas de recuperação de senha (T27; ACE-22 a ACE-25, ACE-50, ACE-76), da tabela do design do
 * LJS (`design.md:160-161`).
 */

/** Mensagem da troca pela recuperação, que a tela de `/entrar` mostra (ACE-24). */
export const MENSAGEM_SENHA_ALTERADA = 'Senha alterada. Entre com a nova senha.';

export function rotasRecuperacao(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const banco = comBanco(undefined, comFabrica(opcoes));

  // Mesma mensagem exista ou não a conta (ACE-22); o link anterior perde a validade (ACE-23).
  rotas.post('/sessao/esqueci-senha', contarPedidoDeEmail(opcoes), banco, async (c) => {
    const corpo = await lerCorpo(c, emailCorpo);
    if (!corpo.ok) return corpo.resposta;
    const { email } = corpo.dados;

    const { token, hash } = await gerarToken();
    const r = await links.pedir(c.var.db, email, 'recuperacao', hash);
    if (r.enviar) {
      const conteudo = emailRecuperacao({
        urlPublica: c.env.URL_PUBLICA,
        nome: r.nome ?? email,
        token,
      });
      const envio = await enviarEmailDeConta(c.var.db, remetenteDoAmbiente(c.env), {
        enviar: true,
        // Conta ainda não confirmada gasta a cota de cadastro (ACE-73).
        categoria: categoriaDaRecuperacao(r.confirmada),
        limiteDia: limiteEmailsDia(c.env.LIMITE_EMAILS_DIA),
        mensagem: {
          tipo: 'recuperacao',
          para: email,
          ...conteudo,
          idempotencia: `recuperacao:${hex(hash)}`,
        },
      });
      if (envio === 'indisponivel') return emailIndisponivel(c);
    }
    return c.json({ mensagem: MENSAGENS.esqueci }, 200);
  });

  // Troca a senha, usa o link, encerra as sessões, confirma o e-mail e zera as falhas (ACE-24, ACE-76).
  rotas.post('/sessao/nova-senha', banco, async (c) => {
    let bruto: unknown;
    try {
      bruto = await c.req.json();
    } catch {
      return c.json(corpoDoErro('dados_invalidos'), 422);
    }
    const lido = novaSenhaCorpo.safeParse(bruto);
    if (!lido.success) {
      // Token ausente ou malformado é link inválido (ACE-25); senha fora dos limites é 422 (ACE-03).
      if (lido.error.issues.some((i) => i.path[0] === 'token'))
        return c.json(corpoDoErro('link_invalido'), 410);
      return c.json(erroDeValidacao(lido.error), 422);
    }
    const ok = await links.novaSenha(c.var.db, await hashToken(lido.data.token), lido.data.senha);
    if (!ok) return c.json(corpoDoErro('link_invalido'), 410);
    return c.json({ mensagem: MENSAGEM_SENHA_ALTERADA }, 200);
  });

  return rotas;
}
