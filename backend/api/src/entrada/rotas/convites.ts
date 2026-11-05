import { Hono } from 'hono';
import {
  conviteCadastroCorpo,
  corpoDoErro,
  erroDeValidacao,
  TERMOS_VERSAO,
  tokenCorpo,
  type ConviteLido,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comBanco } from '../middlewares/com-banco.ts';
import { exigirSessao } from '../middlewares/sessao.ts';
import { convites } from '../../infraestrutura/db/repositorios/convites.ts';
import { definirCookieSessao } from '../../infraestrutura/sessao/cookie.ts';
import { gerarToken, hashToken } from '../../infraestrutura/sessao/token.ts';
import { comFabrica, lerCorpo, type OpcoesRotas } from './apoio-acesso.ts';

/**
 * Rotas de convite: ler, aceitar e cadastrar (T29; ACE-33 a ACE-36, ACE-50, ACE-67), da tabela
 * do design do LJS (`design.md:164-166`). Ler e cadastrar sem sessão (com `LIMITE_ENTRAR`, T19);
 * aceitar com sessão.
 *
 * Casos limite e estados, listados antes do código:
 * - token ausente ou malformado: 410 `link_invalido`, como o convite inexistente (ACE-36);
 * - convite vencido, usado, cancelado ou de grupo arquivado: as funções devolvem inválido → 410;
 * - logado com outro e-mail que não o do convite: 403 `convite_de_outro_email` (ACE-35);
 * - aceites simultâneos do mesmo convite: a função trava o convite; um vínculo, o segundo 410
 *   (ACE-67);
 * - sem conta ao ler, mas o e-mail ganha conta antes do cadastrar: a função devolve
 *   `conta_existente` e nada muda.
 *   [LACUNA] a spec não define a resposta; o rascunho responde 409 `dados_invalidos` com o
 *   texto "Já existe uma conta com este e-mail. Entre para aceitar o convite." (o contrato não
 *   tem código próprio para isso);
 * - cadastrar abre a sessão nova (a função grava a sessão de 12 h com o hash do token) e envia
 *   o cookie; termos e campos fora dos limites dão 422 antes de qualquer consulta.
 */

export const MENSAGEM_CONTA_EXISTENTE =
  'Já existe uma conta com este e-mail. Entre para aceitar o convite.';

export function rotasConvites(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const banco = comBanco(undefined, comFabrica(opcoes));
  const invalido = corpoDoErro('link_invalido');

  rotas.post('/convites/ler', banco, async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return c.json(invalido, 410);
    const lido = await convites.ler(c.var.db, await hashToken(corpo.dados.token));
    if (!lido) return c.json(invalido, 410);
    const resposta: ConviteLido = {
      email: lido.email,
      grupoNome: lido.grupoNome,
      contaExiste: lido.contaExiste,
    };
    return c.json(resposta, 200);
  });

  rotas.post('/convites/aceitar', exigirSessao, banco, async (c) => {
    const corpo = await lerCorpo(c, tokenCorpo);
    if (!corpo.ok) return c.json(invalido, 410);
    const r = await convites.aceitar(c.var.db, await hashToken(corpo.dados.token));
    if (r.resultado === 'ok') return c.json({ grupoId: r.grupoId }, 200);
    if (r.resultado === 'convite_de_outro_email')
      return c.json(corpoDoErro('convite_de_outro_email'), 403);
    return c.json(invalido, 410);
  });

  rotas.post('/convites/cadastrar', banco, async (c) => {
    let bruto: unknown;
    try {
      bruto = await c.req.json();
    } catch {
      return c.json(corpoDoErro('dados_invalidos'), 422);
    }
    const lido = conviteCadastroCorpo.safeParse(bruto);
    if (!lido.success) {
      if (lido.error.issues.some((i) => i.path[0] === 'token')) return c.json(invalido, 410);
      return c.json(erroDeValidacao(lido.error), 422);
    }
    const { token: tokenConvite, nome, senha } = lido.data;
    const sessao = await gerarToken();
    const r = await convites.cadastrar(c.var.db, {
      tokenHash: await hashToken(tokenConvite),
      nome,
      senha,
      termosVersao: TERMOS_VERSAO,
      tokenSessaoHash: sessao.hash,
    });
    if (r.resultado === 'ok') {
      definirCookieSessao(c, sessao.token);
      return c.json({ grupoId: r.grupoId }, 201);
    }
    if (r.resultado === 'conta_existente') {
      return c.json({ erro: MENSAGEM_CONTA_EXISTENTE, codigo: 'dados_invalidos' as const }, 409);
    }
    return c.json(invalido, 410);
  });

  return rotas;
}
