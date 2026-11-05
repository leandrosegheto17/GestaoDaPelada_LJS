import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  jogadores,
  type ResultadoPeriodo,
} from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from '../repositorios/apoio.ts';

/**
 * Concorrência das escritas de período (T44; GEL-109, GEL-110). Duas transações reais como `pelada_app`, cada uma pelo
 * `comDb` (o mesmo `Db` da rota). A primeira faz a escrita e fica aberta, segurando a trava `FOR UPDATE` da linha do
 * jogador (`travarParaPeriodo`, T38); a segunda começa, fica parada na trava (conferido em `pg_stat_activity`) e só
 * segue quando a primeira confirma, validando sobre o resultado dela.
 *
 * Casos limite (Domínio: sim), listados antes do teste:
 * - duas inativações do mesmo jogador: uma `ok`, a outra `ja_inativo`; um período só, encerrado na data da primeira;
 * - reativar e inativar: a inativação espera a reativação e encerra o período que ela abriu (sem a trava, leria o
 *   jogador ainda inativo e daria `ja_inativo`);
 * - corrigir enquanto inativa: a correção da saída do período que a inativação encerra espera e grava (sem a trava,
 *   leria o período ainda aberto e daria `nao-corrigivel`).
 *
 * Evidência da rede (registrar na T44): tirar o `FOR UPDATE` de `travarParaPeriodo` deixa os três casos vermelhos.
 */

let aberto: CenarioGruposAberto;
const criados: string[] = [];

const HOJE = '2026-11-05';
const PRAZO_MS = 5000;
/** Quanto a primeira transação segura a trava depois que a segunda já está esperando. */
const SEGURAR_MS = 250;

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

function sinal(): { promessa: Promise<void>; disparar: () => void } {
  let disparar: () => void = () => undefined;
  const promessa = new Promise<void>((ok) => {
    disparar = ok;
  });
  return { promessa, disparar };
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await aberto.db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [criados]);
  criados.length = 0;
});

type Faixa = [string, string | null];

async function novoJogador(
  apelido: string,
  faixas: Faixa[],
): Promise<{ id: string; periodos: string[] }> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, inicio_pontuacao, criado_por,
                            criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, $4, now(), $4, now()) RETURNING id`,
    [cenario.grupoG, apelido, faixas[0]![0], cenario.contaC],
  );
  const id = r.rows[0]!.id;
  criados.push(id);
  const ids: string[] = [];
  for (const [inicio, fim] of faixas) {
    const p = await db.query<{ id: string }>(
      'INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio, fim) VALUES ($1, $2, $3, $4) RETURNING id',
      [id, cenario.grupoG, inicio, fim],
    );
    ids.push(p.rows[0]!.id);
  }
  return { id, periodos: ids };
}

async function periodos(id: string) {
  const r = await aberto.db.query<{ inicio: string; fim: string | null }>(
    'SELECT inicio::text AS inicio, fim::text AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio',
    [id],
  );
  return r.rows;
}

/** Espera até alguma outra conexão deste banco estar parada numa trava. */
async function esperarAlguemNaTrava(): Promise<void> {
  const limite = Date.now() + PRAZO_MS;
  while (Date.now() < limite) {
    const r = await aberto.db.query<{ n: string }>(
      `SELECT count(*) AS n FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`,
    );
    if (Number(r.rows[0]?.n ?? 0) > 0) return;
    await esperar(20);
  }
  throw new Error(`Nenhuma conexão esperou na trava em ${PRAZO_MS} ms`);
}

type Escrita = (db: Parameters<typeof jogadores.inativar>[0]) => Promise<ResultadoPeriodo>;

/**
 * Roda `primeira` numa transação que fica aberta até a `segunda` (noutra transação) estar na trava e mais
 * `SEGURAR_MS`; então confirma a primeira. Devolve os dois resultados e quanto a segunda levou.
 */
async function emCorrida(primeira: Escrita, segunda: Escrita) {
  const { url, cenario } = aberto;
  const escreveu = sinal();
  const liberar = sinal();
  const p1 = comDb(
    url,
    cenario.contaC,
    async (db) => {
      const r = await primeira(db);
      escreveu.disparar();
      await liberar.promessa;
      return r;
    },
    { confirmar: true },
  );
  try {
    await escreveu.promessa;
    const inicio = Date.now();
    const p2 = comDb(url, cenario.contaO, segunda, { confirmar: true }).then((r) => ({
      r,
      ms: Date.now() - inicio,
    }));
    await esperarAlguemNaTrava();
    await esperar(SEGURAR_MS);
    liberar.disparar();
    const r1 = await p1;
    const { r: r2, ms } = await p2;
    return { r1, r2, ms };
  } finally {
    liberar.disparar();
    await p1.catch(() => undefined);
  }
}

describe('concorrência das escritas de período', () => {
  it('GEL-110: duas inativações simultâneas dão uma ok e uma ja_inativo', async () => {
    const j = await novoJogador('Corrida Dupla', [['2026-09-01', null]]);
    const { grupoG } = aberto.cenario;
    const { r1, r2 } = await emCorrida(
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-10' }, HOJE),
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-20' }, HOJE),
    );
    expect(r1).toEqual({ resultado: 'ok', alterado: true });
    expect(r2).toEqual({ resultado: 'ja_inativo' });
    expect(await periodos(j.id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-10' }]);
    const auditadas = await aberto.db.query(
      `SELECT 1 FROM auditoria WHERE acao = 'jogador_inativado' AND entidade_id = $1`,
      [j.id],
    );
    expect(auditadas.rowCount).toBe(1);
  });

  it('GEL-109: a segunda transação espera a trava (tempo medido) e lê o período já encerrado', async () => {
    const j = await novoJogador('Corrida Medida', [['2026-09-01', null]]);
    const { grupoG } = aberto.cenario;
    const { r2, ms } = await emCorrida(
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-10' }, HOJE),
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-20' }, HOJE),
    );
    expect(ms).toBeGreaterThanOrEqual(SEGURAR_MS);
    expect(r2.resultado).toBe('ja_inativo');
  });

  it('GEL-110: inativar enquanto reativa espera e encerra o período que a reativação abriu', async () => {
    const j = await novoJogador('Corrida Volta', [['2026-09-01', '2026-09-30']]);
    const { grupoG } = aberto.cenario;
    const { r1, r2 } = await emCorrida(
      (db) => jogadores.reativar(db, grupoG, j.id, { data: '2026-10-10' }, HOJE),
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-20' }, HOJE),
    );
    expect(r1).toEqual({ resultado: 'ok', alterado: true });
    expect(r2).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-09-01', fim: '2026-09-30' },
      { inicio: '2026-10-10', fim: '2026-10-20' },
    ]);
  });

  it('GEL-110: corrigir a saída enquanto inativa espera e corrige o período recém-encerrado', async () => {
    const j = await novoJogador('Corrida Corrige', [
      ['2026-01-10', '2026-05-01'],
      ['2026-06-01', null],
    ]);
    const { grupoG } = aberto.cenario;
    const { r1, r2 } = await emCorrida(
      (db) => jogadores.inativar(db, grupoG, j.id, { data: '2026-10-01' }, HOJE),
      (db) =>
        jogadores.corrigirPeriodo(db, grupoG, j.id, j.periodos[1]!, { saida: '2026-09-15' }, HOJE),
    );
    expect(r1).toEqual({ resultado: 'ok', alterado: true });
    expect(r2).toEqual({ resultado: 'ok', alterado: true });
    expect(await periodos(j.id)).toEqual([
      { inicio: '2026-01-10', fim: '2026-05-01' },
      { inicio: '2026-06-01', fim: '2026-09-15' },
    ]);
  });
});
