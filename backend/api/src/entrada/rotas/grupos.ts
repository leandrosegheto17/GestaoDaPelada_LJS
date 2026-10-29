import { arquivarCorpo, criarGrupoCorpo, editarGrupoCorpo, type GrupoDetalhe } from '@pelada/contrato';
import { slugBase } from '@pelada/dominio';
import { Hono, type Context } from 'hono';
import * as grupos from '../../infraestrutura/db/repositorios/grupos.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, erroComStatus, naoEncontrado } from '../erros.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

/** Link público do grupo (GEL-17): o endereço vem só de `URL_PUBLICA`, nunca de um valor fixo no código. */
export function linkPublico(urlPublica: string, slug: string): string {
  return `${urlPublica.replace(/\/+$/, '')}/g/${slug}`;
}

/** `grupoDetalhe` do contrato (GEL-18, GEL-20): o lido do repositório, com o link público. */
function detalhe(urlPublica: string, g: grupos.GrupoLido): GrupoDetalhe {
  return {
    id: g.id,
    nome: g.nome,
    slug: g.slug,
    linkPublico: linkPublico(urlPublica, g.slug),
    diaSemana: g.diaSemana,
    frequencia: g.frequencia,
    horario: g.horario,
    jogadoresAtivos: g.jogadoresAtivos,
    habilidades: g.habilidades,
    admins: g.admins,
    souCriador: g.souCriador,
  };
}

/**
 * Resposta de arquivar e reativar (GEL-22, GEL-24, GEL-28, GEL-29): 200 com o grupo (também quando já estava no
 * estado pedido), 403 `so_quem_criou` para a admin que não criou, 404 sem vínculo.
 */
async function responderArquivamento(
  c: Context<AppEnv>,
  grupoId: string,
  resultado: Exclude<grupos.ResultadoArquivamento, 'nome_nao_confere'>,
): Promise<Response> {
  if (resultado === 'nao_encontrado') return naoEncontrado(c);
  if (resultado === 'so_quem_criou') {
    return erroComStatus(c, 403, CODIGOS_ERRO.soQuemCriou, 'Só quem criou o grupo pode arquivar ou reativar.');
  }
  const g = await grupos.ler(c.var.db, grupoId);
  if (!g) return naoEncontrado(c);
  return c.json(detalhe(c.env.URL_PUBLICA, g));
}

/**
 * Grupos (grupos-e-elenco, design C6). `POST` e `GET /api/grupos` exigem só a sessão: a função `grupo_criar` e a RLS
 * decidem o resto (GEL-112). As rotas sob `/api/grupos/:grupoId/*` já passaram pela sessão, pelo vínculo e pelo
 * `exigirGrupoAtivo`.
 */
export const rotaGrupos = new Hono<AppEnv>()
  .post('/api/grupos', exigirSessao, async (c) => {
    const corpo = await lerCorpo(c, criarGrupoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const criado = await grupos.criar(c.var.db, corpo.dado, slugBase(corpo.dado.nome));
    return c.json({ ...criado, linkPublico: linkPublico(c.env.URL_PUBLICA, criado.slug) }, 201);
  })
  .get('/api/grupos', exigirSessao, async (c) => c.json(await grupos.listarDaConta(c.var.db)))
  .get('/api/grupos/:grupoId', async (c) => {
    const g = await grupos.ler(c.var.db, c.req.param('grupoId'));
    if (!g) return naoEncontrado(c);
    return c.json(detalhe(c.env.URL_PUBLICA, g));
  })
  .patch('/api/grupos/:grupoId', async (c) => {
    const corpo = await lerCorpo(c, editarGrupoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    if (!(await grupos.editar(c.var.db, grupoId, corpo.dado))) return naoEncontrado(c);
    const g = await grupos.ler(c.var.db, grupoId);
    if (!g) return naoEncontrado(c);
    return c.json(detalhe(c.env.URL_PUBLICA, g));
  })
  .post('/api/grupos/:grupoId/arquivar', async (c) => {
    const corpo = await lerCorpo(c, arquivarCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const resultado = await grupos.arquivar(c.var.db, grupoId, corpo.dado.nomeConfirmacao);
    if (resultado === 'nome_nao_confere') {
      return erroComStatus(c, 422, CODIGOS_ERRO.dadosInvalidos, 'Corrija os campos indicados.', {
        nomeConfirmacao: 'O nome digitado não confere com o nome do grupo.',
      });
    }
    return responderArquivamento(c, grupoId, resultado);
  })
  .post('/api/grupos/:grupoId/reativar', async (c) => {
    const grupoId = c.req.param('grupoId');
    return responderArquivamento(c, grupoId, await grupos.reativar(c.var.db, grupoId));
  });
