import type pg from 'pg';

/** Ids fixos de um grupo do cenário (o último dígito distingue A e B). */
export interface IdsDoGrupo {
  conta: string;
  grupo: string;
  slug: string;
  jogador: string;
  habilidade: string;
  partida: string;
  lancamento: string;
}

function ids(sufixo: '1' | '2', slug: string): IdsDoGrupo {
  const id = (prefixo: string) => `00000000-0000-0000-0000-0000000000${prefixo}${sufixo}`;
  return {
    conta: id('a'),
    grupo: id('b'),
    slug,
    jogador: id('c'),
    habilidade: id('d'),
    partida: id('e'),
    lancamento: id('f'),
  };
}

export const GRUPO_A = ids('1', 'grupo-a');
export const GRUPO_B = ids('2', 'grupo-b');

/**
 * Grava, como owner (sem RLS), dois grupos com contas diferentes e uma linha de cada grupo
 * em toda tabela que tem grupo_id, e uma linha de cada conta nas tabelas de conta (sessões, tentativas, links,
 * envios, pedidos de reset). A conta de cada grupo só tem vínculo com o próprio grupo.
 */
export async function gravarDoisGrupos(cliente: pg.ClientBase): Promise<void> {
  for (const g of [GRUPO_A, GRUPO_B]) {
    const { conta, grupo, slug, jogador, habilidade, partida, lancamento } = g;
    const comandos: [string, unknown[]][] = [
      [
        "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2 || '@exemplo.com', $2, 'x', now())",
        [conta, slug],
      ],
      [
        `INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ($1, 'Grupo ' || $2, $2, 'quarta', 'semanal', '20:00', $3, now())`,
        [grupo, slug, conta],
      ],
      [
        'INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em) VALUES ($1, $2, $1, now())',
        [conta, grupo],
      ],
      [
        `INSERT INTO jogadores (id, grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, $2, 'Craque ' || $3, 'meia', $4, now(), $4, now())`,
        [jogador, grupo, slug, conta],
      ],
      ["INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')", [jogador, grupo]],
      ["INSERT INTO habilidades (id, grupo_id, nome) VALUES ($1, $2, 'Chute')", [habilidade, grupo]],
      [
        'INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, 7)',
        [jogador, habilidade, grupo],
      ],
      [
        `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                                   lesionado_com_chuva, expulso, registrado_por, registrado_em)
         VALUES ($1, '2026-01-01', 3, 4, 1, 1, -1, $2, now())`,
        [grupo, conta],
      ],
      [
        `INSERT INTO partidas (id, grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
         VALUES ($1, $2, '2026-10-21', $3, now(), $3, now())`,
        [partida, grupo, conta],
      ],
      [
        "INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')",
        [partida, jogador, grupo],
      ],
      [
        "INSERT INTO eventos_uso (grupo_id, tipo, momento, data_partida) VALUES ($1, 'partida_lancada', now(), '2026-10-21')",
        [grupo],
      ],
      [
        `INSERT INTO escalacoes (grupo_id, data, formato, n, composicao, confirmada_por, confirmada_em)
         VALUES ($1, '2026-10-21', 'dois_times', 5, '{}', $2, now())`,
        [grupo, conta],
      ],
      [
        `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
         VALUES ($1, 5000, 0, '2026-01-01')`,
        [grupo],
      ],
      [
        `INSERT INTO lancamentos (id, grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em,
                                  alterado_por, alterado_em)
         VALUES ($1, $2, 'entrada', '2026-10-01', 'Mensalidade', 5000, $3, now(), $3, now())`,
        [lancamento, grupo, conta],
      ],
      [
        `INSERT INTO pagamentos_mes (grupo_id, jogador_id, mes, lancamento_id, marcado_por, marcado_em)
         VALUES ($1, $2, '2026-10', $3, $4, now())`,
        [grupo, jogador, lancamento, conta],
      ],
      [
        `INSERT INTO auditoria (autor_tipo, autor_conta_id, acao, entidade, grupo_id, momento)
         VALUES ('conta', $1, 'criar', 'grupo', $2, now())`,
        [conta, grupo],
      ],
      // Tabelas de conta (conta-e-acesso): uma linha de cada conta em cada uma.
      [
        `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
         VALUES (digest($2 || '-sessao', 'sha256'), $1, 'completo', now(), now(), now() + interval '12 hours')`,
        [conta, slug],
      ],
      [
        `INSERT INTO tentativas_login (email, ip_hash, momento, sucesso)
         VALUES ($1 || '@exemplo.com', digest($1 || '-ip', 'sha256'), now(), false)`,
        [slug],
      ],
      [
        `INSERT INTO links_conta (conta_id, tipo, token_hash, criado_em, expira_em)
         VALUES ($1, 'recuperacao', digest($2 || '-link', 'sha256'), now(), now() + interval '1 hour')`,
        [conta, slug],
      ],
      [
        "INSERT INTO envios_email (destino_hash, tipo, enviado_em) VALUES (digest($1 || '@exemplo.com', 'sha256'), 'recuperacao', now())",
        [slug],
      ],
      ['INSERT INTO pedidos_reset (conta_id, ultimo_pedido_em) VALUES ($1, now())', [conta]],
      [
        `INSERT INTO convites_admin (grupo_id, email, token_hash, criado_por, criado_em, expira_em)
         VALUES ($1, 'convidado-' || $2 || '@exemplo.com', digest($2 || '-convite', 'sha256'), $3, now(),
                 now() + interval '7 days')`,
        [grupo, slug, conta],
      ],
    ];
    for (const [sql, params] of comandos) await cliente.query(sql, params);
  }
}
