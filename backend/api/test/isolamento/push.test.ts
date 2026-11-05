import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp, type Contexto } from './apoio.ts';
import {
  abrirCenarioGrupos,
  type CenarioGrupos,
  type CenarioGruposAberto,
} from './cenario-grupos.ts';
import { MATRIZ } from './matriz.ts';

/**
 * Matriz política × comando das tabelas das notificações (notificacoes T12; NOT-51, NOT-52, NOT-53, NOT-54; AD-101), como
 * `pelada_app`. Atores (grupos G e H do cenário de grupos):
 * - A = criadora de G (C do cenário), com conta no contexto;
 * - C = admin convidada de G (O do cenário);
 * - B = conta só de H;
 * - S = só o slug público de G;
 * - N = sem contexto nenhum.
 * G tem uma assinatura de push do ranking e um aviso de cobrança (semente do cenário); as contas A e B têm uma
 * assinatura de push de conta cada (gravadas no `beforeAll`). `pelada_app` não tem grant nem policy nas três tabelas
 * (AD-101): cada comando direto é recusado com 42501 em todo contexto, inclusive o da própria conta e o do slug do
 * próprio grupo, e cada recusa confere que nada mudou (o conteúdo das três tabelas, como superusuário, antes e depois).
 *
 * Evidência da rede (registrar na T12 do tasks.md, pelo /executar, uma sabotagem por vez numa cópia):
 * - `GRANT SELECT ON push_ranking TO pelada_app` com uma policy `FOR SELECT TO pelada_app USING (true)` deixa vermelhas
 *   as células de SELECT de todo ator em `push_ranking` e a prova de que nenhum ator lê `endpoint`, `p256dh` ou `auth`;
 * - `GRANT UPDATE, DELETE ON push_conta TO pelada_app` com `FOR ALL USING (true) WITH CHECK (true)` deixa vermelhas as
 *   células de UPDATE e DELETE (com e sem `WHERE`) de `push_conta`;
 * - remover o `app_conta_id() IS NOT NULL` de `push_conta_cancelar` deixa vermelho "B não cancela a assinatura de A";
 * - trocar a conferência `p_slug IS DISTINCT FROM app_slug_publico()` de `push_ranking_assinar` deixa vermelho o caso do
 *   slug de H no contexto de G.
 */

type Ator = 'A' | 'C' | 'B' | 'S' | 'N';
const ATORES: readonly Ator[] = ['A', 'C', 'B', 'S', 'N'];
const TABELAS = ['push_ranking', 'push_conta', 'avisos_cobranca'] as const;

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const { db, cenario } = aberto;
  await db.query(
    `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth)
     VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t12-conta-c', 'pc', 'ac'),
            ($2, 'https://fcm.googleapis.com/fcm/send/t12-conta-b', 'pb', 'ab')`,
    [cenario.contaC, cenario.contaB],
  );
});

afterAll(async () => {
  await aberto?.fechar();
});

function contexto(ator: Ator, c: CenarioGrupos): Contexto {
  switch (ator) {
    case 'A':
      return { conta: c.contaC };
    case 'C':
      return { conta: c.contaO };
    case 'B':
      return { conta: c.contaB };
    case 'S':
      return { slug: c.slugG };
    case 'N':
      return {};
  }
}

/** O conteúdo das três tabelas, como superusuário, em texto ordenado: o que a escrita recusada não pode mudar. */
async function foto(): Promise<string> {
  const r = await aberto.db.query<{ s: string }>(
    `SELECT (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM push_ranking t)::text
         || (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id), '[]'::jsonb) FROM push_conta t)::text
         || (SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id_externo, t.tipo), '[]'::jsonb) FROM avisos_cobranca t)::text AS s`,
  );
  return r.rows[0]?.s ?? '';
}

async function recusada(ator: Ator, sql: string, valores: unknown[] = []): Promise<void> {
  const { db, cenario } = aberto;
  const antes = await foto();
  await expect(
    comoApp(db, contexto(ator, cenario), (d) => d.query(sql, valores)),
    `${ator}: ${sql}`,
  ).rejects.toMatchObject({
    code: '42501',
  });
  expect(await foto(), `${ator}: ${sql} mudou o conteúdo`).toEqual(antes);
}

/** A mudança de conteúdo real de cada tabela (coluna sem grant, que a policy ou o grant a mais deixariam passar). */
const ALTERAR: Record<(typeof TABELAS)[number], string> = {
  push_ranking: `UPDATE push_ranking SET auth = 'auth-trocada'`,
  push_conta: `UPDATE push_conta SET auth = 'auth-trocada'`,
  avisos_cobranca: `UPDATE avisos_cobranca SET enviado_em = now()`,
};

const INSERIR = (
  grupo: string,
  conta: string,
): Record<(typeof TABELAS)[number], [string, unknown[]]> => ({
  push_ranking: [
    `INSERT INTO push_ranking (grupo_id, endpoint, p256dh, auth) VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t12-intruso', 'p', 'a')`,
    [grupo],
  ],
  push_conta: [
    `INSERT INTO push_conta (conta_id, endpoint, p256dh, auth) VALUES ($1, 'https://fcm.googleapis.com/fcm/send/t12-intruso', 'p', 'a')`,
    [conta],
  ],
  avisos_cobranca: [
    `INSERT INTO avisos_cobranca (id_externo, tipo, grupo_id) VALUES ('pay_t12_intruso', 'cobranca_gerada', $1)`,
    [grupo],
  ],
});

describe.each(TABELAS)('%s × SELECT', (tabela) => {
  it.each(ATORES)(
    'NOT-52: o ator %s não lê a tabela (permissão negada), nem a própria conta nem o slug do próprio grupo',
    async (ator) => {
      await recusada(ator, `SELECT * FROM ${tabela}`);
      await recusada(ator, `SELECT count(*) FROM ${tabela}`);
    },
  );
});

describe.each(TABELAS)('%s × INSERT, UPDATE, DELETE, TRUNCATE', (tabela) => {
  it.each(ATORES)(
    'NOT-52: o ator %s não insere direto, e o conteúdo fica idêntico',
    async (ator) => {
      const { cenario } = aberto;
      // Cada ator tenta inserir no grupo G (ou na conta A para push_conta) e no grupo H (ou na conta B).
      for (const [grupo, conta] of [
        [cenario.grupoG, cenario.contaC],
        [cenario.grupoH, cenario.contaB],
      ] as const) {
        const [sql, valores] = INSERIR(grupo, conta)[tabela];
        await recusada(ator, sql, valores);
      }
    },
  );

  it.each(ATORES)(
    'NOT-52: o ator %s não altera, nem sem WHERE, e o conteúdo fica idêntico',
    async (ator) => {
      await recusada(ator, `${ALTERAR[tabela]} WHERE true`);
      await recusada(ator, ALTERAR[tabela]);
    },
  );

  it.each(ATORES)(
    'NOT-52: o ator %s não apaga, nem sem WHERE, e o conteúdo fica idêntico',
    async (ator) => {
      await recusada(ator, `DELETE FROM ${tabela} WHERE true`);
      await recusada(ator, `DELETE FROM ${tabela}`);
    },
  );

  it.each(ATORES)('NOT-52: o ator %s não esvazia a tabela com TRUNCATE', async (ator) => {
    await recusada(ator, `TRUNCATE ${tabela}`);
  });
});

describe('NOT-54: nem a admin do grupo lê endpoint, p256dh ou auth', () => {
  it.each([
    ['push_ranking', 'endpoint'],
    ['push_ranking', 'p256dh'],
    ['push_ranking', 'auth'],
    ['push_conta', 'endpoint'],
    ['push_conta', 'p256dh'],
    ['push_conta', 'auth'],
  ] as const)('A (criadora, com conta) não lê %s.%s', async (tabela, coluna) => {
    await recusada('A', `SELECT ${coluna} FROM ${tabela}`);
    await recusada('C', `SELECT ${coluna} FROM ${tabela}`);
  });

  it('pelada_app não tem privilégio nenhum, de tabela nem de coluna, nas três tabelas', async () => {
    for (const tabela of TABELAS) {
      const r = await aberto.db.query<{ tabela: boolean; coluna: boolean }>(
        `SELECT (has_table_privilege('pelada_app', $1, 'SELECT') OR has_table_privilege('pelada_app', $1, 'INSERT')
                 OR has_table_privilege('pelada_app', $1, 'UPDATE') OR has_table_privilege('pelada_app', $1, 'DELETE')
                 OR has_table_privilege('pelada_app', $1, 'TRUNCATE') OR has_table_privilege('pelada_app', $1, 'REFERENCES')
                 OR has_table_privilege('pelada_app', $1, 'TRIGGER')) AS tabela,
                (has_any_column_privilege('pelada_app', $1, 'SELECT') OR has_any_column_privilege('pelada_app', $1, 'INSERT')
                 OR has_any_column_privilege('pelada_app', $1, 'UPDATE')) AS coluna`,
        [`public.${tabela}`],
      );
      expect(r.rows[0], tabela).toEqual({ tabela: false, coluna: false });
    }
  });

  it('as funções de assinatura e de estado devolvem só texto de estado, nunca endpoint nem chaves', async () => {
    const { db, cenario } = aberto;
    const r = await comoApp(db, { slug: cenario.slugG }, async (d) => [
      await d.query(
        `SELECT push_ranking_assinar($1, 'https://fcm.googleapis.com/fcm/send/t12-novo', 'p', 'a') AS r`,
        [cenario.slugG],
      ),
      await d.query(
        `SELECT push_ranking_estado($1, 'https://fcm.googleapis.com/fcm/send/t12-novo', 'a') AS r`,
        [cenario.slugG],
      ),
    ]);
    expect(r.map((x) => x.rows[0])).toEqual([{ r: 'criada' }, { r: 'ativa' }]);
  });
});

describe('NOT-51: o contexto do slug e o da conta só passam pelas funções certas', () => {
  it('S assina no slug de G; com o slug de H no contexto de G, recebe nao_encontrado e nada é gravado', async () => {
    const { db, cenario } = aberto;
    const antes = await foto();
    const r = await comoApp(db, { slug: cenario.slugG }, async (d) => [
      await d.query(
        `SELECT push_ranking_assinar($1, 'https://fcm.googleapis.com/fcm/send/t12-h', 'p', 'a') AS r`,
        ['grupo-b'],
      ),
    ]);
    expect(r[0]?.rows[0]).toEqual({ r: 'nao_encontrado' });
    expect(await foto()).toEqual(antes);
  });

  it('N (sem contexto) pelo slug de G recebe nao_encontrado e nada é gravado', async () => {
    const { db, cenario } = aberto;
    const antes = await foto();
    const r = await comoApp(db, {}, (d) =>
      d.query(
        `SELECT push_ranking_assinar($1, 'https://fcm.googleapis.com/fcm/send/t12-n', 'p', 'a') AS r`,
        [cenario.slugG],
      ),
    );
    expect(r.rows[0]).toEqual({ r: 'nao_encontrado' });
    expect(await foto()).toEqual(antes);
  });

  it.each(['A', 'C', 'B'] as const)(
    'o ator %s, com conta, não chama as funções do slug',
    async (ator) => {
      const { cenario } = aberto;
      await recusada(
        ator,
        `SELECT push_ranking_assinar($1, 'https://fcm.googleapis.com/fcm/send/t12-conta', 'p', 'a')`,
        [cenario.slugG],
      );
      await recusada(
        ator,
        `SELECT push_ranking_cancelar($1, 'https://fcm.googleapis.com/fcm/send/t12-conta', 'a')`,
        [cenario.slugG],
      );
      await recusada(
        ator,
        `SELECT push_ranking_estado($1, 'https://fcm.googleapis.com/fcm/send/t12-conta', 'a')`,
        [cenario.slugG],
      );
    },
  );

  it.each(['A', 'C', 'B', 'S'] as const)(
    'o ator %s (com conta ou com slug) não chama as funções do envio nem as da limpeza',
    async (ator) => {
      const { cenario } = aberto;
      await recusada(ator, `SELECT * FROM push_envio_grupo($1)`, [cenario.grupoG]);
      await recusada(ator, `SELECT * FROM push_ranking_lote($1, 0, 40, now())`, [cenario.grupoG]);
      await recusada(
        ator,
        `SELECT push_ranking_resultado($1, '{}'::bigint[], ARRAY[1]::bigint[])`,
        [cenario.grupoG],
      );
      await recusada(ator, `SELECT * FROM aviso_cobranca_destino($1)`, [cenario.grupoG]);
      await recusada(ator, `SELECT aviso_cobranca_registrar('pay_t12', 'cobranca_gerada', $1)`, [
        cenario.grupoG,
      ]);
      await recusada(ator, `SELECT push_conta_resultado($1, '{}'::bigint[], ARRAY[1]::bigint[])`, [
        cenario.contaC,
      ]);
      await recusada(ator, `SELECT * FROM notificacoes_limpar()`);
    },
    30_000,
  );
});

describe('NOT-53: a assinatura do organizador é isolada por conta', () => {
  it.each(['S', 'N'] as const)(
    'o ator %s (sem conta) não chama as funções da conta',
    async (ator) => {
      await recusada(
        ator,
        `SELECT push_conta_assinar('https://fcm.googleapis.com/fcm/send/t12-x', 'p', 'a')`,
      );
      await recusada(
        ator,
        `SELECT push_conta_cancelar('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac')`,
      );
      await recusada(
        ator,
        `SELECT push_conta_estado('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac')`,
      );
    },
  );

  it('B não cancela nem consulta a assinatura de A, mesmo com endpoint e auth corretos', async () => {
    const { db, cenario } = aberto;
    const antes = await foto();
    const r = await comoApp(db, { conta: cenario.contaB }, async (d) => {
      const estado = await d.query(
        `SELECT push_conta_estado('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac') AS r`,
      );
      await d.query(
        `SELECT push_conta_cancelar('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac')`,
      );
      return estado.rows[0];
    });
    expect(r).toEqual({ r: 'ausente' });
    expect(await foto()).toEqual(antes);
  });

  it('A enxerga como ativa só a própria assinatura, e cancelar a apaga só ela', async () => {
    const { db, cenario } = aberto;
    const resultado = await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const minha = await d.query(
        `SELECT push_conta_estado('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac') AS r`,
      );
      const deB = await d.query(
        `SELECT push_conta_estado('https://fcm.googleapis.com/fcm/send/t12-conta-b', 'ab') AS r`,
      );
      await d.query(
        `SELECT push_conta_cancelar('https://fcm.googleapis.com/fcm/send/t12-conta-c', 'ac')`,
      );
      await d.query('RESET ROLE');
      const restantes = await d.query<{ conta_id: string }>(
        'SELECT conta_id FROM push_conta ORDER BY id',
      );
      return {
        minha: minha.rows[0],
        deB: deB.rows[0],
        restantes: restantes.rows.map((l) => l.conta_id),
      };
    });
    expect(resultado).toEqual({
      minha: { r: 'ativa' },
      deB: { r: 'ausente' },
      restantes: [cenario.contaB],
    });
  });
});

describe('FUN-12: as tabelas das notificações no meta-teste de cobertura', () => {
  it('NOT-50: push_ranking e avisos_cobranca (com grupo_id) estão na matriz de leitura, sem grant', () => {
    const casos = Object.fromEntries(MATRIZ.map((c) => [c.tabela, c.leitura]));
    expect(casos['push_ranking']).toBe('sem-grant');
    expect(casos['avisos_cobranca']).toBe('sem-grant');
  });
});
