import { Hono } from 'hono';
import {
  consultaContexto,
  corpoDoErro,
  MENSAGEM_APTOS_INATIVOS,
  previaCorpo,
  sugerirCorpo,
  avaliarCorpo,
  type AvaliarResposta,
  type ContextoResposta,
  type SugerirResposta,
} from '@pelada/contrato';
import type { PreviaResposta } from '@pelada/contrato/simulador';
import {
  avaliar,
  calcularPrevia,
  descreverPrevia,
  proximoDiaDeJogo,
  sugerir,
  vespera,
  type NomeDiaDaSemana,
  type Previa,
} from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, lerCorpoDoGrupo, mensagensDoZod, respostaDeCampo } from '../corpo.ts';
import { historico } from '../../infraestrutura/db/repositorios/historico.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';
import { rotasEscalacoes } from './escalacoes.ts';
import {
  aptosDoCorpo,
  comSo1oDaComposicao,
  composicaoDoCorpo,
  entradaDoDominio,
  registrarRequisicao,
  resultadoDoisSemOrdem,
  resultadoVarios,
} from './simulador-resultado.ts';

/**
 * Rotas do simulador (T33 em diante da simulador). A cadeia do grupo vem antes (sessão 401, transação, vínculo 404,
 * grupo ativo 409 nas escritas) e a trava do recurso `simulador` (403 `plano_pro`, T32). "Hoje" é do relógio da
 * requisição; o domínio não lê relógio (SIM-50).
 *
 * - `GET …/simulador/contexto?data=` (T33; SIM-01 a SIM-04): `dataSugerida` = próximo dia de jogo a partir de hoje,
 *   hoje incluso (AD-086); os aptos são os ativos da data pedida, ou da sugerida sem `data`, na ordem do apelido, só com
 *   id, apelido, nível, `semNota` e `semAno` (SIM-03). Data inválida: 422 no campo `data` (SIM-04).
 *
 * - `POST …/simulador/previa` (T34; SIM-09, SIM-83): valida `previaCorpo` e devolve `calcularPrevia` com a descrição,
 *   sem consulta além da cadeia do grupo e sem gravar; 409 em grupo arquivado (pela cadeia). A transação `READ ONLY`
 *   pelo sufixo `/previa` (AD-035) é a do `comBanco` da partidas-e-ranking (`PR:1362`, T36), ainda não rascunhada.
 *
 * - `POST …/simulador/sugerir` (T35; SIM-17, SIM-47, SIM-53 a SIM-56, SIM-60, SIM-80): valida `sugerirCorpo`, confere
 *   que cada apto é ativo do grupo na data (senão 422 "Há jogadores que não estão ativos…" no campo `aptos`, sem dizer
 *   qual), carrega o histórico até a véspera e devolve `sugerir` na forma do contrato, sem gravar; aptos insuficientes
 *   dão 422 com a descrição da prévia no campo `aptos` (SIM-56). Uma linha de log por requisição (SIM-60).
 *
 * - `POST …/simulador/avaliar` (T36; SIM-62, SIM-63): a mesma entrada do `sugerir` mais a composição ajustada;
 *   repetido e fora dos aptos dão 422 no campo `composicao` (pelo contrato); recalcula indicadores, pares e avisos da
 *   composição recebida pelo `avaliar` do domínio, sem ordem de prioridade e sem gravar.
 *
 * Molde: `GET …/jogadores` (`rotas/jogadores.ts:17`); o `GET partidas/nova` de `PR:1436` ainda não existe.
 */
export function rotasSimulador(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/simulador/contexto', async (c) => {
    const consulta = consultaContexto.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const grupo = await c.var.db
      .selectFrom('grupos')
      .select('dia_semana')
      .where('id', '=', grupoId)
      .executeTakeFirst();
    // O vínculo já leu o grupo na mesma transação; sem linha só numa corrida.
    if (!grupo) return c.json(corpoDoErro('nao_encontrado'), 404);
    // `dia_semana` tem o CHECK dos 7 nomes no banco (GEL-04).
    const dataSugerida = proximoDiaDeJogo(hoje, grupo.dia_semana as NomeDiaDaSemana);

    const aptos = await jogadoresLeitura.paraSimulador(
      c.var.db,
      grupoId,
      consulta.data.data ?? dataSugerida,
    );
    const resposta: ContextoResposta = {
      dataSugerida,
      hoje,
      jogadores: aptos.map((a) => ({
        id: a.id,
        apelido: a.apelido,
        nivel: a.nivel,
        semNota: a.semNota,
        semAno: a.anoNascimento === null,
      })),
    };
    return c.json(resposta, 200);
  });

  rotas.post('/grupos/:grupoId/simulador/previa', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, previaCorpo);
    if (!corpo.ok) return corpo.resposta;
    const previa = calcularPrevia({
      formato: corpo.dados.formato,
      n: corpo.dados.n,
      aptos: corpo.dados.aptos.length,
    });
    return c.json(respostaDaPrevia(previa), 200);
  });

  rotas.post('/grupos/:grupoId/simulador/sugerir', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, sugerirCorpo);
    if (!corpo.ok) return corpo.resposta;
    const dados = corpo.dados;
    registrarRequisicao('sugerir', dados);
    const grupoId = c.req.param('grupoId');

    const aptos = aptosDoCorpo(
      dados,
      await jogadoresLeitura.paraSimulador(c.var.db, grupoId, dados.data),
    );
    if (!aptos) return respostaDeCampo(c, 'aptos', MENSAGEM_APTOS_INATIVOS);

    // Só as partidas até a véspera contam para a prioridade (SIM-17).
    const hist = await historico.carregar(c.var.db, grupoId, vespera(dados.data));
    const s = sugerir(entradaDoDominio(dados, aptos), hist);
    if (!s.valida) return respostaDeCampo(c, 'aptos', s.descricao);

    let resposta: SugerirResposta;
    if (s.formato === 'dois_times' && dados.formato === 'dois_times') {
      resposta = {
        ...resultadoDoisSemOrdem(dados, s.descricao, s.composicao, s.indicadores, s.avisos, aptos),
        ordemPrioridade: s.ordemPrioridade,
      };
    } else if (s.formato === 'varios_times' && dados.formato === 'varios_times') {
      resposta = resultadoVarios(
        dados,
        s.descricao,
        s.times,
        s.incompleto,
        s.indicadores,
        s.avisos,
        aptos,
      );
    } else {
      throw new Error('formato da sugestão diferente do pedido');
    }
    return c.json(resposta, 200);
  });

  rotas.post('/grupos/:grupoId/simulador/avaliar', async (c) => {
    // O contrato já recusa repetido e fora dos aptos no campo `composicao` (SIM-63).
    const corpo = await lerCorpoDoGrupo(c, avaliarCorpo);
    if (!corpo.ok) return corpo.resposta;
    const dados = corpo.dados;
    const grupoId = c.req.param('grupoId');

    const doBanco = aptosDoCorpo(
      dados,
      await jogadoresLeitura.paraSimulador(c.var.db, grupoId, dados.data),
    );
    if (!doBanco) return respostaDeCampo(c, 'aptos', MENSAGEM_APTOS_INATIVOS);
    // O "só 1º" vale como está na composição ajustada (T16).
    const aptos = comSo1oDaComposicao(doBanco, dados);

    const hist = await historico.carregar(c.var.db, grupoId, vespera(dados.data));
    const a = avaliar(entradaDoDominio(dados, aptos), composicaoDoCorpo(dados), hist);
    if (!a.ok) return respostaDeCampo(c, a.campo, a.mensagem);

    let resposta: AvaliarResposta;
    if (a.formato === 'dois_times' && dados.formato === 'dois_times') {
      resposta = resultadoDoisSemOrdem(
        dados,
        a.descricao,
        a.composicao,
        a.indicadores,
        a.avisos,
        aptos,
      );
    } else if (a.formato === 'varios_times' && dados.formato === 'varios_times') {
      resposta = resultadoVarios(
        dados,
        a.descricao,
        a.times,
        a.incompleto,
        a.indicadores,
        a.avisos,
        aptos,
      );
    } else {
      throw new Error('formato da avaliação diferente do pedido');
    }
    return c.json(resposta, 200);
  });

  // A escalação confirmada (T37) mora no próprio arquivo e entra no app junto com as rotas do simulador.
  rotas.route('/', rotasEscalacoes());

  return rotas;
}

/**
 * A prévia do domínio na forma do contrato (T34; SIM-09 a SIM-13), com o texto pronto em `descricao` (SIM-15): a tela
 * não calcula nada.
 */
export function respostaDaPrevia(previa: Previa): PreviaResposta {
  const descricao = descreverPrevia(previa);
  if (previa.formato === 'dois_times') {
    return previa.valida
      ? { formato: 'dois_times', valida: true, descricao, times: 2, reservas: previa.reservas }
      : {
          formato: 'dois_times',
          valida: false,
          motivo: 'aptos_insuficientes',
          descricao,
          maiorNPossivel: previa.maiorNPossivel,
        };
  }
  return previa.valida
    ? {
        formato: 'varios_times',
        valida: true,
        descricao,
        times: previa.times,
        timesCompletos: previa.timesCompletos,
        tamanhoIncompleto: previa.tamanhoIncompleto,
      }
    : {
        formato: 'varios_times',
        valida: false,
        motivo: 'aptos_insuficientes',
        descricao,
        nSugerido: previa.nSugerido,
        doisTimesPossivel: previa.doisTimesPossivel,
      };
}
