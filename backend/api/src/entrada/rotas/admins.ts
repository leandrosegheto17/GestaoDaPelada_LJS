import { Hono } from 'hono';
import { sql } from 'kysely';
import { conviteCorpo, corpoDoErro, type AdminsResposta, type ConviteCriado } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { enviarEmailDeConta, limiteEmailsDia } from '../../aplicacao/acesso/enviar-email.ts';
import { admins, convites } from '../../infraestrutura/db/repositorios/convites.ts';
import { remetenteDoAmbiente } from '../../infraestrutura/email/caixa-dev.ts';
import { emailConvite } from '../../infraestrutura/email/modelos.ts';
import { gerarToken } from '../../infraestrutura/sessao/token.ts';
import { contarPedidoDeEmail, emailIndisponivel, hex, lerCorpo, type OpcoesRotas } from './apoio-acesso.ts';

/**
 * Rotas de admins do grupo (T30; ACE-31, ACE-32, ACE-37 a ACE-42), da tabela do design do LJS
 * (`design.md:167-170`). A sessão (401), a transação com a conta e o vínculo (404) vêm da cadeia
 * de `/api/grupos/:grupoId/*` montada no `criarApp` (T21); aqui só os handlers.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function rotasAdmins(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  rotas.get('/grupos/:grupoId/admins', async (c) => {
    const lista = await admins.listar(c.var.db, c.req.param('grupoId'));
    const resposta: AdminsResposta = {
      admins: lista.admins.map((a) => ({ id: a.id, nome: a.nome, email: a.email, acessaFinanceiro: a.acessa_financeiro })),
      convites: lista.convites.map((p) => ({ id: p.id, email: p.email, expiraEm: new Date(p.expira_em).toISOString() })),
    };
    return c.json(resposta, 200);
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
      const grupo = await sql<{ nome: string }>`SELECT nome FROM grupos WHERE id = ${grupoId}`.execute(c.var.db);
      const conteudo = emailConvite({ urlPublica: c.env.URL_PUBLICA, grupoNome: grupo.rows[0]?.nome ?? '', token });
      const envio = await enviarEmailDeConta(c.var.db, remetenteDoAmbiente(c.env), {
        enviar: true,
        categoria: 'cadastro',
        limiteDia: limiteEmailsDia(c.env.LIMITE_EMAILS_DIA),
        mensagem: { tipo: 'convite', para: email, ...conteudo, idempotencia: `convite:${hex(hash)}` },
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
    if (r === 'nao_encontrado') return c.json(naoEncontrado, 404);
    return c.body(null, 204);
  });

  return rotas;
}
