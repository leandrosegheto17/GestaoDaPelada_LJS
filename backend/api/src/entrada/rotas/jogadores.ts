import { jogadorCorpo, type JogadorDetalhe, type JogadorItem, type Posicao } from '@pelada/contrato';
import { Hono } from 'hono';
import * as jogadores from '../../infraestrutura/db/repositorios/jogadores.ts';
import type { AppEnv } from '../app.ts';
import { lerCorpo } from '../corpo.ts';
import { CODIGOS_ERRO, erroComStatus, naoEncontrado } from '../erros.ts';

/**
 * Posição de quem foi anonimizado (LGPD): a coluna aceita nulo, o contrato exige uma posição. Mesma escolha do legado
 * (`POSICAO_PADRAO` em `aplicacao/elenco/listar.ts`, AD-002). O cadastro novo sempre grava a posição (GEL-37).
 */
const POSICAO_PADRAO: Posicao = 'meia';

export function item(j: jogadores.JogadorResumo): JogadorItem {
  return {
    id: j.id,
    apelido: j.apelido,
    posicao: j.posicao ?? POSICAO_PADRAO,
    situacao: j.situacao,
    desde: j.desde,
    nivel: j.nivel,
    semNota: j.semNota,
  };
}

/** `jogadorDetalhe` do contrato: a ficha lida do repositório. */
export function detalhe(j: jogadores.JogadorLido): JogadorDetalhe {
  return {
    ...item(j),
    anoNascimento: j.anoNascimento,
    telefone: j.telefone,
    pontuacaoInicial: j.pontuacaoInicial,
    inicioPontuacao: j.inicioPontuacao,
    periodos: j.periodos,
    notas: j.notas,
  };
}

/** 422 `dados_invalidos` com a mensagem num campo, como o `lerCorpo` (GEL-35). */
export function recusaDeCampo(c: Parameters<typeof naoEncontrado>[0], campo: string, mensagem: string): Response {
  return erroComStatus(c, 422, CODIGOS_ERRO.dadosInvalidos, 'Corrija os campos indicados.', { [campo]: mensagem });
}

/**
 * Elenco do grupo (grupos-e-elenco, design C6; GEL-31 a GEL-46). A sessão, o vínculo e o grupo ativo já foram
 * exigidos em `/api/grupos/:grupoId/*`. "Hoje" vem só do relógio da requisição (AD-015).
 */
export const rotaJogadores = new Hono<AppEnv>()
  .get('/api/grupos/:grupoId/jogadores', async (c) => {
    const lista = await jogadores.listar(c.var.db, c.req.param('grupoId'));
    return c.json({ jogadores: lista.map(item) });
  })
  .post('/api/grupos/:grupoId/jogadores', async (c) => {
    const hoje = c.var.relogio.hoje();
    const corpo = await lerCorpo(c, jogadorCorpo(hoje));
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const criado = await jogadores.criar(c.var.db, grupoId, corpo.dado, hoje);
    if (!criado.ok) return recusaDeCampo(c, criado.campo, criado.mensagem);
    const lido = await jogadores.ler(c.var.db, grupoId, criado.id);
    if (!lido) return naoEncontrado(c);
    return c.json(detalhe(lido), 201);
  });
