import { criarGrupoCorpo } from '@pelada/contrato';
import { slugBase } from '@pelada/dominio';
import { Hono } from 'hono';
import * as grupos from '../../infraestrutura/db/repositorios/grupos.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { exigirSessao } from '../middlewares/sessao.ts';

/** Link público do grupo (GEL-17): o endereço vem só de `URL_PUBLICA`, nunca de um valor fixo no código. */
export function linkPublico(urlPublica: string, slug: string): string {
  return `${urlPublica.replace(/\/+$/, '')}/g/${slug}`;
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
  .get('/api/grupos', exigirSessao, async (c) => c.json(await grupos.listarDaConta(c.var.db)));
