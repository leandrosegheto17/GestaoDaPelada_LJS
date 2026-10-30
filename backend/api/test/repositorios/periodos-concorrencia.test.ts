import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '../../src/infraestrutura/db/index.ts';
import * as grupos from '../../src/infraestrutura/db/repositorios/grupos.ts';
import * as jogadores from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { comDb, prepararBancoDeRepositorio, type BancoDeRepositorio } from '../apoio/repositorio.ts';

// Concorrência das escritas de período (T44; GEL-109, GEL-110). Cada escrita é uma "requisição" de verdade: uma
// conexão própria como pelada_app, com a transação da requisição. A trava do jogador (FOR UPDATE) faz a segunda
// esperar a primeira e ser avaliada sobre o que ela gravou.
const HOJE = '2026-10-29';
const RODADAS = 20;

let b: BancoDeRepositorio;
let conta: string;
let grupo: string;

beforeAll(async () => {
  b = await prepararBancoDeRepositorio();
  conta = randomUUID();
  await b.owner.query(
    "INSERT INTO contas (id, email, nome, senha_hash, criada_em) VALUES ($1, $2, 'Pessoa', 'x', now())",
    [conta, `${conta}@exemplo.com`],
  );
  const dados = { nome: 'Pelada Concorrente', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' } as const;
  grupo = (await como((db) => grupos.criar(db, dados, `concorrencia-${randomUUID().slice(0, 8)}`))).id;
});

afterAll(async () => {
  await b?.encerrar();
});

function como<T>(acao: (db: Db) => Promise<T>): Promise<T> {
  return comDb(b.urlApp, { conta }, acao);
}

/** Jogador novo, entrou em 01/09; com `saiuEVoltou`, saiu em 05/10 e voltou em 12/10. */
async function novoJogador(saiuEVoltou = false): Promise<string> {
  const dados = {
    apelido: `C ${randomUUID().slice(0, 8)}`,
    anoNascimento: 1990,
    posicao: 'meia',
    telefone: null,
  } as const;
  const r = await como((db) =>
    jogadores.criar(db, grupo, { ...dados, pontuacaoInicial: 0, dataEntrada: '2026-09-01' }, HOJE),
  );
  if (!r.ok) throw new Error(r.mensagem);
  if (saiuEVoltou) {
    await como((db) => jogadores.inativar(db, grupo, r.id, '2026-10-05', HOJE));
    await como((db) => jogadores.reativar(db, grupo, r.id, '2026-10-12', HOJE));
  }
  return r.id;
}

interface Periodo {
  id: string;
  inicio: string;
  fim: string | null;
}

async function periodosDe(jogador: string): Promise<Periodo[]> {
  const { rows } = await b.owner.query<Periodo>(
    `SELECT id, to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim
       FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio`,
    [jogador],
  );
  return rows;
}

/** Os períodos respeitam as regras de ordem: fim não antes do início, e cada um termina até o início do seguinte. */
function respeitaAOrdem(periodos: Periodo[]): boolean {
  return periodos.every(
    (p, i) =>
      (p.fim === null || p.fim >= p.inicio) &&
      (i === periodos.length - 1 || (p.fim !== null && p.fim <= periodos[i + 1]!.inicio)),
  );
}

const auditorias = async (jogador: string, acao: string) =>
  Number(
    (
      await b.owner.query<{ n: string }>('SELECT count(*) AS n FROM auditoria WHERE entidade_id = $1 AND acao = $2', [
        jogador,
        acao,
      ])
    ).rows[0]?.n,
  );

/** Espera alguma conexão do banco ficar parada esperando uma trava. */
async function esperarAlguemEsperandoTrava(): Promise<void> {
  for (let i = 0; i < 1000; i++) {
    const { rows } = await b.owner.query(
      "SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'",
    );
    if (rows.length > 0) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('nenhuma conexão chegou a esperar a trava');
}

describe('duas inativações do mesmo jogador ao mesmo tempo (GEL-110)', () => {
  it('a segunda espera a trava da primeira e recebe ja_inativo, validada sobre o resultado dela', async () => {
    const jogador = await novoJogador();
    let liberar!: () => void;
    const segurar = new Promise<void>((r) => (liberar = r));
    let avisarGravou!: () => void;
    const gravou = new Promise<void>((r) => (avisarGravou = r));
    const primeira = como(async (db) => {
      const r = await jogadores.inativar(db, grupo, jogador, '2026-10-05', HOJE);
      avisarGravou();
      await segurar; // a transação fica aberta, com o jogador travado
      return r;
    });
    // Só começa a segunda depois que a primeira já gravou (e segura a trava).
    await gravou;
    const segunda = como((db) => jogadores.inativar(db, grupo, jogador, '2026-10-20', HOJE));
    await esperarAlguemEsperandoTrava();
    liberar();
    expect(await primeira).toEqual({ ok: true });
    expect(await segunda).toEqual({ ok: false, codigo: 'ja_inativo' });
    expect(await periodosDe(jogador)).toMatchObject([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
    expect(await auditorias(jogador, 'jogador_inativado')).toBe(1);
  });

  it(`${RODADAS} rodadas em paralelo: sempre uma conclui e a outra recebe ja_inativo`, async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const jogador = await novoJogador();
      const resultados = await Promise.all([
        como((db) => jogadores.inativar(db, grupo, jogador, '2026-10-05', HOJE)),
        como((db) => jogadores.inativar(db, grupo, jogador, '2026-10-20', HOJE)),
      ]);
      const ok = resultados.filter((r) => r?.ok);
      expect(ok).toHaveLength(1);
      expect(resultados.filter((r) => r !== null && !r.ok && 'codigo' in r && r.codigo === 'ja_inativo')).toHaveLength(
        1,
      );
      const periodos = await periodosDe(jogador);
      expect(periodos).toHaveLength(1);
      expect(['2026-10-05', '2026-10-20']).toContain(periodos[0]?.fim);
      expect(await auditorias(jogador, 'jogador_inativado')).toBe(1);
    }
  });
});

describe('inativar e corrigir em paralelo (GEL-109, GEL-110)', () => {
  it(`${RODADAS} rodadas: inativar em 15/10 e corrigir o retorno para 20/10 — só uma passa, sem estado inválido`, async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const jogador = await novoJogador(true);
      const segundo = (await periodosDe(jogador))[1]!.id;
      const [inativar, corrigir] = await Promise.all([
        como((db) => jogadores.inativar(db, grupo, jogador, '2026-10-15', HOJE)),
        como((db) => jogadores.corrigirPeriodo(db, grupo, jogador, segundo, { retorno: '2026-10-20' }, HOJE)),
      ]);
      // Sozinhas, as duas passariam; em sequência, a segunda é recusada pela regra de ordem sobre a primeira.
      expect([inativar?.ok, corrigir?.ok].filter(Boolean)).toHaveLength(1);
      const periodos = await periodosDe(jogador);
      expect(respeitaAOrdem(periodos)).toBe(true);
      expect(periodos.map((p) => [p.inicio, p.fim])).toEqual(
        inativar?.ok
          ? [
              ['2026-09-01', '2026-10-05'],
              ['2026-10-12', '2026-10-15'],
            ]
          : [
              ['2026-09-01', '2026-10-05'],
              ['2026-10-20', null],
            ],
      );
    }
  });

  it(`${RODADAS} rodadas: duas correções que, juntas, sobreporiam os períodos — só uma passa`, async () => {
    for (let rodada = 0; rodada < RODADAS; rodada++) {
      const jogador = await novoJogador(true);
      const [primeiro, segundo] = (await periodosDe(jogador)).map((p) => p.id);
      const [saida, retorno] = await Promise.all([
        como((db) => jogadores.corrigirPeriodo(db, grupo, jogador, primeiro!, { saida: '2026-10-10' }, HOJE)),
        como((db) => jogadores.corrigirPeriodo(db, grupo, jogador, segundo!, { retorno: '2026-10-08' }, HOJE)),
      ]);
      expect([saida?.ok, retorno?.ok].filter(Boolean)).toHaveLength(1);
      const periodos = await periodosDe(jogador);
      expect(respeitaAOrdem(periodos)).toBe(true);
    }
  });
});
