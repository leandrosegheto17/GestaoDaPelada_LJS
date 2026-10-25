import type pg from 'pg';
import { comCliente } from './banco.ts';

/** Grava um grupo de teste no schema do legado: conta, grupo, vínculo, jogadores, partida e presenças. */
export async function gravarGrupoDeTeste(url: string): Promise<void> {
  await comCliente(url, async (c) => {
    await c.query(`
      INSERT INTO contas (id, email, nome, senha_hash, criada_em)
        VALUES ('00000000-0000-0000-0000-0000000000a1', 'org@exemplo.com', 'Organizador', 'x', now());
      INSERT INTO grupos (id, nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
        VALUES ('00000000-0000-0000-0000-0000000000b1', 'Pelada de Teste', 'pelada-teste', 'quarta', 'semanal',
                '20:00', '00000000-0000-0000-0000-0000000000a1', now());
      INSERT INTO vinculos_admin (conta_id, grupo_id, criado_por, criado_em)
        VALUES ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000b1',
                '00000000-0000-0000-0000-0000000000a1', now());
      INSERT INTO jogadores (id, grupo_id, apelido, posicao, criado_por, criado_em, alterado_por, alterado_em)
        SELECT gen_random_uuid(), '00000000-0000-0000-0000-0000000000b1', 'Jogador ' || n, 'meia',
               '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now()
        FROM generate_series(1, 5) AS n;
      INSERT INTO partidas (id, grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
        VALUES ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '2026-10-21',
                '00000000-0000-0000-0000-0000000000a1', now(), '00000000-0000-0000-0000-0000000000a1', now());
      INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao)
        SELECT '00000000-0000-0000-0000-0000000000c1', id, grupo_id, 'presente' FROM jogadores;
    `);
  });
}

/** Contagem de linhas de cada tabela do schema `public`, exceto o controle do `node-pg-migrate`. */
export async function contarLinhas(cliente: pg.ClientBase): Promise<Record<string, number>> {
  const { rows } = await cliente.query<{ t: string }>(
    "SELECT tablename AS t FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'pgmigrations' ORDER BY 1",
  );
  const contagem: Record<string, number> = {};
  for (const { t } of rows) {
    const r = await cliente.query<{ n: string }>(`SELECT count(*) AS n FROM public."${t}"`);
    contagem[t] = Number(r.rows[0]?.n);
  }
  return contagem;
}
