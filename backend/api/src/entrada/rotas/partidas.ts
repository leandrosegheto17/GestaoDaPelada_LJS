import { Hono, type Context } from 'hono';
import {
  consultaData,
  consultaMes,
  corpoDoErro,
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_MES_FUTURO,
  mensagemPartidaJaExiste,
  type CorpoErro,
  type PartidaNova,
  type PartidasDoMes,
} from '@pelada/contrato';
import { compararApelido, compararDatas, compararMeses, dataSugeridaPartida, mesDe, navegacaoDeMes } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, mensagensDoZod, respostaDeCampo } from '../corpo.ts';
import { grupos } from '../../infraestrutura/db/repositorios/grupos.ts';
import { jogadores } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { partidas } from '../../infraestrutura/db/repositorios/partidas.ts';

/**
 * Rotas de partidas do grupo (partidas-e-ranking T39 em diante; `BD:229-233`, `BD:244-245`). A cadeia do grupo vem
 * antes (sessão, vínculo 404, grupo ativo 409 nas escritas); hoje e o mês de hoje são do relógio da requisição.
 *
 * `GET …/partidas/nova?data=` (PAR-17 a PAR-21), registrada antes de `…/partidas/:data` (T41):
 * - sem `data`: `data` = `dataSugerida` = a maior data até hoje no dia da semana do grupo (PAR-17);
 * - com `data`: os ativos dela, e `dataSugerida` continua a do item anterior (PAR-18);
 * - `data` que não é data real: 422 no campo `data` (PAR-19); depois de hoje: 422 "A data não pode ser no futuro."
 *   (PAR-20; hoje vale); já lançada: 409 `partida_ja_existe` com a mensagem da data e `dataExistente` (PAR-21);
 * - jogadores: os ativos na data, todos `ausente`, pelo apelido sem acento nem caixa (PAR-17).
 *
 * `GET …/partidas?mes=` (PAR-37 a PAR-41):
 * - sem `mes`: o mês de hoje (PAR-38); fora de `AAAA-MM`: 422 no campo `mes` (PAR-39); depois do mês de hoje: 422
 *   "O mês não pode ser futuro." (PAR-40);
 * - navegação do mês da primeira partida ao de hoje, nula nos dois lados sem partida (PAR-41);
 * - mês antes da primeira partida (não há link para ele, mas a URL pode pedir): lista vazia, sem `mesAnterior`.
 *
 * `preMarcadaPelaEscalacao` (contrato da simulador, SIM-75): falso aqui; a pré-marcação pela escalação é da simulador.
 */

/** 409 do PAR-21: a mensagem com a data e a data que já tem partida. */
export function respostaPartidaJaExiste(c: Context<Ambiente>, data: string): Response {
  const corpo: CorpoErro = { erro: mensagemPartidaJaExiste(data), codigo: 'partida_ja_existe', dataExistente: data };
  return c.json(corpo, 409);
}

/** A data é depois de hoje (PAR-20). */
export function ehFutura(data: string, hoje: string): boolean {
  return compararDatas(data, hoje) > 0;
}

export function rotasPartidas(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/partidas/nova', async (c) => {
    const consulta = consultaData.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const grupo = await grupos.ler(c.var.db, grupoId);
    if (!grupo) return c.json(corpoDoErro('nao_encontrado'), 404);
    const dataSugerida = dataSugeridaPartida(hoje, grupo.diaSemana);
    const data = consulta.data.data ?? dataSugerida;

    if (ehFutura(data, hoje)) return respostaDeCampo(c, 'data', MENSAGEM_DATA_FUTURA);
    if (await partidas.ler(c.var.db, grupoId, data)) return respostaPartidaJaExiste(c, data);

    const ativos = await jogadores.ativosNaData(c.var.db, grupoId, data);
    const resposta: PartidaNova = {
      data,
      dataSugerida,
      hoje,
      choveu: false,
      preMarcadaPelaEscalacao: false,
      jogadores: [...ativos]
        .sort((a, b) => compararApelido(a.apelido, b.apelido) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((j) => ({ id: j.id, apelido: j.apelido, situacao: 'ausente' as const })),
    };
    return c.json(resposta, 200);
  });

  rotas.get('/grupos/:grupoId/partidas', async (c) => {
    const consulta = consultaMes.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();
    const mesDeHoje = mesDe(hoje);
    const mes = consulta.data.mes ?? mesDeHoje;
    if (compararMeses(mes, mesDeHoje) > 0) return respostaDeCampo(c, 'mes', MENSAGEM_MES_FUTURO);

    const lista = await partidas.doMes(c.var.db, grupoId, mes);
    const primeiro = await partidas.mesDaPrimeira(c.var.db, grupoId);
    const resposta: PartidasDoMes = {
      mes,
      hoje,
      navegacao: navegacaoDeMes({ primeiro, ultimo: mesDeHoje }, mes),
      partidas: lista,
    };
    return c.json(resposta, 200);
  });

  return rotas;
}
