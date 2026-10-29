import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import type { ErroPg } from '../apoio/como-role.ts';

// Concorrência do slug em grupo_criar (T19; GEL-15): duas criações do mesmo nome ao mesmo tempo terminam com slugs
// diferentes; a nova tentativa vai até 3 vezes e, esgotada, falha sem deixar grupo parcial.

const HABILIDADES = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const CRIAR = 'SELECT id, slug FROM grupo_criar($1, $2, $3, $4, $5, $6)';

let banco: BancoTemporario;
let dono: pg.Client;
const abertos: pg.Client[] = [];

async function conectar(): Promise<pg.Client> {
  const cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
  abertos.push(cliente);
  return cliente;
}

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  dono = await conectar();
});

afterAll(async () => {
  for (const c of abertos) await c.end().catch(() => undefined);
  await banco?.remover();
});

async function novaConta(): Promise<string> {
  const id = randomUUID();
  await dono.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [id, `${id}@exemplo.com`],
  );
  return id;
}

/** Uma "requisição": transação como pelada_app com a conta, chama grupo_criar e confirma. */
async function requisicao(cliente: pg.Client, conta: string, slugBase: string): Promise<string> {
  await cliente.query('BEGIN');
  try {
    await cliente.query('SET LOCAL ROLE pelada_app');
    await cliente.query("SELECT set_config('app.conta_id', $1, true)", [conta]);
    const { rows } = await cliente.query<{ slug: string }>(CRIAR, [
      'Pelada Concorrente',
      'quinta',
      'semanal',
      '20:00',
      slugBase,
      HABILIDADES,
    ]);
    await cliente.query('COMMIT');
    return rows[0]?.slug as string;
  } catch (erro) {
    await cliente.query('ROLLBACK');
    throw erro;
  }
}

/** Espera o backend `pid` ficar travado esperando a transação do backend `por` (o INSERT no índice único). */
async function esperarTrava(pid: number, por: number): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    const { rows } = await dono.query<{ esperando: boolean }>(
      'SELECT $2::int = ANY (pg_blocking_pids($1)) AS esperando',
      [pid, por],
    );
    if (rows[0]?.esperando) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`o backend ${pid} não chegou a esperar o ${por}`);
}

async function pidDe(cliente: pg.Client): Promise<number> {
  const { rows } = await cliente.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return rows[0]?.pid as number;
}

describe('duas criações simultâneas do mesmo nome (GEL-15)', () => {
  it('20 rodadas: sempre dois slugs distintos e nenhuma falha', async () => {
    const [c1, c2] = [await conectar(), await conectar()];
    const [conta1, conta2] = [await novaConta(), await novaConta()];
    for (let rodada = 0; rodada < 20; rodada++) {
      const base = `corrida-${rodada}`;
      const resultados = await Promise.allSettled([requisicao(c1, conta1, base), requisicao(c2, conta2, base)]);
      const falhas = resultados.filter((r) => r.status === 'rejected');
      expect(falhas).toEqual([]);
      const slugs = resultados.map((r) => (r as PromiseFulfilledResult<string>).value).sort();
      expect(slugs).toEqual([base, `${base}-2`]);
    }
    const { rows } = await dono.query<{ n: string }>("SELECT count(*) AS n FROM grupos WHERE slug LIKE 'corrida-%'");
    expect(Number(rows[0]?.n)).toBe(40);
  });

  it('com base, -2 e -3 tomados por criações em andamento, a terceira tentativa esgota e devolve erro sem grupo parcial', async () => {
    const conta = await novaConta();
    const ocupantes = [await conectar(), await conectar(), await conectar()];
    // Cada ocupante grava (sem confirmar) um dos slugs que a função vai escolher: base, -2 e -3. Invisíveis à
    // consulta do sufixo livre até confirmarem, mas o INSERT da função espera por eles no índice único.
    for (const [i, slug] of ['esgota', 'esgota-2', 'esgota-3'].entries()) {
      const c = ocupantes[i] as pg.Client;
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ('Ocupante', $1, 'quarta', 'semanal', '20:00', $2, now())`,
        [slug, conta],
      );
    }

    const alvo = await conectar();
    const pid = await pidDe(alvo);
    const pedido = requisicao(alvo, conta, 'esgota').then(
      () => null,
      (erro: ErroPg) => erro.code ?? 'sem-codigo',
    );
    // Libera um ocupante por vez, só depois de a função estar esperando por ele: cada liberação é uma colisão.
    for (const c of ocupantes) {
      await esperarTrava(pid, await pidDe(c));
      await c.query('COMMIT');
    }
    expect(await pedido).toBe('23505');

    const { rows } = await dono.query<{ slug: string }>(
      "SELECT slug FROM grupos WHERE slug LIKE 'esgota%' ORDER BY slug",
    );
    expect(rows.map((r) => r.slug)).toEqual(['esgota', 'esgota-2', 'esgota-3']);
    const vinculos = await dono.query('SELECT 1 FROM vinculos_admin WHERE conta_id = $1', [conta]);
    const auditoria = await dono.query("SELECT 1 FROM auditoria WHERE autor_conta_id = $1 AND acao = 'grupo_criado'", [
      conta,
    ]);
    expect({ vinculos: vinculos.rows, auditoria: auditoria.rows }).toEqual({ vinculos: [], auditoria: [] });
  });

  it('com só base e -2 em andamento, a terceira tentativa cria em -3 (controle do limite)', async () => {
    const conta = await novaConta();
    const ocupantes = [await conectar(), await conectar()];
    for (const [i, slug] of ['quase', 'quase-2'].entries()) {
      const c = ocupantes[i] as pg.Client;
      await c.query('BEGIN');
      await c.query(
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ('Ocupante', $1, 'quarta', 'semanal', '20:00', $2, now())`,
        [slug, conta],
      );
    }
    const alvo = await conectar();
    const pid = await pidDe(alvo);
    const pedido = requisicao(alvo, conta, 'quase');
    for (const c of ocupantes) {
      await esperarTrava(pid, await pidDe(c));
      await c.query('COMMIT');
    }
    expect(await pedido).toBe('quase-3');
  });
});
