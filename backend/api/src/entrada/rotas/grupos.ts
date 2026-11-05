import { Hono } from 'hono';
import { criarGrupoCorpo, type CriarGrupoResposta, type GruposResposta } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { comBanco } from '../middlewares/com-banco.ts';
import { exigirSessao } from '../middlewares/sessao.ts';
import { grupos } from '../../infraestrutura/db/repositorios/grupos.ts';
import { comFabrica, type OpcoesRotas } from './apoio-acesso.ts';

/**
 * `POST` e `GET /api/grupos` (T28; GEL-01, GEL-03 a GEL-10, GEL-17, GEL-27), da tabela de `GD:165-167`. Sem `:grupoId`,
 * fora da cadeia das rotas de grupo: a sessão (401) e a transação com a conta são declaradas aqui. A criação é um
 * comando só (`grupo_criar`): grupo, vínculo, habilidades e auditoria juntos, desfeitos juntos (GEL-09, GEL-10).
 * O `LIMITE_ESCRITA` por conta do POST vem antes, no `criarApp` (SEC-003, T23).
 */

/** Link público do grupo, só de `URL_PUBLICA`, sem endereço fixo (GEL-17). Barra final da variável não duplica. */
export function linkPublico(urlPublica: string, slug: string): string {
  return `${urlPublica.replace(/\/+$/, '')}/g/${slug}`;
}

export function rotasGrupos(opcoes: OpcoesRotas = {}): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const banco = comBanco(undefined, comFabrica(opcoes));

  rotas.post('/grupos', exigirSessao, banco, async (c) => {
    const corpo = await lerCorpoDoGrupo(c, criarGrupoCorpo);
    if (!corpo.ok) return corpo.resposta;
    // Os pesos padrão nascem vigentes desde hoje, do relógio da requisição (PAR-15, T34 da partidas-e-ranking).
    const criado = await grupos.criar(c.var.db, corpo.dados, c.var.relogio.hoje());
    const resposta: CriarGrupoResposta = {
      id: criado.id,
      slug: criado.slug,
      linkPublico: linkPublico(c.env.URL_PUBLICA, criado.slug),
    };
    return c.json(resposta, 201);
  });

  rotas.get('/grupos', exigirSessao, banco, async (c) => {
    const lista = await grupos.listarDaConta(c.var.db);
    const resposta: GruposResposta = { ativos: lista.ativos, arquivados: lista.arquivados };
    return c.json(resposta, 200);
  });

  return rotas;
}
