import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { jogadores } from '../../src/infraestrutura/db/repositorios/jogadores.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * `jogadores.travarVarios`, `ativosNaData` e `lerParaPrevia` (T29; PAR-27, PAR-29; AD-038), contra o cenário de
 * grupos: em G, Toninho (ativo desde 2026-01-01), Zé Inativo (2025-03-01 a 2025-12-31) e Bira (ativo desde 2026-01-01,
 * com presença em 2026-01-08). As travas usam duas conexões de verdade.
 *
 * Casos limite: lista vazia; id repetido; id de outro grupo; ordens opostas em duas conexões; [início, fim) no dia
 * do início e no da saída; leitura da prévia sem esperar trava.
 */

let aberto: CenarioGruposAberto;
let jogadorDeH: string;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
  const r = await aberto.db.query<{ id: string }>(
    'SELECT id FROM jogadores WHERE grupo_id = $1 LIMIT 1',
    [aberto.cenario.grupoH],
  );
  jogadorDeH = r.rows[0]?.id ?? '';
});

afterAll(async () => {
  await aberto?.fechar();
});

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Tenta travar a linha do jogador como superusuário, sem esperar: `true` se conseguiu (ninguém a trava). */
async function livre(id: string): Promise<boolean> {
  const { db } = aberto;
  await db.query('BEGIN');
  try {
    await db.query('SELECT id FROM jogadores WHERE id = $1 FOR UPDATE NOWAIT', [id]);
    return true;
  } catch (erro) {
    if ((erro as { code?: string }).code === '55P03') return false;
    throw erro;
  } finally {
    await db.query('ROLLBACK');
  }
}

describe('jogadores.travarVarios', () => {
  it('PAR-29: devolve os ids do grupo em ordem crescente, sem repetição', async () => {
    const { cenario } = aberto;
    const a = cenario.idsG.jogadorAtivo;
    const b = cenario.idsG.jogadorHistorico;
    const ids = await comDb(aberto.url, cenario.contaC, (db) =>
      jogadores.travarVarios(db, cenario.grupoG, [b, a, b]),
    );
    expect(ids).toEqual([a, b].sort());
  });

  it('PAR-29: lista vazia não trava nada', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaC, (db) =>
        jogadores.travarVarios(db, cenario.grupoG, []),
      ),
    ).toEqual([]);
  });

  it('PAR-29: enquanto a transação está aberta, a linha fica travada; depois, livre', async () => {
    const { cenario } = aberto;
    const id = cenario.idsG.jogadorAtivo;
    let travadoDurante: boolean | undefined;
    await comDb(aberto.url, cenario.contaC, async (db) => {
      await jogadores.travarVarios(db, cenario.grupoG, [id]);
      travadoDurante = !(await livre(id));
    });
    expect(travadoDurante).toBe(true);
    expect(await livre(id)).toBe(true);
  });

  it('PAR-29: id de outro grupo não é travado nem devolvido', async () => {
    const { cenario } = aberto;
    expect(jogadorDeH, 'o cenário precisa de jogador em H').toBeTruthy();
    let livreDurante: boolean | undefined;
    const ids = await comDb(aberto.url, cenario.contaC, async (db) => {
      const r = await jogadores.travarVarios(db, cenario.grupoG, [
        jogadorDeH,
        cenario.idsG.jogadorAtivo,
      ]);
      livreDurante = await livre(jogadorDeH);
      return r;
    });
    expect(ids).toEqual([cenario.idsG.jogadorAtivo]);
    expect(livreDurante).toBe(true);
  });

  it('PAR-29: duas conexões travando [B, A] e [A, B] não fazem deadlock: a segunda espera a primeira', async () => {
    const { cenario } = aberto;
    const a = cenario.idsG.jogadorAtivo;
    const b = cenario.idsG.jogadorHistorico;
    let liberar!: () => void;
    const segurando = new Promise<void>((r) => (liberar = r));
    let avisarTravou!: () => void;
    const travou = new Promise<void>((r) => (avisarTravou = r));
    let segundaTerminou = false;

    const primeira = comDb(aberto.url, cenario.contaC, async (db) => {
      const ids = await jogadores.travarVarios(db, cenario.grupoG, [b, a]);
      avisarTravou();
      await segurando;
      return ids;
    });
    await travou;
    const segunda = comDb(aberto.url, cenario.contaO, async (db) => {
      const ids = await jogadores.travarVarios(db, cenario.grupoG, [a, b]);
      segundaTerminou = true;
      return ids;
    });
    await espera(300);
    expect(segundaTerminou, 'a segunda precisa esperar a trava da primeira').toBe(false);
    liberar();
    const [r1, r2] = await Promise.all([primeira, segunda]);
    expect(r1).toEqual([a, b].sort());
    expect(r2).toEqual([a, b].sort());
  });
});

describe('jogadores.ativosNaData', () => {
  const ids = (data: string) =>
    comDb(aberto.url, aberto.cenario.contaC, async (db) =>
      (await jogadores.ativosNaData(db, aberto.cenario.grupoG, data)).map((j) => j.id),
    );

  it('PAR-27: segue [início, fim): ativo no dia do início e na véspera da saída; fora no dia da saída', async () => {
    const { idsG } = aberto.cenario;
    expect(await ids('2025-03-01')).toEqual([idsG.jogadorInativo]);
    expect(await ids('2025-12-30')).toEqual([idsG.jogadorInativo]);
    expect(await ids('2025-12-31')).toEqual([]);
    expect(await ids('2025-02-28')).toEqual([]);
  });

  it('PAR-27: em 2026-01-08, Bira e Toninho, em ordem de apelido', async () => {
    const { cenario } = aberto;
    const r = await comDb(aberto.url, cenario.contaC, (db) =>
      jogadores.ativosNaData(db, cenario.grupoG, '2026-01-08'),
    );
    expect(r).toEqual([
      { id: cenario.idsG.jogadorHistorico, apelido: 'Bira' },
      { id: cenario.idsG.jogadorAtivo, apelido: 'Toninho' },
    ]);
  });

  it('PAR-27: a conta de outro grupo não vê os ativos de G', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaB, (db) =>
        jogadores.ativosNaData(db, cenario.grupoG, '2026-01-08'),
      ),
    ).toEqual([]);
  });
});

describe('jogadores.lerParaPrevia', () => {
  it('PAR-27: lê períodos e presenças do jogador, como o travarParaPeriodo', async () => {
    const { cenario } = aberto;
    const estado = await comDb(aberto.url, cenario.contaC, (db) =>
      jogadores.lerParaPrevia(db, cenario.grupoG, cenario.idsG.jogadorHistorico),
    );
    expect(estado).toEqual({
      inicioPontuacao: null,
      periodos: [{ id: expect.any(String), inicio: '2026-01-01', fim: null }],
      presencas: [{ data: '2026-01-08', situacao: 'presente' }],
    });
  });

  it('PAR-27: não trava nem espera a trava de outra transação', async () => {
    const { db, cenario } = aberto;
    const id = cenario.idsG.jogadorHistorico;
    await db.query('BEGIN');
    try {
      await db.query('SELECT id FROM jogadores WHERE id = $1 FOR UPDATE', [id]);
      const lido = await Promise.race([
        comDb(aberto.url, cenario.contaC, (d) =>
          jogadores.lerParaPrevia(d, cenario.grupoG, id),
        ).then(() => 'leu'),
        espera(2000).then(() => 'esperou'),
      ]);
      expect(lido).toBe('leu');
    } finally {
      await db.query('ROLLBACK');
    }
  });

  it('PAR-27: jogador de outro grupo devolve nulo', async () => {
    const { cenario } = aberto;
    expect(
      await comDb(aberto.url, cenario.contaC, (db) =>
        jogadores.lerParaPrevia(db, cenario.grupoG, jogadorDeH),
      ),
    ).toBeNull();
  });
});
