import { Hono } from 'hono';
import {
  corpoDoErro,
  editarGrupoCorpo,
  type GrupoDetalhe,
  type GrupoDetalheComPartidas,
  type GrupoDetalheComSaldo,
} from '@pelada/contrato';
import type { Ambiente } from '../ambiente.ts';
import { lerCorpoDoGrupo } from '../corpo.ts';
import { financeiroMes } from '../../infraestrutura/db/repositorios/financeiro/mes.ts';
import { grupos, type DetalheGrupo } from '../../infraestrutura/db/repositorios/grupos.ts';
import { gruposEstado } from '../../infraestrutura/db/repositorios/grupos-estado.ts';
import { linkPublico } from './grupos.ts';

/**
 * `GET` e `PATCH /api/grupos/:grupoId` (T29; GEL-16 a GEL-21), da tabela de `GD:168-169`. A sessão (401), a transação
 * com a conta, o vínculo (404, GEL-21) e o grupo ativo nas escritas (409, GEL-26) vêm da cadeia montada no `criarApp`
 * (`protegerRotasDeGrupo`); aqui só os handlers. O slug não muda ao renomear (GEL-16): o corpo `.strict()` não o aceita
 * e o grant por coluna não deixa a `pelada_app` gravá-lo.
 */

/** Forma do GET até a rota da simulador (T43): o contrato sem os 2 campos do simulador, com o saldo opcional. */
type DetalheDoGet = Omit<GrupoDetalheComPartidas, 'proximoDiaDeJogo' | 'escalacaoNoProximoDia'> &
  Pick<GrupoDetalheComSaldo, 'saldoFinanceiroCentavos'>;

/** O detalhe do contrato (GEL-20), com o link de `URL_PUBLICA` (GEL-17). */
export function detalheDoGrupo(urlPublica: string, g: DetalheGrupo): GrupoDetalhe {
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

export function rotasGrupo(): Hono<Ambiente> {
  const rotas = new Hono<Ambiente>();
  const naoEncontrado = corpoDoErro('nao_encontrado');

  /**
   * GET com o início do grupo (partidas-e-ranking T43; PAR-132, `BC:28`): `grupos.ler` recebe o hoje do relógio da
   * requisição e devolve os 6 campos de `DadosDoInicio`, que entram na resposta ao lado do detalhe (e do saldo, FIN-34).
   * Os 2 campos do simulador (`proximoDiaDeJogo`, `escalacaoNoProximoDia`, SIM-08) já estão no contrato do GET, mas são
   * da rota da simulador, que vem depois no roteiro: até lá a resposta é o contrato sem eles.
   */
  rotas.get('/grupos/:grupoId', async (c) => {
    const grupoId = c.req.param('grupoId');
    const hoje = c.var.relogio.hoje();
    const g = await grupos.ler(c.var.db, grupoId, hoje);
    if (!g) return c.json(naoEncontrado, 404);
    const comInicio: DetalheDoGet = {
      ...detalheDoGrupo(c.env.URL_PUBLICA, g),
      dataSugeridaPartida: g.dataSugeridaPartida,
      partidaNaDataSugerida: g.partidaNaDataSugerida,
      partidasNoMes: g.partidasNoMes,
      pesosVigentesDesde: g.pesosVigentesDesde,
      pesosPadrao: g.pesosPadrao,
      aparelhosNaSemana: g.aparelhosNaSemana,
    };
    // Saldo do caixa só para quem tem acesso ao financeiro; sem acesso, a chave não vai (FIN-34, AD-079).
    const saldo = await financeiroMes.saldoDoGrupo(c.var.db, grupoId, hoje);
    const resposta: DetalheDoGet = saldo.acessa ? { ...comInicio, saldoFinanceiroCentavos: saldo.saldoCentavos } : comInicio;
    return c.json(resposta, 200);
  });

  rotas.patch('/grupos/:grupoId', async (c) => {
    const corpo = await lerCorpoDoGrupo(c, editarGrupoCorpo);
    if (!corpo.ok) return corpo.resposta;
    const grupoId = c.req.param('grupoId');
    const r = await gruposEstado.editar(c.var.db, grupoId, corpo.dados);
    if (r.resultado === 'nao_encontrado') return c.json(naoEncontrado, 404);
    const g = await grupos.ler(c.var.db, grupoId);
    if (!g) return c.json(naoEncontrado, 404);
    return c.json(detalheDoGrupo(c.env.URL_PUBLICA, g), 200);
  });

  return rotas;
}
