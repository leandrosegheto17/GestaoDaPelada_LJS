import { Hono } from 'hono';
import {
  consultaContexto,
  corpoDoErro,
  previaCorpo,
  type ContextoResposta,
  type PreviaResposta,
} from '@pelada/contrato';
import { calcularPrevia, descreverPrevia, proximoDiaDeJogo, type NomeDiaDaSemana, type Previa } from '@pelada/dominio';
import type { Ambiente } from '../ambiente.ts';
import { erroDeCampos, lerCorpoDoGrupo, mensagensDoZod } from '../corpo.ts';
import { jogadoresLeitura } from '../../infraestrutura/db/repositorios/jogadores-leitura.ts';
import { rotasEscalacoes } from './escalacoes.ts';

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
 * Molde: `GET …/jogadores` (`rotas/jogadores.ts:17`); o `GET partidas/nova` de `PR:1436` ainda não existe.
 */
export function rotasSimulador(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();

  rotas.get('/grupos/:grupoId/simulador/contexto', async (c) => {
    const consulta = consultaContexto.safeParse(c.req.query());
    if (!consulta.success) return c.json(erroDeCampos(mensagensDoZod(consulta.error)), 422);
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();

    const grupo = await c.var.db.selectFrom('grupos').select('dia_semana').where('id', '=', grupoId).executeTakeFirst();
    // O vínculo já leu o grupo na mesma transação; sem linha só numa corrida.
    if (!grupo) return c.json(corpoDoErro('nao_encontrado'), 404);
    // `dia_semana` tem o CHECK dos 7 nomes no banco (GEL-04).
    const dataSugerida = proximoDiaDeJogo(hoje, grupo.dia_semana as NomeDiaDaSemana);

    const aptos = await jogadoresLeitura.paraSimulador(c.var.db, grupoId, consulta.data.data ?? dataSugerida);
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
    const previa = calcularPrevia({ formato: corpo.dados.formato, n: corpo.dados.n, aptos: corpo.dados.aptos.length });
    return c.json(respostaDaPrevia(previa), 200);
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
      : { formato: 'dois_times', valida: false, motivo: 'aptos_insuficientes', descricao, maiorNPossivel: previa.maiorNPossivel };
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
