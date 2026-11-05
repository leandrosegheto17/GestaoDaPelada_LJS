import { sql } from 'kysely';
import type { CorrigirPeriodoCorpo, DataCorpo, InicioCorpo, JogadorCorpo } from '@pelada/contrato';
import {
  avaliarInicio,
  avaliarPeriodos,
  type RegraInicio,
  type CampoPeriodo,
  type OperacaoPeriodo,
  type Periodo,
  type PresencaJogador,
  type RegraPeriodo,
} from '@pelada/dominio';
import { auditoria } from './convites.ts';
import type { Db } from './tipos.ts';

/**
 * Escritas do jogador que tocam `periodos_ativos` e `inicio_pontuacao` (GEL-83, GEL-109, GEL-111): só este arquivo as
 * faz (a checagem da T45 reprova escrita delas fora daqui e das migrações). Interface de `GD:151-152`; o `Db` é o da
 * transação da requisição. A criação (T34) abre o primeiro período; inativar, reativar, corrigir e alterar o início
 * vêm nas T38 a T41.
 */

export type ResultadoCriarJogador = { resultado: 'ok'; id: string } | { resultado: 'apelido_repetido' };

/**
 * Cadastra o jogador (GEL-31): confere o apelido repetido sem caixa (GEL-35; o acento conta, como o índice
 * `jogadores_apelido_grupo` em `lower(apelido)`), grava `inicio_pontuacao` = data de entrada (hoje, sem ela, GEL-32),
 * abre o primeiro período nessa data e audita `jogador_criado` só com o id e a data (GEL-45, GEL-113: sem telefone nem
 * ano). Telefone ausente ou vazio já chega nulo do contrato (GEL-38).
 *
 * A corrida de dois cadastros do mesmo apelido passa pela consulta e cai no índice único: o 23505 sobe e a rota o
 * traduz no mesmo 422 (`comUnicidade`, T20), não 500.
 */
async function criar(db: Db, grupoId: string, dados: JogadorCorpo, hoje: string): Promise<ResultadoCriarJogador> {
  const repetido = await sql<{ id: string }>`
    SELECT id FROM jogadores WHERE grupo_id = ${grupoId} AND lower(apelido) = lower(${dados.apelido})`.execute(db);
  if (repetido.rows.length > 0) return { resultado: 'apelido_repetido' };

  const entrada = dados.dataEntrada ?? hoje;
  const r = await sql<{ id: string }>`
    INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, telefone, pontuacao_inicial, inicio_pontuacao,
                           criado_por, criado_em, alterado_por, alterado_em)
    VALUES (${grupoId}, ${dados.apelido}, ${dados.anoNascimento}, ${dados.posicao}, ${dados.telefone ?? null},
            ${dados.pontuacaoInicial}, ${entrada}::date, app_conta_id(), now(), app_conta_id(), now())
    RETURNING id`.execute(db);
  const id = r.rows[0]?.id;
  if (!id) throw new Error('INSERT de jogador sem id');

  await sql`
    INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim)
    VALUES (${id}, ${grupoId}, ${entrada}::date, NULL)`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_criado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { dataEntrada: entrada },
  });
  return { resultado: 'ok', id };
}

// ---------------------------------------------------------------- escritas de período

/**
 * Resultado das escritas de período (T38 a T40). `invalido` traz a primeira regra que falhou, na ordem do GEL-62, com
 * o campo do domínio (`saida` ou `retorno`); a rota escolhe o nome do campo do corpo.
 */
export type ResultadoPeriodo =
  | { resultado: 'ok'; alterado: boolean }
  | { resultado: 'nao_encontrado' | 'ja_inativo' | 'ja_ativo' }
  | { resultado: 'invalido'; regra: RegraPeriodo; campo: CampoPeriodo; mensagem: string };

export interface EstadoDoJogador {
  inicioPontuacao: string | null;
  /** Em ordem de início, cada um com `id`. */
  periodos: Array<Periodo & { id: string }>;
  presencas: PresencaJogador[];
}

/**
 * Trava a linha do jogador do grupo (`FOR UPDATE`) e lê, já com a trava, os períodos e as presenças (com a data da
 * partida). A segunda escrita concorrente do mesmo jogador espera aqui e é validada sobre o resultado da primeira
 * (`GD:152`, GEL-110). Nulo quando o jogador não é do grupo (GEL-44).
 */
async function travarParaPeriodo(db: Db, grupoId: string, id: string): Promise<EstadoDoJogador | null> {
  return lerEstado(db, grupoId, id, true);
}

/**
 * A mesma leitura do `travarParaPeriodo`, sem trava (T29 da partidas-e-ranking; `BD:208-209`): as prévias rodam em
 * transação `READ ONLY` (AD-035) e não podem travar nem esperar a trava de uma escrita. Nulo fora do grupo.
 */
async function lerParaPrevia(db: Db, grupoId: string, id: string): Promise<EstadoDoJogador | null> {
  return lerEstado(db, grupoId, id, false);
}

async function lerEstado(db: Db, grupoId: string, id: string, travar: boolean): Promise<EstadoDoJogador | null> {
  const j = await sql<{ inicio_pontuacao: string | null }>`
    SELECT inicio_pontuacao::text AS inicio_pontuacao FROM jogadores
     WHERE grupo_id = ${grupoId} AND id = ${id}
       ${travar ? sql`FOR UPDATE` : sql``}`.execute(db);
  const linha = j.rows[0];
  if (!linha) return null;
  const periodos = await sql<Periodo & { id: string }>`
    SELECT id, inicio::text AS inicio, fim::text AS fim FROM periodos_ativos
     WHERE grupo_id = ${grupoId} AND jogador_id = ${id}
     ORDER BY inicio, id`.execute(db);
  const presencas = await sql<PresencaJogador>`
    SELECT pt.data::text AS data, p.situacao
      FROM presencas p
      JOIN partidas pt ON pt.id = p.partida_id AND pt.grupo_id = p.grupo_id
     WHERE p.grupo_id = ${grupoId} AND p.jogador_id = ${id}
     ORDER BY pt.data`.execute(db);
  return { inicioPontuacao: linha.inicio_pontuacao, periodos: periodos.rows, presencas: presencas.rows };
}

/** As regras do domínio sobre o estado travado; a falha vira `invalido`. */
function avaliar(estado: EstadoDoJogador, operacao: OperacaoPeriodo, hoje: string) {
  return avaliarPeriodos({
    periodos: estado.periodos,
    operacao,
    presencas: estado.presencas,
    inicioPontuacao: estado.inicioPontuacao,
    hoje,
  });
}

/**
 * Inativa o jogador (GEL-51): encerra o período aberto na data de saída (hoje, sem ela, GEL-52) e audita
 * `jogador_inativado` (C9 de `context.md:15`), tudo na transação da requisição (GEL-109). As regras de período são as
 * do domínio (GEL-58, GEL-62 a GEL-69), inclusive a presença que sairia do período (GEL-68).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - sem data: a saída é hoje (do relógio da requisição);
 * - saída igual ao início do período aberto: o domínio decide (período [início, fim), GEL-61);
 * - saída antes de uma presença dentro do período: `invalido` com a regra `presenca` e a data mínima (GEL-68);
 * - já inativo (sem período aberto): `ja_inativo`, sem gravar (GEL-53);
 * - jogador de outro grupo: `nao_encontrado`;
 * - erro depois do `UPDATE` (auditoria que falha): sobe, e a transação da requisição desfaz o período (GEL-109).
 */
async function inativar(db: Db, grupoId: string, id: string, dados: DataCorpo, hoje: string): Promise<ResultadoPeriodo> {
  const estado = await travarParaPeriodo(db, grupoId, id);
  if (!estado) return { resultado: 'nao_encontrado' };
  const aberto = estado.periodos.find((p) => p.fim === null);
  if (!aberto) return { resultado: 'ja_inativo' };

  const saida = dados.data ?? hoje;
  const r = avaliar(estado, { tipo: 'inativar', saida }, hoje);
  if (!r.ok) return { resultado: 'invalido', regra: r.regra, campo: r.campo, mensagem: r.mensagem };

  await sql`
    UPDATE periodos_ativos SET fim = ${saida}::date
     WHERE grupo_id = ${grupoId} AND jogador_id = ${id} AND id = ${aberto.id} AND fim IS NULL`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_inativado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { saida, periodoId: aberto.id },
  });
  return { resultado: 'ok', alterado: true };
}

/**
 * Reativa o jogador (GEL-54): abre um período novo na data de retorno (hoje, sem ela, GEL-55), sem mexer em
 * `inicio_pontuacao` nem em `pontuacao_inicial`, e audita `jogador_reativado` com o retorno e a saída anterior
 * (GEL-57). Mesma trava e mesmas regras de período do inativar (GEL-58).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - retorno no dia da saída anterior: vale (sair e voltar no mesmo dia, GEL-61);
 * - retorno na véspera da saída anterior: `invalido`, regra `retorno-antes-da-saida-anterior` (GEL-58, GEL-66);
 * - já ativo (há período aberto): `ja_ativo`, sem gravar (GEL-56);
 * - sem data: o retorno é hoje;
 * - jogador de outro grupo: `nao_encontrado`;
 * - erro depois do `INSERT`: sobe, e a transação da requisição desfaz o período (GEL-109).
 */
async function reativar(db: Db, grupoId: string, id: string, dados: DataCorpo, hoje: string): Promise<ResultadoPeriodo> {
  const estado = await travarParaPeriodo(db, grupoId, id);
  if (!estado) return { resultado: 'nao_encontrado' };
  if (estado.periodos.some((p) => p.fim === null)) return { resultado: 'ja_ativo' };

  const retorno = dados.data ?? hoje;
  const r = avaliar(estado, { tipo: 'reativar', retorno }, hoje);
  if (!r.ok) return { resultado: 'invalido', regra: r.regra, campo: r.campo, mensagem: r.mensagem };

  const saidaAnterior = estado.periodos.at(-1)?.fim ?? null;
  const novo = await sql<{ id: string }>`
    INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim)
    VALUES (${id}, ${grupoId}, ${retorno}::date, NULL)
    RETURNING id`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_reativado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { retorno, saidaAnterior, periodoId: novo.rows[0]?.id ?? null },
  });
  return { resultado: 'ok', alterado: true };
}

/**
 * Corrige a saída de um período encerrado e/ou o retorno de um período que não é o primeiro (GEL-71), com a mesma
 * trava e as regras de período do domínio, e audita `jogador_periodo_corrigido` com as datas antes e depois. Datas
 * iguais às atuais devolvem `alterado: false` sem gravar nem auditar (GEL-74).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - saída de período aberto: `invalido`, regra `nao-corrigivel` (GEL-72);
 * - retorno do primeiro período: `invalido`, regra `nao-corrigivel`; o caminho é alterar a data de início (GEL-73);
 * - datas iguais às atuais: `ok` com `alterado: false`, sem `UPDATE` nem auditoria (GEL-74);
 * - período de outro jogador do mesmo grupo (ou inexistente): `nao_encontrado`, antes do domínio (GEL-75);
 * - saída e retorno juntos: o domínio aplica as duas e avalia a saída primeiro (ordem do GEL-62);
 * - erro depois do `UPDATE`: sobe, e a transação da requisição desfaz a correção (GEL-109).
 */
async function corrigirPeriodo(
  db: Db,
  grupoId: string,
  id: string,
  periodoId: string,
  dados: CorrigirPeriodoCorpo,
  hoje: string,
): Promise<ResultadoPeriodo> {
  const estado = await travarParaPeriodo(db, grupoId, id);
  if (!estado) return { resultado: 'nao_encontrado' };
  const indice = estado.periodos.findIndex((p) => p.id === periodoId);
  const antes = estado.periodos[indice];
  if (!antes) return { resultado: 'nao_encontrado' };

  const r = avaliar(estado, { tipo: 'corrigir', periodoId, saida: dados.saida, retorno: dados.retorno }, hoje);
  if (!r.ok) return { resultado: 'invalido', regra: r.regra, campo: r.campo, mensagem: r.mensagem };
  if (!r.alterado) return { resultado: 'ok', alterado: false };

  const depois = r.periodos[indice];
  if (!depois) throw new Error('Período corrigido sumiu da avaliação');
  await sql`
    UPDATE periodos_ativos SET inicio = ${depois.inicio}::date, fim = ${depois.fim}::date
     WHERE grupo_id = ${grupoId} AND jogador_id = ${id} AND id = ${periodoId}`.execute(db);
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_periodo_corrigido',
    entidade: 'jogador',
    entidadeId: id,
    resumo: {
      periodoId,
      antes: { inicio: antes.inicio, fim: antes.fim },
      depois: { inicio: depois.inicio, fim: depois.fim },
    },
  });
  return { resultado: 'ok', alterado: true };
}

export type ResultadoAlterarInicio =
  | { resultado: 'ok'; alterado: boolean }
  | { resultado: 'nao_encontrado' }
  | { resultado: 'invalido'; regra: RegraInicio; campo: 'data'; mensagem: string };

/**
 * Altera a data de início da pontuação (GEL-77): com a mesma trava, avalia no domínio (GEL-78 a GEL-82), grava
 * `inicio_pontuacao`, move o início do primeiro período quando a data recua para antes dele (GEL-81, sem mexer nos
 * encerrados) e audita `jogador_inicio_alterado` com a data anterior e a nova. Data igual à atual não grava nem audita
 * (GEL-82). Com a criação, é o único escritor de `inicio_pontuacao` (GEL-83, checagem da T45).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - recuo para antes do primeiro período: grava a data e move o início do primeiro período para ela;
 * - avanço dentro do primeiro período: grava só `inicio_pontuacao`; o período fica como está;
 * - data igual à atual: `ok` com `alterado: false`, sem `UPDATE` nem auditoria;
 * - primeiro período aberto: sem saída, só valem o piso e o futuro;
 * - depois da saída do primeiro período, antes do piso ou no futuro: `invalido` com a mensagem do domínio;
 * - jogador de outro grupo: `nao_encontrado`;
 * - erro depois do `UPDATE`: sobe, e a transação da requisição desfaz tudo (GEL-109).
 */
async function alterarInicio(
  db: Db,
  grupoId: string,
  id: string,
  dados: InicioCorpo,
  hoje: string,
): Promise<ResultadoAlterarInicio> {
  const estado = await travarParaPeriodo(db, grupoId, id);
  if (!estado) return { resultado: 'nao_encontrado' };

  const r = avaliarInicio({
    periodos: estado.periodos,
    inicioPontuacao: estado.inicioPontuacao,
    novaData: dados.data,
    hoje,
  });
  if (!r.ok) return { resultado: 'invalido', regra: r.regra, campo: r.campo, mensagem: r.mensagem };
  if (!r.alterado) return { resultado: 'ok', alterado: false };

  await sql`
    UPDATE jogadores SET inicio_pontuacao = ${r.inicioPontuacao}::date, alterado_por = app_conta_id(), alterado_em = now()
     WHERE grupo_id = ${grupoId} AND id = ${id}`.execute(db);
  const primeiroAntes = estado.periodos[0];
  const primeiroDepois = r.periodos[0];
  if (primeiroAntes && primeiroDepois && primeiroDepois.inicio !== primeiroAntes.inicio) {
    await sql`
      UPDATE periodos_ativos SET inicio = ${primeiroDepois.inicio}::date
       WHERE grupo_id = ${grupoId} AND jogador_id = ${id} AND id = ${primeiroAntes.id}`.execute(db);
  }
  await auditoria.registrar(db, grupoId, {
    acao: 'jogador_inicio_alterado',
    entidade: 'jogador',
    entidadeId: id,
    resumo: { anterior: r.anterior, nova: r.inicioPontuacao },
  });
  return { resultado: 'ok', alterado: true };
}

// ---------------------------------------------------------------- partidas (T29 da partidas-e-ranking)

/**
 * Trava os jogadores do grupo com os ids dados (`FOR UPDATE`), numa consulta e sempre em ordem crescente de id
 * (PAR-29, AD-038): dois lançamentos ou edições que marcam os mesmos jogadores em ordens diferentes travam na mesma
 * ordem e não fazem deadlock. Devolve os ids travados, em ordem crescente; id de outro grupo, inexistente ou que a
 * conta não vê não é travado nem devolvido (a validação das marcações o recusa depois, PAR-24).
 *
 * Casos limite (Domínio: sim), listados antes do código:
 * - lista vazia: nenhuma consulta, nenhuma trava;
 * - id repetido: travado uma vez, devolvido uma vez (o domínio aponta a repetição, PAR-25);
 * - id de outro grupo: fora da trava e do resultado;
 * - duas conexões com [B, A] e [A, B]: a segunda espera a primeira, sem deadlock.
 */
async function travarVarios(db: Db, grupoId: string, ids: readonly string[]): Promise<string[]> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return [];
  const r = await sql<{ id: string }>`
    SELECT id FROM jogadores
     WHERE grupo_id = ${grupoId} AND id = ANY (${unicos}::uuid[])
     ORDER BY id
       FOR UPDATE`.execute(db);
  return r.rows.map((l) => l.id);
}

export interface JogadorAtivoNaData {
  id: string;
  apelido: string;
}

/**
 * Jogadores do grupo ativos na data (PAR-27): algum período [início, fim) a contém, isto é, `inicio <= data` e `fim`
 * nulo ou depois da data. No dia da saída o jogador já não está ativo. Só leitura de `periodos_ativos`: não é escrita
 * de período (a checagem da T45 da grupos-e-elenco só olha escritas). Em ordem de apelido.
 */
async function ativosNaData(db: Db, grupoId: string, data: string): Promise<JogadorAtivoNaData[]> {
  const r = await sql<JogadorAtivoNaData>`
    SELECT j.id, j.apelido
      FROM jogadores j
     WHERE j.grupo_id = ${grupoId}
       AND EXISTS (SELECT 1 FROM periodos_ativos p
                    WHERE p.grupo_id = j.grupo_id AND p.jogador_id = j.id
                      AND p.inicio <= ${data}::date AND (p.fim IS NULL OR p.fim > ${data}::date))
     ORDER BY j.apelido, j.id`.execute(db);
  return r.rows;
}

export const jogadores = {
  criar,
  inativar,
  reativar,
  corrigirPeriodo,
  alterarInicio,
  travarVarios,
  ativosNaData,
  lerParaPrevia,
};
