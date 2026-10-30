import {
  avaliarInicio,
  avaliarPeriodos,
  calcularNivel,
  compararApelido,
  type CampoPeriodo,
  type PresencaJogador,
} from '@pelada/dominio';
import { sql } from 'kysely';
import type { Db } from '../index.ts';
import type { Posicao } from '../tipos.ts';
import * as auditoria from './auditoria.ts';

// Jogadores do grupo (grupos-e-elenco, design C5; GEL-31 a GEL-50, GEL-84, GEL-85). Todo acesso filtra por
// `grupo_id` e roda sob a RLS da conta da requisição. É o único escritor de `periodos_ativos` e de
// `jogadores.inicio_pontuacao` (GEL-83, GEL-111).

export type Situacao = 'ativo' | 'inativo';

/** Item da lista (GEL-46): ativo = período aberto (GEL-50); `desde` = início da situação atual. */
export interface JogadorResumo {
  id: string;
  apelido: string;
  /** Nula só em dado antigo anonimizado; o cadastro novo exige a posição. */
  posicao: Posicao | null;
  situacao: Situacao;
  /** Ativo: início do período aberto. Inativo: a última saída. */
  desde: string;
  /** Média das notas × 100 (GEL-101); 550 sem nota (GEL-102). */
  nivel: number;
  semNota: boolean;
}

export interface PeriodoLido {
  id: string;
  inicio: string;
  fim: string | null;
}

export interface NotaLida {
  habilidadeId: string;
  habilidade: string;
  /** Nula onde a habilidade ainda não tem nota. */
  nota: number | null;
}

/** Ficha do jogador: os dados, os períodos em ordem e a nota de cada habilidade do grupo, na ordem de cadastro. */
export interface JogadorLido extends JogadorResumo {
  anoNascimento: number | null;
  telefone: string | null;
  pontuacaoInicial: number;
  inicioPontuacao: string;
  periodos: PeriodoLido[];
  notas: NotaLida[];
}

/** Data de criação no calendário de São Paulo: só para o `desde` de quem não tem período (dado antigo). */
const criadoEmSaoPaulo = sql<string>`((j.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)::text`;

/**
 * `desde` (GEL-46, GEL-50): com período aberto, o início dele; sem, a última saída. PREMISSA: jogador sem nenhum
 * período (só em dado antigo; o cadastro sempre abre um) usa a data de início da pontuação ou, sem ela, a da criação.
 */
function situacaoDe(linha: {
  aberto_desde: string | null;
  ultima_saida: string | null;
  inicio_pontuacao: string | null;
  criado_em_sp: string;
}): { situacao: Situacao; desde: string } {
  if (linha.aberto_desde !== null) return { situacao: 'ativo', desde: linha.aberto_desde };
  return { situacao: 'inativo', desde: linha.ultima_saida ?? linha.inicio_pontuacao ?? linha.criado_em_sp };
}

/** Jogadores do grupo com período aberto e última saída, numa consulta só. */
function consultarJogadores(db: Db, grupoId: string) {
  return db
    .selectFrom('jogadores as j')
    .select([
      'j.id',
      'j.apelido',
      'j.posicao',
      'j.ano_nascimento',
      'j.telefone',
      'j.pontuacao_inicial',
      'j.inicio_pontuacao',
      criadoEmSaoPaulo.as('criado_em_sp'),
    ])
    .select((eb) => [
      eb
        .selectFrom('periodos_ativos as p')
        .select('p.inicio')
        .whereRef('p.jogador_id', '=', 'j.id')
        .where('p.fim', 'is', null)
        .as('aberto_desde'),
      eb
        .selectFrom('periodos_ativos as p')
        .select((e) => e.fn.max('p.fim').as('fim'))
        .whereRef('p.jogador_id', '=', 'j.id')
        .as('ultima_saida'),
    ])
    .where('j.grupo_id', '=', grupoId);
}

/**
 * Todos os jogadores do grupo (GEL-46), em ordem de apelido sem acento nem caixa (GEL-47), com situação (GEL-50) e
 * nível pelo domínio (GEL-101, GEL-102). Duas consultas, qualquer que seja o tamanho do elenco: os jogadores e as
 * notas do grupo.
 */
export async function listar(db: Db, grupoId: string): Promise<JogadorResumo[]> {
  const linhas = await consultarJogadores(db, grupoId).execute();
  const notas = await db.selectFrom('notas').select(['jogador_id', 'valor']).where('grupo_id', '=', grupoId).execute();
  const porJogador = new Map<string, number[]>();
  for (const n of notas) {
    const lista = porJogador.get(n.jogador_id);
    if (lista) lista.push(n.valor);
    else porJogador.set(n.jogador_id, [n.valor]);
  }
  return linhas
    .map((l): JogadorResumo => ({
      id: l.id,
      apelido: l.apelido,
      posicao: l.posicao,
      ...situacaoDe(l),
      ...calcularNivel(porJogador.get(l.id) ?? []),
    }))
    .sort(compararApelido);
}

/** A ficha do jogador do grupo; de outro grupo (ou inexistente), nulo (GEL-44). */
export async function ler(db: Db, grupoId: string, jogadorId: string): Promise<JogadorLido | null> {
  const l = await consultarJogadores(db, grupoId).where('j.id', '=', jogadorId).executeTakeFirst();
  if (!l) return null;
  const periodos = await db
    .selectFrom('periodos_ativos')
    .select(['id', 'inicio', 'fim'])
    .where('grupo_id', '=', grupoId)
    .where('jogador_id', '=', jogadorId)
    .orderBy('inicio')
    .execute();
  const notas = await db
    .selectFrom('habilidades as h')
    .leftJoin('notas as n', (j) =>
      j.onRef('n.habilidade_id', '=', 'h.id').onRef('n.grupo_id', '=', 'h.grupo_id').on('n.jogador_id', '=', jogadorId),
    )
    .select(['h.id', 'h.nome', 'n.valor'])
    .where('h.grupo_id', '=', grupoId)
    .orderBy('h.ordem')
    .execute();
  const valores = notas.flatMap((n) => (n.valor === null ? [] : [n.valor]));
  return {
    id: l.id,
    apelido: l.apelido,
    posicao: l.posicao,
    ...situacaoDe(l),
    ...calcularNivel(valores),
    anoNascimento: l.ano_nascimento,
    telefone: l.telefone,
    pontuacaoInicial: l.pontuacao_inicial,
    // Nula em dado antigo = início do primeiro período (comentário da coluna na linha de base).
    inicioPontuacao: l.inicio_pontuacao ?? periodos[0]?.inicio ?? l.criado_em_sp,
    periodos,
    notas: notas.map((n) => ({ habilidadeId: n.id, habilidade: n.nome, nota: n.valor })),
  };
}

const MENSAGEM_APELIDO_REPETIDO = 'Já existe um jogador com esse apelido neste grupo.';

/** Dados do cadastro e da edição, já validados pelo contrato (apelido sem os espaços das pontas). */
export interface DadosJogador {
  apelido: string;
  anoNascimento: number;
  posicao: Posicao;
  telefone: string | null;
  pontuacaoInicial: number;
}

/** Recusa de um campo, com a mensagem que a tela mostra ao lado dele. */
export interface Recusa<C extends string = string> {
  ok: false;
  campo: C;
  mensagem: string;
}

const apelidoRepetido: Recusa<'apelido'> = { ok: false, campo: 'apelido', mensagem: MENSAGEM_APELIDO_REPETIDO };

/** Erro do pg com o código SQLSTATE e o nome da constraint. */
const violouApelido = (erro: unknown): boolean => {
  const e = erro as { code?: string; constraint?: string } | null;
  return e?.code === '23505' && e.constraint === 'jogadores_apelido_grupo';
};

/** Outro jogador do grupo com o mesmo apelido, ignorando a caixa; acentos contam (GEL-35, mesmo critério do índice). */
async function apelidoEmUso(db: Db, grupoId: string, apelido: string, exceto?: string): Promise<boolean> {
  let consulta = db
    .selectFrom('jogadores')
    .select('id')
    .where('grupo_id', '=', grupoId)
    .where(sql<string>`lower(apelido)`, '=', sql<string>`lower(${apelido})`);
  if (exceto) consulta = consulta.where('id', '<>', exceto);
  return (await consulta.executeTakeFirst()) !== undefined;
}

/**
 * Cadastra o jogador (GEL-31, GEL-32, GEL-35, GEL-38, GEL-45): o jogador, o primeiro período aberto e
 * `inicio_pontuacao` na data de entrada (sem ela, `hoje`), e a auditoria `jogador_criado` sem telefone nem ano
 * (GEL-113). Apelido repetido é recusado pela consulta e, na corrida que passar dela, pelo índice único
 * `jogadores_apelido_grupo` (23505), com a mesma recusa.
 */
export async function criar(
  db: Db,
  grupoId: string,
  dados: DadosJogador & { dataEntrada?: string | undefined },
  hoje: string,
): Promise<{ ok: true; id: string } | Recusa<'apelido'>> {
  if (await apelidoEmUso(db, grupoId, dados.apelido)) return apelidoRepetido;
  const dataEntrada = dados.dataEntrada ?? hoje;
  let id: string;
  try {
    const linha = await db
      .insertInto('jogadores')
      .values({
        grupo_id: grupoId,
        apelido: dados.apelido,
        ano_nascimento: dados.anoNascimento,
        posicao: dados.posicao,
        telefone: dados.telefone,
        pontuacao_inicial: dados.pontuacaoInicial,
        inicio_pontuacao: dataEntrada,
        criado_por: sql<string>`app_conta_id()`,
        criado_em: sql<Date>`now()`,
        alterado_por: sql<string>`app_conta_id()`,
        alterado_em: sql<Date>`now()`,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    id = linha.id;
  } catch (erro) {
    if (violouApelido(erro)) return apelidoRepetido;
    throw erro;
  }
  await db.insertInto('periodos_ativos').values({ grupo_id: grupoId, jogador_id: id, inicio: dataEntrada }).execute();
  await auditoria.registrar(db, grupoId, 'jogador_criado', 'jogador', id, {
    dataEntrada,
    pontuacaoInicial: dados.pontuacaoInicial,
  });
  return { ok: true, id };
}

/** Trava a linha do jogador do grupo até o fim da transação (`FOR UPDATE`); de outro grupo, nula. */
function travar(db: Db, grupoId: string, jogadorId: string) {
  return db
    .selectFrom('jogadores')
    .select(['id', 'apelido', 'pontuacao_inicial', 'inicio_pontuacao', 'ano_nascimento', 'posicao', 'telefone'])
    .where('grupo_id', '=', grupoId)
    .where('id', '=', jogadorId)
    .forUpdate()
    .executeTakeFirst();
}

/** Campos cadastrais cuja mudança a edição audita (SEC-008), na ordem em que aparecem no evento. */
type CampoEditado = 'apelido' | 'posicao' | 'telefone' | 'anoNascimento';

/**
 * Nomes dos campos que a edição muda, entre apelido, posição, telefone e ano de nascimento (SEC-008). Só os nomes vão
 * para a auditoria, nunca os valores (GEL-113). Trocar só a caixa do apelido conta como mudança.
 */
function camposEditados(
  atual: { apelido: string; posicao: string | null; telefone: string | null; ano_nascimento: number | null },
  dados: Omit<DadosJogador, 'pontuacaoInicial'>,
): CampoEditado[] {
  const mudou: [CampoEditado, boolean][] = [
    ['apelido', dados.apelido !== atual.apelido],
    ['posicao', dados.posicao !== atual.posicao],
    ['telefone', (dados.telefone ?? null) !== atual.telefone],
    ['anoNascimento', dados.anoNascimento !== atual.ano_nascimento],
  ];
  return mudou.filter(([, sim]) => sim).map(([campo]) => campo);
}

/**
 * Edita os dados cadastrais (GEL-41): apelido, ano, posição, telefone e pontuação inicial. Pontuação omitida mantém a
 * atual (GEL-43); mudada, audita `jogador_pontuacao_inicial_alterada` com o valor anterior e o novo (GEL-42). Não mexe
 * em `inicio_pontuacao` nem nos períodos. Mudar apelido, posição, telefone ou ano audita `jogador_editado` com os nomes
 * dos campos (SEC-008). Jogador de outro grupo: nulo (GEL-44).
 */
export async function editar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  dados: Omit<DadosJogador, 'pontuacaoInicial'> & { pontuacaoInicial?: number | undefined },
): Promise<{ ok: true } | Recusa<'apelido'> | null> {
  const atual = await travar(db, grupoId, jogadorId);
  if (!atual) return null;
  if (await apelidoEmUso(db, grupoId, dados.apelido, jogadorId)) return apelidoRepetido;
  const pontuacao = dados.pontuacaoInicial ?? atual.pontuacao_inicial;
  try {
    await db
      .updateTable('jogadores')
      .set({
        apelido: dados.apelido,
        ano_nascimento: dados.anoNascimento,
        posicao: dados.posicao,
        telefone: dados.telefone,
        pontuacao_inicial: pontuacao,
        alterado_por: sql<string>`app_conta_id()`,
        alterado_em: sql<Date>`now()`,
      })
      .where('grupo_id', '=', grupoId)
      .where('id', '=', jogadorId)
      .execute();
  } catch (erro) {
    if (violouApelido(erro)) return apelidoRepetido;
    throw erro;
  }
  if (pontuacao !== atual.pontuacao_inicial) {
    await auditoria.registrar(db, grupoId, 'jogador_pontuacao_inicial_alterada', 'jogador', jogadorId, {
      anterior: atual.pontuacao_inicial,
      novo: pontuacao,
    });
  }
  const campos = camposEditados(atual, dados);
  if (campos.length > 0) {
    await auditoria.registrar(db, grupoId, 'jogador_editado', 'jogador', jogadorId, { campos });
  }
  return { ok: true };
}

export interface ComHistorico {
  ok: false;
  codigo: 'jogador_com_historico';
  apelido: string;
}

/**
 * Exclui o jogador sem histórico (GEL-84): apaga o jogador e, pela chave com cascade, os períodos, e audita
 * `jogador_excluido` só com o id. Com presença, nota ou pagamento mensal, recusa com `jogador_com_historico` sem
 * apagar nada (GEL-85). A trava do jogador faz uma presença nova esperar a exclusão terminar. De outro grupo: nulo.
 */
export async function excluir(db: Db, grupoId: string, jogadorId: string): Promise<{ ok: true } | ComHistorico | null> {
  const atual = await travar(db, grupoId, jogadorId);
  if (!atual) return null;
  const comHistorico: ComHistorico = { ok: false, codigo: 'jogador_com_historico', apelido: atual.apelido };
  const historico = await db
    .selectNoFrom((eb) => [
      eb
        .exists(
          eb
            .selectFrom('presencas')
            .select('jogador_id')
            .where('grupo_id', '=', grupoId)
            .where('jogador_id', '=', jogadorId),
        )
        .as('presenca'),
      eb
        .exists(
          eb
            .selectFrom('notas')
            .select('jogador_id')
            .where('grupo_id', '=', grupoId)
            .where('jogador_id', '=', jogadorId),
        )
        .as('nota'),
      eb
        .exists(
          eb
            .selectFrom('pagamentos_mes')
            .select('jogador_id')
            .where('grupo_id', '=', grupoId)
            .where('jogador_id', '=', jogadorId),
        )
        .as('pagamento'),
    ])
    .executeTakeFirstOrThrow();
  if (historico.presenca || historico.nota || historico.pagamento) return comHistorico;
  await db.deleteFrom('jogadores').where('grupo_id', '=', grupoId).where('id', '=', jogadorId).execute();
  await auditoria.registrar(db, grupoId, 'jogador_excluido', 'jogador', jogadorId);
  return { ok: true };
}

/** Recusa de uma regra de período, no campo do domínio (`saida`, `retorno` ou `data`, GEL-58, GEL-62 a GEL-69). */
export type RecusaPeriodo = Recusa<CampoPeriodo | 'data'>;

/** Jogador travado e o que as regras de período leem: períodos, presenças e início da pontuação. */
interface Travado {
  apelido: string;
  periodos: PeriodoLido[];
  presencas: PresencaJogador[];
  inicioPontuacao: string;
  inicioPontuacaoGravado: string | null;
}

/**
 * Trava o jogador (`FOR UPDATE`) e só então lê os períodos e as presenças (data da partida e situação) (GEL-109):
 * uma segunda escrita de período do mesmo jogador espera a trava e é avaliada sobre o que a primeira gravou
 * (GEL-110). De outro grupo, nulo.
 */
async function travarParaPeriodo(db: Db, grupoId: string, jogadorId: string, hoje: string): Promise<Travado | null> {
  const j = await travar(db, grupoId, jogadorId);
  if (!j) return null;
  const periodos = await db
    .selectFrom('periodos_ativos')
    .select(['id', 'inicio', 'fim'])
    .where('grupo_id', '=', grupoId)
    .where('jogador_id', '=', jogadorId)
    .orderBy('inicio')
    .execute();
  const presencas = await db
    .selectFrom('presencas as pr')
    .innerJoin('partidas as pa', (jn) =>
      jn.onRef('pa.id', '=', 'pr.partida_id').onRef('pa.grupo_id', '=', 'pr.grupo_id'),
    )
    .select(['pa.data', 'pr.situacao'])
    .where('pr.grupo_id', '=', grupoId)
    .where('pr.jogador_id', '=', jogadorId)
    .execute();
  return {
    apelido: j.apelido,
    periodos,
    presencas,
    // Nula em dado antigo = início do primeiro período; sem período nenhum, a regra que a usa não se aplica.
    inicioPontuacao: j.inicio_pontuacao ?? periodos[0]?.inicio ?? hoje,
    inicioPontuacaoGravado: j.inicio_pontuacao,
  };
}

export type ResultadoInativar = { ok: true } | { ok: false; codigo: 'ja_inativo' } | RecusaPeriodo | null;

/**
 * Inativa o jogador ativo (GEL-51 a GEL-53, GEL-58, GEL-109): com a linha travada, avalia a saída (sem data, `hoje`)
 * pelas regras de período do domínio, encerra o período aberto nessa data e audita `jogador_inativado` na mesma
 * transação. Já inativo: `ja_inativo`, sem alterar nada. De outro grupo: nulo.
 */
export async function inativar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  data: string | undefined,
  hoje: string,
): Promise<ResultadoInativar> {
  const j = await travarParaPeriodo(db, grupoId, jogadorId, hoje);
  if (!j) return null;
  const aberto = j.periodos.find((p) => p.fim === null);
  if (!aberto) return { ok: false, codigo: 'ja_inativo' };
  const saida = data ?? hoje;
  const avaliacao = avaliarPeriodos({
    periodos: j.periodos,
    operacao: { tipo: 'inativar', data: saida },
    hoje,
    inicioPontuacao: j.inicioPontuacao,
    presencas: j.presencas,
  });
  if (!avaliacao.ok) return { ok: false, campo: avaliacao.campo, mensagem: avaliacao.mensagem };
  await db
    .updateTable('periodos_ativos')
    .set({ fim: saida })
    .where('grupo_id', '=', grupoId)
    .where('id', '=', aberto.id)
    .execute();
  await auditoria.registrar(db, grupoId, 'jogador_inativado', 'jogador', jogadorId, { periodo: aberto.id, saida });
  return { ok: true };
}

export type ResultadoReativar = { ok: true } | { ok: false; codigo: 'ja_ativo' } | RecusaPeriodo | null;

/**
 * Reativa o jogador inativo (GEL-54 a GEL-58): com a linha travada, avalia o retorno (sem data, `hoje`) e abre um
 * período novo a partir dele, sem mexer em `inicio_pontuacao` nem na pontuação inicial; audita `jogador_reativado`
 * com o retorno e a saída anterior. Já ativo: `ja_ativo`, sem alterar nada. De outro grupo: nulo.
 */
export async function reativar(
  db: Db,
  grupoId: string,
  jogadorId: string,
  data: string | undefined,
  hoje: string,
): Promise<ResultadoReativar> {
  const j = await travarParaPeriodo(db, grupoId, jogadorId, hoje);
  if (!j) return null;
  if (j.periodos.some((p) => p.fim === null)) return { ok: false, codigo: 'ja_ativo' };
  const retorno = data ?? hoje;
  const avaliacao = avaliarPeriodos({
    periodos: j.periodos,
    operacao: { tipo: 'reativar', data: retorno },
    hoje,
    inicioPontuacao: j.inicioPontuacao,
    presencas: j.presencas,
  });
  if (!avaliacao.ok) return { ok: false, campo: avaliacao.campo, mensagem: avaliacao.mensagem };
  await db
    .insertInto('periodos_ativos')
    .values({ grupo_id: grupoId, jogador_id: jogadorId, inicio: retorno })
    .execute();
  const saidas = j.periodos.flatMap((p) => (p.fim === null ? [] : [p.fim])).sort();
  await auditoria.registrar(db, grupoId, 'jogador_reativado', 'jogador', jogadorId, {
    retorno,
    saidaAnterior: saidas[saidas.length - 1] ?? null,
  });
  return { ok: true };
}

export type ResultadoCorrigir = { ok: true; alterado: boolean; periodos: PeriodoLido[] } | RecusaPeriodo | null;

/**
 * Corrige a saída e/ou o retorno de um período (GEL-71 a GEL-75): com a linha travada, avalia pelas regras de período
 * (inclusive o campo corrigível, GEL-72 e GEL-73), grava e audita `jogador_periodo_corrigido` com as datas antes e
 * depois. Datas iguais às atuais: `alterado: false`, sem gravar nem auditar (GEL-74). Período que não é do jogador
 * do grupo, ou jogador de outro grupo: nulo (GEL-75).
 */
export async function corrigirPeriodo(
  db: Db,
  grupoId: string,
  jogadorId: string,
  periodoId: string,
  datas: { saida?: string | undefined; retorno?: string | undefined },
  hoje: string,
): Promise<ResultadoCorrigir> {
  const j = await travarParaPeriodo(db, grupoId, jogadorId, hoje);
  if (!j) return null;
  const antes = j.periodos.find((p) => p.id === periodoId);
  if (!antes) return null;
  const avaliacao = avaliarPeriodos({
    periodos: j.periodos,
    operacao: {
      tipo: 'corrigir',
      periodoId,
      ...(datas.saida !== undefined ? { saida: datas.saida } : {}),
      ...(datas.retorno !== undefined ? { retorno: datas.retorno } : {}),
    },
    hoje,
    inicioPontuacao: j.inicioPontuacao,
    presencas: j.presencas,
  });
  if (!avaliacao.ok) return { ok: false, campo: avaliacao.campo, mensagem: avaliacao.mensagem };
  if (!avaliacao.alterado) return { ok: true, alterado: false, periodos: j.periodos };
  const depois = { inicio: datas.retorno ?? antes.inicio, fim: datas.saida ?? antes.fim };
  await db
    .updateTable('periodos_ativos')
    .set(depois)
    .where('grupo_id', '=', grupoId)
    .where('id', '=', periodoId)
    .execute();
  await auditoria.registrar(db, grupoId, 'jogador_periodo_corrigido', 'jogador', jogadorId, {
    periodo: periodoId,
    saidaAnterior: antes.fim,
    saidaNova: depois.fim,
    retornoAnterior: antes.inicio,
    retornoNovo: depois.inicio,
  });
  const periodos = j.periodos
    .map((p) => (p.id === periodoId ? { ...p, ...depois } : p))
    .sort((a, b) => (a.inicio < b.inicio ? -1 : a.inicio > b.inicio ? 1 : 0));
  return { ok: true, alterado: true, periodos };
}

export type ResultadoInicio = { ok: true; alterado: boolean } | Recusa<'data'> | null;

/**
 * Altera a data de início da pontuação (GEL-77 a GEL-82): único escritor de `inicio_pontuacao` além do cadastro
 * (GEL-83). Com a linha travada, avalia pelo domínio; data anterior ao início do primeiro período o recua, sem mudar
 * os períodos encerrados (GEL-81). Audita `jogador_inicio_alterado` com a anterior e a nova. Igual à atual: sem gravar
 * nem auditar (GEL-82). De outro grupo: nulo.
 */
export async function alterarInicio(
  db: Db,
  grupoId: string,
  jogadorId: string,
  data: string,
  hoje: string,
): Promise<ResultadoInicio> {
  const j = await travarParaPeriodo(db, grupoId, jogadorId, hoje);
  if (!j) return null;
  const avaliacao = avaliarInicio({ data, periodos: j.periodos, inicioAtual: j.inicioPontuacao, hoje });
  if (!avaliacao.ok) return { ok: false, campo: 'data', mensagem: avaliacao.mensagem };
  if (!avaliacao.alterado) return { ok: true, alterado: false };
  await db
    .updateTable('jogadores')
    .set({ inicio_pontuacao: data, alterado_por: sql<string>`app_conta_id()`, alterado_em: sql<Date>`now()` })
    .where('grupo_id', '=', grupoId)
    .where('id', '=', jogadorId)
    .execute();
  const primeiro = j.periodos[0];
  if (avaliacao.recuarPrimeiroPeriodo && primeiro) {
    await db
      .updateTable('periodos_ativos')
      .set({ inicio: data })
      .where('grupo_id', '=', grupoId)
      .where('id', '=', primeiro.id)
      .execute();
  }
  await auditoria.registrar(db, grupoId, 'jogador_inicio_alterado', 'jogador', jogadorId, {
    anterior: j.inicioPontuacao,
    nova: data,
  });
  return { ok: true, alterado: true };
}
