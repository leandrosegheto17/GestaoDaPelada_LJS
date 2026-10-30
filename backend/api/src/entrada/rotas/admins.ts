import { conviteCorpo } from '@pelada/contrato';
import { Hono } from 'hono';
import * as admins from '../../infraestrutura/db/repositorios/admins.ts';
import * as convites from '../../infraestrutura/db/repositorios/convites.ts';
import { modeloConvite } from '../../infraestrutura/email/modelos.ts';
import { gerarToken } from '../../infraestrutura/sessao/token.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { chaveDeEnvio, enviarModelo } from '../enviar-email.ts';
import { CODIGOS_ERRO, emailIndisponivel, erroComStatus, naoEncontrado } from '../erros.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Admins do grupo (ACE-31, ACE-32, ACE-37 a ACE-42). A sessão e o vínculo com o grupo já foram exigidos pelo app em
 * `/api/grupos/:grupoId/*` (G-03); a auditoria de convidar, cancelar e remover é gravada na mesma transação.
 */
export const rotaAdmins = new Hono<AppEnv>()
  .get('/api/grupos/:grupoId/admins', async (c) => {
    const lista = await admins.listar(c.var.db, c.req.param('grupoId'));
    return c.json({
      admins: lista.admins,
      convites: lista.convites.map((v) => ({ id: v.id, email: v.email, expiraEm: v.expiraEm.toISOString() })),
    });
  })
  .post('/api/grupos/:grupoId/admins/convites', async (c) => {
    const corpo = await lerCorpo(c, conviteCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');

    const link = await gerarToken();
    const convite = await convites.criar(c.var.db, grupoId, corpo.dado.email, link.hash);
    if (convite.resultado === 'ja_e_admin') {
      return erroComStatus(c, 409, CODIGOS_ERRO.jaEAdmin, 'Esta pessoa já administra o grupo.');
    }
    if (convite.resultado === 'sem_vinculo' || !convite.conviteId || !convite.expiraEm) return naoEncontrado(c);
    if (convite.enviar) {
      const grupoNome = (await admins.nomeDoGrupo(c.var.db, grupoId)) ?? 'o grupo';
      const modelo = modeloConvite({ urlPublica: c.env.URL_PUBLICA, grupoNome, token: link.token });
      const chave = chaveDeEnvio('convite', link.hash);
      const envio = { para: corpo.dado.email, modelo, chave, categoria: 'convite' } as const;
      if (!(await enviarModelo(c, envio))) return emailIndisponivel(c);
    }
    return c.json({ id: convite.conviteId, email: corpo.dado.email, expiraEm: convite.expiraEm.toISOString() }, 201);
  })
  .delete('/api/grupos/:grupoId/admins/convites/:id', async (c) => {
    const id = c.req.param('id');
    if (!UUID.test(id)) return naoEncontrado(c);
    if (!(await convites.cancelar(c.var.db, c.req.param('grupoId'), id))) return naoEncontrado(c);
    return c.body(null, 204);
  })
  .delete('/api/grupos/:grupoId/admins/:contaId', async (c) => {
    const contaId = c.req.param('contaId');
    if (!UUID.test(contaId)) return naoEncontrado(c);
    const resultado = await admins.remover(c.var.db, c.req.param('grupoId'), contaId);
    if (resultado === 'nao_encontrado') return naoEncontrado(c);
    if (resultado === 'ultimo_admin') {
      return erroComStatus(c, 409, CODIGOS_ERRO.ultimoAdmin, 'O grupo precisa de pelo menos uma pessoa admin.');
    }
    if (resultado === 'criadora_nao_removivel') {
      const mensagem = 'Quem criou o grupo não pode ser removida por outra pessoa admin.';
      return erroComStatus(c, 409, CODIGOS_ERRO.criadoraNaoRemovivel, mensagem);
    }
    return c.body(null, 204);
  });
