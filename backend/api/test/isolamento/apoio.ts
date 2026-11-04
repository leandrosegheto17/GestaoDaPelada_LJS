import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrar } from '../../src/infraestrutura/db/migrar.ts';
import { comBancoDeTeste, comTravaDeMigracao } from '../apoio/banco.ts';

export interface Contexto {
  contaId?: string;
  slug?: string;
}
export interface Lado {
  contaId: string;
  grupoId: string;
  slug: string;
}
export interface Cenario {
  c: pg.Client;
  url: string;
  A: Lado;
  B: Lado;
  /** Conta sem vínculo com nenhum grupo. */
  semVinculo: string;
}

/** Tabelas com `grupo_id` do catálogo, mais `grupos` (pela coluna `id`). */
export async function tabelasComGrupo(
  c: pg.ClientBase,
): Promise<{ tabela: string; coluna: string }[]> {
  const { rows } = await c.query<{ tabela: string; coluna: string }>(`
    select cl.relname as tabela, 'grupo_id' as coluna
      from pg_class cl join pg_namespace n on n.oid = cl.relnamespace
      join pg_attribute a on a.attrelid = cl.oid and a.attname = 'grupo_id' and not a.attisdropped
     where n.nspname = 'public' and cl.relkind = 'r'
    union all select 'grupos', 'id'
    order by 1`);
  return rows;
}

/**
 * Roda `fn` como `pelada_app` com o contexto da requisição (`app.conta_id` e `app.slug_publico`),
 * dentro de uma transação que sempre termina em ROLLBACK: nada do que `fn` escreve fica no banco.
 */
export async function comoApp<T>(
  c: pg.ClientBase,
  ctx: Contexto,
  fn: () => Promise<T>,
): Promise<T> {
  return comoRole(c, 'pelada_app', ctx, fn);
}

/** Como `comoApp`, para outra role da aplicação (ex.: `pelada_backup_ro`). */
export async function comoRole<T>(
  c: pg.ClientBase,
  role: 'pelada_app' | 'pelada_backup_ro',
  ctx: Contexto,
  fn: () => Promise<T>,
): Promise<T> {
  await c.query('begin');
  try {
    await c.query(`set local role ${role}`);
    await c.query(
      "select set_config('app.conta_id', $1, true), set_config('app.slug_publico', $2, true)",
      [ctx.contaId ?? '', ctx.slug ?? ''],
    );
    return await fn();
  } finally {
    await c.query('rollback');
  }
}

/** Primeiro valor permitido por um CHECK de lista (`col = ANY (ARRAY['a'::text, ...])`). */
async function valoresDeCheck(c: pg.ClientBase, tabela: string): Promise<Record<string, string>> {
  const { rows } = await c.query<{ def: string }>(
    `select pg_get_constraintdef(k.oid) as def from pg_constraint k
      where k.conrelid = $1::regclass and k.contype = 'c'`,
    [`public.${tabela}`],
  );
  const out: Record<string, string> = {};
  for (const { def } of rows) {
    const m = /\(?\(?"?(\w+)"?\)?(?:::text)? = ANY \(\(?ARRAY\[\s*'([^']*)'/.exec(def);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

/** CHECKs escritos à mão que não dão para inferir do catálogo: valor válido por `tabela.coluna`. */
const VALORES_FIXOS: Record<string, string> = {
  'auditoria.autor_tipo': 'infraestrutura',
  'escalacoes.n': '2',
  'eventos_uso.tipo': 'pdf_exportado',
  'eventos_uso.mes_exportado': '2026-01',
};

function valorPorTipo(tipo: string, nome: string): string {
  if (nome === 'email') return `x_${randomUUID().slice(0, 8)}@exemplo.com`;
  if (nome === 'mes' || nome === 'mes_exportado') return '2026-01';
  if (tipo === 'bytea') return String.fromCharCode(92) + 'x' + randomBytes(32).toString('hex');
  if (tipo === 'uuid') return randomUUID();
  if (/char|text/.test(tipo)) return `x_${randomUUID().slice(0, 8)}`;
  if (/int|numeric|real|double/.test(tipo)) return '1';
  if (tipo.startsWith('bool')) return 'false';
  if (tipo === 'date') return '2026-01-15';
  if (tipo.startsWith('time without')) return '20:00';
  if (tipo.startsWith('timestamp')) return '2026-01-15T20:00:00Z';
  if (tipo === 'json' || tipo === 'jsonb') return '{}';
  throw new Error(`apoio de isolamento: tipo sem valor padrão: ${tipo}`);
}

/** Insere uma linha mínima na tabela, para o grupo dado, a partir do catálogo (colunas obrigatórias). */
export async function inserirLinha(
  c: pg.ClientBase,
  tabela: string,
  coluna: string,
  grupoId: string,
  extra: Record<string, string> = {},
) {
  const { rows } = await c.query<{ nome: string; tipo: string; obrigatoria: boolean }>(
    `select a.attname as nome, format_type(a.atttypid, a.atttypmod) as tipo,
            (a.attnotnull and not a.atthasdef and a.attidentity = '' and a.attgenerated = '') as obrigatoria
       from pg_attribute a where a.attrelid = $1::regclass and a.attnum > 0 and not a.attisdropped`,
    [`public.${tabela}`],
  );
  const checks = await valoresDeCheck(c, tabela);
  const colunas: string[] = [];
  const valores: string[] = [];
  for (const col of rows) {
    const fixa = `${tabela}.${col.nome}` in VALORES_FIXOS;
    if (!col.obrigatoria && col.nome !== coluna && !(col.nome in extra) && !fixa) continue;
    colunas.push(`"${col.nome}"`);
    valores.push(
      col.nome === coluna
        ? grupoId
        : (extra[col.nome] ??
            VALORES_FIXOS[`${tabela}.${col.nome}`] ??
            checks[col.nome] ??
            valorPorTipo(col.tipo, col.nome)),
    );
  }
  await c.query(
    `insert into "${tabela}" (${colunas.join(', ')}) values (${valores.map((_, i) => `$${i + 1}`).join(', ')})`,
    valores,
  );
}

/**
 * Cria, num banco de teste migrado, duas contas (A e B), um grupo para cada uma, o vínculo de cada conta
 * com o seu grupo e ao menos uma linha por grupo em toda tabela com `grupo_id` (lista do catálogo).
 * O banco é removido no `finally`, mesmo quando `corpo` lança.
 */
export async function comCenario<T>(corpo: (cenario: Cenario) => Promise<T>): Promise<T> {
  return comBancoDeTeste(async (url) => {
    await comTravaDeMigracao(() => migrar(url));
    const c = new pg.Client({ connectionString: url });
    await c.connect();
    try {
      // o superusuário insere os dados; as FKs entre as linhas mínimas não são o assunto destes testes
      await c.query("set session_replication_role = 'replica'");
      const lado = async (nome: string): Promise<Lado> => {
        const contaId = randomUUID();
        const grupoId = randomUUID();
        const slug = `${nome}-${grupoId.slice(0, 8)}`;
        await inserirLinha(c, 'contas', 'id', contaId, { id: contaId });
        await inserirLinha(c, 'grupos', 'id', grupoId, { slug, criado_por: contaId });
        return { contaId, grupoId, slug };
      };
      const A = await lado('a');
      const B = await lado('b');
      const semVinculo = randomUUID();
      await inserirLinha(c, 'contas', 'id', semVinculo, { id: semVinculo });
      for (const { tabela, coluna } of await tabelasComGrupo(c)) {
        if (tabela === 'grupos') continue;
        for (const l of [A, B]) {
          const extra: Record<string, string> =
            tabela === 'vinculos_admin' ? { conta_id: l.contaId } : {};
          await inserirLinha(c, tabela, coluna, l.grupoId, extra);
        }
      }
      return await corpo({ c, url, A, B, semVinculo });
    } finally {
      await c.end();
    }
  });
}
