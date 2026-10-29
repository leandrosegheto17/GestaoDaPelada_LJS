import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { abrirTransacaoDaRequisicao, type Db } from '../index.ts';
import type { Posicao } from '../tipos.ts';
import * as grupos from './grupos.ts';
import * as jogadores from './jogadores.ts';
import * as notas from './notas.ts';

export interface JogadorDoSeed {
  apelido: string;
  posicao: string;
  anoNascimento: number;
}

export interface DadosDoSeed {
  grupo: { nome: string; slug: string; diaSemana: string; horario: string };
  admin: { email: string; nome: string };
  jogadores: readonly JogadorDoSeed[];
  /** Datas das partidas (AAAA-MM-DD), em ordem. */
  partidas: readonly string[];
  /** Momento fixo gravado nas colunas de auditoria das linhas que o seed grava direto (conta e partidas). */
  momento: string;
}

export interface SenhasDasRoles {
  app: string;
  backup: string;
  /** Senha da conta admin do seed (SEED_SENHA_ADMIN); a conta entra pela tela com ela (ACE-64). */
  admin: string;
}

export interface ResumoDoSeed {
  grupos: number;
  contas: number;
  jogadores: number;
  /** Jogadores sem período aberto (o último da lista, com dois períodos encerrados). */
  inativos: number;
  notas: number;
  partidas: number;
  presencas: number;
}

/**
 * Quantos jogadores, do começo da lista, recebem nota em todas as habilidades (o resto fica "sem nota").
 * SPEC_DEVIATION (T52): a tarefa fala em 4 jogadores; o seed continua com os 20 de `dados.ts`, que o teste do
 * FUN-05 já exige (mudar esse teste pede aprovação). O que a T52 pede está neles: um inativo com dois períodos,
 * notas, e jogadores sem nota.
 */
const COM_NOTA = 10;

/**
 * Semeia o banco local (já migrado) numa transação só, como o owner, com a conta admin no contexto de RLS: apaga o que
 * o seed gravou antes, cria a conta admin, o grupo pela `grupo_criar` (vínculo, habilidades iniciais e auditoria,
 * GEL-01), os jogadores e as escritas de período pelo repositório de jogadores (o único escritor de período, GEL-111),
 * as notas pelo repositório de notas, as partidas e as presenças, e define a senha de login de pelada_app e
 * pelada_backup_ro. O último jogador da lista sai, volta e sai de novo: fica inativo com dois períodos e sem presença.
 * Quem chama passa antes pela trava de host.
 */
export async function semearBancoLocal(url: string, dados: DadosDoSeed, senhas: SenhasDasRoles): Promise<ResumoDoSeed> {
  // A conta nasce dentro da transação: o id é escolhido antes, para o contexto de RLS (`app.conta_id`) já ser ela.
  const conta = randomUUID();
  const transacao = abrirTransacaoDaRequisicao({
    connectionString: () => url,
    somenteLeitura: false,
    contexto: () => ({ contaId: conta }),
  });
  try {
    const resumo = await semear(transacao.db, conta, dados, senhas);
    await transacao.terminar(true);
    return resumo;
  } catch (erro) {
    await transacao.terminar(false).catch(() => undefined);
    throw erro;
  } finally {
    await transacao.fechar();
  }
}

/** "Hoje" do seed: o dia da última partida. Fixo, para o seed ser determinístico. */
const hojeDoSeed = (dados: DadosDoSeed) => dados.partidas[dados.partidas.length - 1] ?? dados.momento.slice(0, 10);

async function semear(db: Db, conta: string, dados: DadosDoSeed, senhas: SenhasDasRoles): Promise<ResumoDoSeed> {
  await apagarDoSeed(db, dados);
  const hoje = hojeDoSeed(dados);
  const entrada = dados.partidas[0] ?? hoje;

  // Nasce com hash inválido e logo recebe a senha pela função do owner (confirma o e-mail).
  await sql`INSERT INTO contas (id, email, nome, senha_hash, criada_em)
            VALUES (${conta}, ${dados.admin.email}, ${dados.admin.nome}, '!', ${dados.momento})`.execute(db);
  await sql`SELECT conta_definir_senha(${dados.admin.email}, ${senhas.admin}, false)`.execute(db);

  const grupo = await grupos.criar(
    db,
    {
      nome: dados.grupo.nome,
      diaSemana: dados.grupo.diaSemana as grupos.DadosGrupo['diaSemana'],
      frequencia: 'semanal',
      horario: dados.grupo.horario,
    },
    dados.grupo.slug,
  );
  if (grupo.slug !== dados.grupo.slug) throw new Error(`O slug ${dados.grupo.slug} já é de outro grupo.`);

  const ids: string[] = [];
  for (const j of dados.jogadores) {
    const criado = await jogadores.criar(
      db,
      grupo.id,
      {
        apelido: j.apelido,
        anoNascimento: j.anoNascimento,
        posicao: j.posicao as Posicao,
        telefone: null,
        pontuacaoInicial: 0,
        dataEntrada: entrada,
      },
      hoje,
    );
    if (!criado.ok) throw new Error(`Jogador do seed recusado: ${criado.mensagem}`);
    ids.push(criado.id);
  }

  // O último sai, volta e sai de novo, antes de qualquer partida em que estaria: inativo com dois períodos.
  const inativo = ids[ids.length - 1];
  if (inativo) {
    for (const passo of [
      () => jogadores.inativar(db, grupo.id, inativo, somarDias(entrada, 2), hoje),
      () => jogadores.reativar(db, grupo.id, inativo, somarDias(entrada, 9), hoje),
      () => jogadores.inativar(db, grupo.id, inativo, somarDias(entrada, 13), hoje),
    ]) {
      const r = await passo();
      if (!r?.ok) throw new Error(`Período do seed recusado: ${JSON.stringify(r)}`);
    }
  }

  const habilidades = await db
    .selectFrom('habilidades')
    .select('id')
    .where('grupo_id', '=', grupo.id)
    .orderBy('ordem')
    .execute();
  let totalNotas = 0;
  const comNota = [...ids.slice(0, COM_NOTA), ...(inativo ? [inativo] : [])];
  for (const [j, jogador] of comNota.entries()) {
    for (const [h, habilidade] of habilidades.entries()) {
      // Notas de 1 a 10, determinísticas e variadas, para os níveis não saírem iguais.
      await notas.salvar(db, grupo.id, jogador, habilidade.id, ((j * 3 + h * 5) % 10) + 1);
      totalNotas++;
    }
  }

  let presencas = 0;
  for (const [p, data] of dados.partidas.entries()) {
    const { rows } = await sql<{ id: string }>`
      INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
      VALUES (${grupo.id}, ${data}, ${p % 4 === 1}, ${conta}, ${dados.momento}, ${conta}, ${dados.momento})
      RETURNING id`.execute(db);
    const partida = rows[0]!.id;
    for (const [j, jogador] of ids.entries()) {
      // Um em cada cinco falta, de forma determinística, para o ranking não sair empatado; o inativo não joga.
      if ((p + j) % 5 === 0 || jogador === inativo) continue;
      await sql`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao)
                VALUES (${partida}, ${jogador}, ${grupo.id}, 'presente')`.execute(db);
      presencas++;
    }
  }

  await sql.raw(`ALTER ROLE pelada_app LOGIN PASSWORD ${literal(senhas.app)}`).execute(db);
  await sql.raw(`ALTER ROLE pelada_backup_ro LOGIN PASSWORD ${literal(senhas.backup)}`).execute(db);
  return {
    grupos: 1,
    contas: 1,
    jogadores: ids.length,
    inativos: inativo ? 1 : 0,
    notas: totalNotas,
    partidas: dados.partidas.length,
    presencas,
  };
}

/** Literal de texto do SQL, com as aspas simples dobradas (o ALTER ROLE não aceita parâmetro). */
const literal = (texto: string) => `'${texto.replaceAll("'", "''")}'`;

/** `AAAA-MM-DD` mais `n` dias, no calendário (sem fuso). */
function somarDias(data: string, n: number): string {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Apaga o grupo do seed (e tudo o que depende dele) e a conta admin do seed, para o seed poder rodar de novo, também
 * depois de a conta ter entrado. Os períodos saem pela cascata de `jogadores`; a auditoria do grupo e a da conta, as
 * sessões e os links da conta saem antes da conta.
 */
async function apagarDoSeed(db: Db, dados: DadosDoSeed): Promise<void> {
  const slug = dados.grupo.slug;
  const doGrupo = sql`grupo_id IN (SELECT id FROM grupos WHERE slug = ${slug})`;
  for (const tabela of [
    'notas',
    'presencas',
    'partidas',
    'habilidades',
    'jogadores',
    'convites_admin',
    'vinculos_admin',
  ]) {
    await sql`DELETE FROM ${sql.table(tabela)} WHERE ${doGrupo}`.execute(db);
  }
  // O que a conta admin do seed gravou ao entrar (sessões, links, falhas de senha) prende a linha da conta.
  const daConta = sql`conta_id IN (SELECT id FROM contas WHERE email = ${dados.admin.email})`;
  for (const tabela of ['sessoes', 'links_conta', 'pedidos_reset', 'falhas_senha_atual']) {
    await sql`DELETE FROM ${sql.table(tabela)} WHERE ${daConta}`.execute(db);
  }
  await sql`DELETE FROM auditoria
             WHERE ${doGrupo} OR autor_conta_id IN (SELECT id FROM contas WHERE email = ${dados.admin.email})`.execute(
    db,
  );
  await sql`DELETE FROM grupos WHERE slug = ${slug}`.execute(db);
  await sql`DELETE FROM contas WHERE email = ${dados.admin.email}`.execute(db);
}
