import { criarGrupoCorpo, editarGrupoCorpo, type GrupoDetalhe } from '@pelada/contrato';
import { slugBase } from '@pelada/dominio';
import { Hono } from 'hono';
import * as grupos from '../../infraestrutura/db/repositorios/grupos.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { naoEncontrado } from '../erros.ts';
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
  });
