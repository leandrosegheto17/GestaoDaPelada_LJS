import { Hono } from 'hono';
import { sql } from 'kysely';
import {
  acessoFinanceiroCorpo,
  conviteCorpo,
  corpoDoErro,
  MENSAGENS_ERRO_FINANCEIRO,
  type AdminsResposta,
  type ConviteCriado,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { corpoSemPermissaoFinanceiro } from '../middlewares/financeiro.ts';
import { enviarEmailDeConta, limiteEmailsDia } from '../../aplicacao/acesso/enviar-email.ts';
import {
  admins,
  convites,
  type ListaAdmins,
} from '../../infraestrutura/db/repositorios/convites.ts';
import { acessoFinanceiro } from '../../infraestrutura/db/repositorios/financeiro/acesso.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailConvite } from '../../infraestrutura/email/modelos.ts';
import { gerarToken } from '../../infraestrutura/sessao/token.ts';
import {
  contarPedidoDeEmail,
  emailIndisponivel,
  hex,
  lerCorpo,
  type OpcoesRotas,
} from './apoio-acesso.ts';
import { UUID } from '../uuid.ts';

/**
 * Rotas de admins do grupo (T30; ACE-31, ACE-32, ACE-37 a ACE-42), da tabela do design do LJS
 * (`design.md:167-170`). A sessão (401), a transação com a conta e o vínculo (404) vêm da cadeia
 * de `/api/grupos/:grupoId/*` montada no `criarApp` (T21); aqui só os handlers.
 */

/** A lista de admins e convites no formato do contrato (o GET e o PATCH do financeiro, FIN-35). */
function adminsResposta(lista: ListaAdmins): AdminsResposta {
  return {
    admins: lista.admins.map((a) => ({
      id: a.id,
      nome: a.nome,
      email: a.email,
      acessaFinanceiro: a.acessa_financeiro,
    })),
    convites: lista.convites.map((p) => ({
      id: p.id,
      email: p.email,
      expiraEm: new Date(p.expira_em).toISOString(),
    })),
  };
}

export function rotasAdmins(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.get('/grupos/:grupoId/admins', async (c) => {
    const lista = await admins.listar(c.var.db, c.req.param('grupoId'));
    return c.json(adminsResposta(lista), 200);
  });

  /**
   * Conceder ou retirar o acesso ao financeiro de outro admin (financeiro T29; FIN-35, FIN-36). A cadeia vem antes,
   * com o `exigirFinanceiro` (403 `sem_permissao_financeiro` para quem não tem acesso) e a trava de plano nas escritas
   * (403 `plano_pro`), ligados pelo `travarFinanceiro` neste caminho. Corpo `{ acessaFinanceiro }` (T8). A própria
   * conta: 409 `acao_na_propria_conta`; alvo que não é admin do grupo (ou id malformado): 404; valor igual: 200 sem
   * gravar nem auditar. Responde 200 com a lista de admins, como o GET. O banco recusar (zero linhas, T10) só acontece
   * com a checagem do repositório removida: 403, como o `exigirFinanceiro`.
   */
  rotas.patch('/grupos/:grupoId/admins/:contaId/financeiro', async (c) => {
    const contaId = c.req.param('contaId');
    if (!UUID.test(contaId)) return c.json(naoEncontrado, 404);
    const corpo = await lerCorpoDoGrupo(c, acessoFinanceiroCorpo);
    if (!corpo.ok) return corpo.resposta;
    const r = await acessoFinanceiro.alterarFinanceiro(
      c.var.db,
      c.req.param('grupoId'),
      contaId,
      corpo.dados.acessaFinanceiro,
    );
    if (r.resultado === 'propria_conta') {
      return c.json(
        {
          erro: MENSAGENS_ERRO_FINANCEIRO.acao_na_propria_conta,
          codigo: 'acao_na_propria_conta' as const,
        },
        409,
      );
    }
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    if (r.resultado === 'sem_permissao') return c.json(corpoSemPermissaoFinanceiro(), 403);
    return c.json(adminsResposta(r.lista), 200);
  });

  // Convidar: convite de 7 dias e e-mail com o link (ACE-31); quem já é admin, 409 (ACE-32).
  rotas.post('/grupos/:grupoId/admins/convites', contarPedidoDeEmail(opcoes), async (c) => {
    const corpo = await lerCorpo(c, conviteCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const { email } = corpo.dados;

    const { token, hash } = await gerarToken();
    const r = await convites.criar(c.var.db, grupoId, email, hash);
    if (r.resultado === 'ja_e_admin') return c.json(corpoDoErro('ja_e_admin'), 409);
    if (r.resultado !== 'ok') return c.json(naoEncontrado, 404);

    if (r.enviar) {
      const grupo = await sql<{
        nome: string;
      }>`SELECT nome FROM grupos WHERE id = ${grupoId}`.execute(c.var.db);
      const conteudo = emailConvite({
        urlPublica: c.env.URL_PUBLICA,
        grupoNome: grupo.rows[0]?.nome ?? '',
        token,
      });
      const envio = await enviarEmailDeConta(c.var.db, remetenteDoAmbiente(c.env), {
        enviar: true,
        categoria: 'cadastro',
        limiteDia: limiteEmailsDia(c.env.LIMITE_EMAILS_DIA),
        mensagem: {
          tipo: 'convite',
          para: email,
          ...conteudo,
          idempotencia: `convite:${hex(hash)}`,
        },
      });
      if (envio === 'indisponivel') return emailIndisponivel(c);
    }
    const resposta: ConviteCriado = { id: r.conviteId, email, expiraEm: r.expiraEm.toISOString() };
    return c.json(resposta, 201);
  });

  // Cancelar: o link deixa de valer (ACE-38). Registrada antes da remoção de admin, que também casa o caminho.
  rotas.delete('/grupos/:grupoId/admins/convites/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return c.json(naoEncontrado, 404);
    const ok = await convites.cancelar(c.var.db, c.req.param('grupoId'), id);
    if (!ok) return c.json(naoEncontrado, 404);
    return c.body(null, 204);
  });

  // Remover admin, com auditoria (ACE-39, ACE-42); o último não sai (ACE-40).
  rotas.delete('/grupos/:grupoId/admins/:contaId', async (c) => {
    const contaId = c.req.param('contaId');
    if (!UUID.test(contaId)) return c.json(naoEncontrado, 404);
    const r = await admins.remover(c.var.db, c.req.param('grupoId'), contaId);
    if (r === 'ultimo_admin') return c.json(corpoDoErro('ultimo_admin'), 409);
    // Outra admin não remove a criadora (SEC-001, grupos-e-elenco T32).
    if (r === 'criadora_nao_removivel') return c.json(corpoDoErro('criadora_nao_removivel'), 409);
    if (r === 'nao_encontrado') return c.json(naoEncontrado, 404);
    return c.body(null, 204);
  });

  return rotas;
}
