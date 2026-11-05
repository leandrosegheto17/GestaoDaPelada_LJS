import { Hono, type Context } from 'hono';
import {
  consultaData,
  consultaMes,
  corpoDoErro,
  ehDataDoCalendario,
  MENSAGEM_DATA_ALTERADA,
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_MES_FUTURO,
  mensagemPartidaJaExiste,
  partidaCorpo,
  type CorpoErro,
  type PartidaCorpo,
  type PartidaNova,
  type PartidaResposta,
  type PartidasDoMes,
} from '@pelada/contrato';
import { compararApelido, compararDatas, compararMeses, dataSugeridaPartida, mesDe, navegacaoDeMes } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, mensagensDoZod, respostaDeCampo, type Leitura } from '../corpo.ts';
import { grupos } from '../../infraestrutura/db/repositorios/grupos.ts';
import { escalacoes } from '../../infraestrutura/db/repositorios/escalacoes.ts';
import { jogadores } from '../../infraestrutura/db/repositorios/jogadores.ts';
import { partidas } from '../../infraestrutura/db/repositorios/partidas.ts';
import { agendarAviso } from '../../infraestrutura/fila/avisos.ts';

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
 * Pré-marcação pela escalação (simulador T38; SIM-75, SIM-76, SIM-78, SIM-88): com escalação válida na data, os
 * ativos que estão nela vêm `presente` e os demais `ausente`, com `preMarcadaPelaEscalacao` verdadeiro; sem escalação
 * ou com escalação inválida (SIM-94), todos `ausente` e falso. A edição (`GET …/partidas/:data`) não muda (SIM-78).
 * [LACUNA] escalação válida em que nenhum id é ativo na data: a Base não diz; aqui a marca fica verdadeira (a escalação
 * existe) com todos `ausente`. O /executar confirma.
 */

/**
 * Corpo de `POST …/partidas` e `PUT …/partidas/:data` (T40, T41). Como o `lerCorpoDoGrupo`, mas o campo é o caminho
 * inteiro (`marcacoes.<índice>.jogadorId`, `marcacoes.<índice>.situacao`): o PAR-24 aponta a marcação, e o id que não é
 * UUID (jogador inexistente) cai no mesmo campo e com a mesma mensagem do inativo e do de outro grupo.
 */
export async function lerPartidaCorpo(c: Context<Ambiente>): Promise<Leitura<PartidaCorpo>> {
  let bruto: unknown;
  try {
    bruto = await c.req.json();
  } catch {
    return { ok: false, resposta: c.json(erroDeCampos({ corpo: 'Envie um JSON válido.' }), 422) };
  }
  const r = partidaCorpo.safeParse(bruto);
  if (!r.success) {
    const mensagens: Record<string, string> = {};
    for (const problema of r.error.issues) {
      const campo = problema.path.length > 0 ? problema.path.map(String).join('.') : 'corpo';
      mensagens[campo] ??= problema.message;
    }
    return { ok: false, resposta: c.json(erroDeCampos(mensagens), 422) };
  }
  return { ok: true, dados: r.data };
}

/** Resposta da partida gravada (201 do lançamento, 200 da edição; PAR-22, PAR-46), relida na mesma transação. */
export async function respostaDaPartida(c: Context<Ambiente>, grupoId: string, data: string, status: 200 | 201): Promise<Response> {
  const lida = await partidas.ler(c.var.db, grupoId, data);
  // Acabou de gravar na mesma transação: sem a partida, é erro (500, e o `comBanco` desfaz).
  if (!lida) throw new Error('partida gravada não encontrada na releitura');
  const resposta: PartidaResposta = { ...lida, hoje: c.var.relogio.hoje() };
  return c.json(resposta, status);
}

/** 409 do PAR-21: a mensagem com a data e a data que já tem partida. */
export function respostaPartidaJaExiste(c: Context<Ambiente>, data: string): Response {
  const corpo: CorpoErro = { erro: mensagemPartidaJaExiste(data), codigo: 'partida_ja_existe', dataExistente: data };
  return c.json(corpo, 409);
}

/**
 * Aviso de ranking atualizado (notificacoes T21; NOT-20 a NOT-23; AD-068, AD-069, AD-098): registrado só quando o
 * repositório gravou, roda depois do `COMMIT` pelo `aposCommit` (T15) e só enfileira (T16). Transação desfeita (409,
 * 422, erro, `COMMIT` que falha): a tarefa é descartada e nada sai. Fila que lança: o `aposCommit` reporta sem
 * conteúdo e a resposta e a partida gravada não mudam. A exclusão não avisa (NOT-23).
 */
function avisarRankingAtualizado(c: Context<Ambiente>, grupoId: string, data: string): void {
  const env = c.env;
  const criadoEm = c.var.relogio.agoraIso();
  c.var.aposCommit(() =>
    agendarAviso(env, { tipo: 'ranking', grupoId, dataPartida: data, criadoEm, aposId: '0', tentativa: 1 }),
  );
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
    // Pré-marcação pela escalação da data (simulador T38; SIM-75, SIM-76, SIM-88): só os ativos na data entram, então
    // o jogador da escalação inativado depois dela não aparece; sem escalação ou com JSON inválido, como antes.
    const escalados = await escalacoes.idsNaData(c.var.db, grupoId, data);
    const naEscalacao = new Set(escalados ?? []);
    const resposta: PartidaNova = {
      data,
      dataSugerida,
      hoje,
      choveu: false,
      preMarcadaPelaEscalacao: escalados !== null,
      jogadores: [...ativos]
        .sort((a, b) => compararApelido(a.apelido, b.apelido) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
        .map((j) => ({
          id: j.id,
          apelido: j.apelido,
          situacao: naEscalacao.has(j.id) ? ('presente' as const) : ('ausente' as const),
        })),
    };
    return c.json(resposta, 200);
  });

  /**
   * Lançamento (T40; PAR-19 a PAR-26, `BD:231`): corpo pelo contrato (422 no campo), data futura recusada antes do
   * repositório (PAR-20), `partidas.lancar` (marcações contra os ativos na data, PAR-24, PAR-25; data já lançada,
   * também na corrida, 409, PAR-21, PAR-30) e 201 com a partida relida. O `LIMITE_ESCRITA` por conta já vale para o
   * POST (`limitarEscritasDeGrupo`).
   */
  rotas.post('/grupos/:grupoId/partidas', async (c) => {
    const corpo = await lerPartidaCorpo(c);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const dados = corpo.dados;
    if (ehFutura(dados.data, c.var.relogio.hoje())) return respostaDeCampo(c, 'data', MENSAGEM_DATA_FUTURA);

    const r = await partidas.lancar(c.var.db, grupoId, dados);
    if (r.resultado === 'invalido') return c.json(erroDeCampos(r.campos), 422);
    if (r.resultado === 'partida_ja_existe') return respostaPartidaJaExiste(c, dados.data);
    avisarRankingAtualizado(c, grupoId, dados.data);
    return respostaDaPartida(c, grupoId, dados.data, 201);
  });

  /**
   * Partida por data (T41; PAR-44 a PAR-50, `BD:232-234`), registradas depois de `…/partidas/nova` (a `nova` responde
   * primeiro; e nem é data real). Nos três métodos, `:data` que não é data real `AAAA-MM-DD`, ou sem partida no grupo,
   * responde 404 (PAR-45). A data do caminho é checada antes do corpo.
   * - GET 200 com a partida para a tela de edição (PAR-44);
   * - PUT: corpo pelo contrato; `data` do corpo diferente da do caminho, 422 "A data da partida não pode ser alterada."
   *   (PAR-47); marcações contra os ativos na data da partida (PAR-48); 200 com a partida relida (PAR-46);
   * - DELETE 204; a auditoria guarda `partida_excluida` e o evento de uso fica (PAR-50, PAR-51).
   */
  const naoEncontrada = corpoDoErro('nao_encontrado');

  rotas.get('/grupos/:grupoId/partidas/:data', async (c) => {
    const data = c.req.param('data');
    if (!ehDataDoCalendario(data)) return c.json(naoEncontrada, 404);
    const lida = await partidas.ler(c.var.db, c.req.param('grupoId'), data);
    if (!lida) return c.json(naoEncontrada, 404);
    const resposta: PartidaResposta = { ...lida, hoje: c.var.relogio.hoje() };
    return c.json(resposta, 200);
  });

  rotas.put('/grupos/:grupoId/partidas/:data', async (c) => {
    const data = c.req.param('data');
    if (!ehDataDoCalendario(data)) return c.json(naoEncontrada, 404);
    const corpo = await lerPartidaCorpo(c);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await partidas.editar(c.var.db, grupoId, data, corpo.dados);
    if (r.resultado === 'nao_encontrada') return c.json(naoEncontrada, 404);
    if (r.resultado === 'data_alterada') return respostaDeCampo(c, 'data', MENSAGEM_DATA_ALTERADA);
    if (r.resultado === 'invalido') return c.json(erroDeCampos(r.campos), 422);
    avisarRankingAtualizado(c, grupoId, data);
    return respostaDaPartida(c, grupoId, data, 200);
  });

  rotas.delete('/grupos/:grupoId/partidas/:data', async (c) => {
    const data = c.req.param('data');
    if (!ehDataDoCalendario(data)) return c.json(naoEncontrada, 404);
    const r = await partidas.excluir(c.var.db, c.req.param('grupoId'), data);
    if (r.resultado === 'nao_encontrada') return c.json(naoEncontrada, 404);
    // Excluir não avisa (NOT-23, AD-069).
    return c.body(null, 204);
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
