import { Hono } from 'hono';
import { corpoDoErro, jogadorCorpo, type JogadorDetalhe, type ListaJogadores } from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { comUnicidade, lerCorpoDoGrupo, MENSAGEM_APELIDO_REPETIDO, respostaDeCampo } from '../corpo.ts';
import { jogadores } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';

/**
 * `GET` e `POST /api/grupos/:grupoId/jogadores` (T36; GEL-31, GEL-33, GEL-34, GEL-36, GEL-37, GEL-39, GEL-40, GEL-46,
 * SEC-002), da tabela de `GD:172`. A cadeia do grupo vem antes (sessão, transação, vínculo, grupo ativo). "Hoje" é do
 * relógio da requisição (T19): o contrato recusa data de entrada futura e ano acima de hoje − 10, e a criação usa hoje
 * quando a data falta (GEL-32). O 201 devolve a ficha do jogador criado ("Ativo desde" a data de entrada).
 */
export function rotasJogadores(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/jogadores', async (c) => {
    const resposta: ListaJogadores = { jogadores: await jogadoresLeitura.listar(c.var.db, c.req.param('grupoId')) };
    return c.json(resposta, 200);
  });

  rotas.post('/grupos/:grupoId/jogadores', async (c) => {
    const hoje = c.var.relogio.hoje();
    const corpo = await lerCorpoDoGrupo(c, jogadorCorpo(hoje));
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    return comUnicidade(c, async () => {
      const r = await jogadores.criar(c.var.db, grupoId, corpo.dados, hoje);
      if (r.resultado === 'apelido_repetido') return respostaDeCampo(c, 'apelido', MENSAGEM_APELIDO_REPETIDO);
      const ficha: JogadorDetalhe | null = await jogadoresLeitura.ler(c.var.db, grupoId, r.id);
      if (!ficha) return c.json(corpoDoErro('nao_encontrado'), 404);
      return c.json(ficha, 201);
    });
  });

  return rotas;
}
