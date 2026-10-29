import pg from 'pg';

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
  /** Momento fixo gravado nas colunas de auditoria das linhas (o seed é determinístico). */
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
  partidas: number;
  presencas: number;
}

/**
 * Semeia o banco local (já migrado) numa transação só, como o owner:
 * apaga o que o seed gravou antes, cria a conta admin, o grupo com vínculo, os jogadores, as partidas e
 * as presenças, e define a senha de login de pelada_app e pelada_backup_ro. Quem chama passa antes pela trava de host.
 */
export async function semearBancoLocal(url: string, dados: DadosDoSeed, senhas: SenhasDasRoles): Promise<ResumoDoSeed> {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('BEGIN');
    await apagarDoSeed(c, dados);

    const conta = await umId(
      c,
      // Nasce com hash inválido e logo recebe a senha pela função do owner (confirma o e-mail).
      "INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, $2, '!', $3) RETURNING id",
      [dados.admin.email, dados.admin.nome, dados.momento],
    );
    await c.query('SELECT conta_definir_senha($1, $2, false)', [dados.admin.email, senhas.admin]);
    const grupo = await umId(
      c,
      `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
       VALUES ($1, $2, $3, 'semanal', $4, $5, $6) RETURNING id`,
      [dados.grupo.nome, dados.grupo.slug, dados.grupo.diaSemana, dados.grupo.horario, conta, dados.momento],
    );
    await c.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
       VALUES ($1, $2, true, $1, $3)`,
      [conta, grupo, dados.momento],
    );

    const jogadores: string[] = [];
    for (const j of dados.jogadores) {
      const id = await umId(
        c,
        `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $5, $6) RETURNING id`,
        [grupo, j.apelido, j.anoNascimento, j.posicao, conta, dados.momento],
      );
      await c.query('INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, $3)', [
        id,
        grupo,
        dados.partidas[0],
      ]);
      jogadores.push(id);
    }

    let presencas = 0;
    for (const [p, data] of dados.partidas.entries()) {
      const partida = await umId(
        c,
        `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
         VALUES ($1, $2, $3, $4, $5, $4, $5) RETURNING id`,
        [grupo, data, p % 4 === 1, conta, dados.momento],
      );
      for (const [j, jogador] of jogadores.entries()) {
        // Um em cada cinco falta, de forma determinística, para o ranking não sair empatado.
        if ((p + j) % 5 === 0) continue;
        await c.query(
          "INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')",
          [partida, jogador, grupo],
        );
        presencas++;
      }
    }

    await c.query(`ALTER ROLE pelada_app LOGIN PASSWORD ${c.escapeLiteral(senhas.app)}`);
    await c.query(`ALTER ROLE pelada_backup_ro LOGIN PASSWORD ${c.escapeLiteral(senhas.backup)}`);
    await c.query('COMMIT');
    return { grupos: 1, contas: 1, jogadores: jogadores.length, partidas: dados.partidas.length, presencas };
  } catch (erro) {
    await c.query('ROLLBACK');
    throw erro;
  } finally {
    await c.end();
  }
}

async function umId(c: pg.ClientBase, sql: string, params: unknown[]): Promise<string> {
  const { rows } = await c.query<{ id: string }>(sql, params);
  return rows[0]!.id;
}

/** Apaga o grupo do seed (e tudo o que depende dele) e a conta admin do seed, para o seed poder rodar de novo. */
async function apagarDoSeed(c: pg.ClientBase, dados: DadosDoSeed): Promise<void> {
  const doGrupo = 'grupo_id IN (SELECT id FROM grupos WHERE slug = $1)';
  for (const tabela of ['presencas', 'periodos_ativos', 'partidas', 'jogadores', 'vinculos_admin']) {
    await c.query(`DELETE FROM ${tabela} WHERE ${doGrupo}`, [dados.grupo.slug]);
  }
  await c.query('DELETE FROM grupos WHERE slug = $1', [dados.grupo.slug]);
  await c.query('DELETE FROM contas WHERE email = $1', [dados.admin.email]);
}
