import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { habilidades } from '../../src/infraestrutura/db/repositorios/habilidades.ts';
import type { Db } from '../../src/infraestrutura/db/repositorios/tipos.ts';
import {
  abrirCenarioGrupos,
  HABILIDADES_INICIAIS,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de habilidades (T46; GEL-88, GEL-89, GEL-91, GEL-92, GEL-93, GEL-96, SEC-008), contra o cenário de
 * grupos: G nasce com as 6 habilidades iniciais. Os casos que conferem a auditoria ou o estado depois confirmam a
 * transação; o `afterEach` apaga as habilidades criadas e devolve "Drible" ao nome original.
 */

let aberto: CenarioGruposAberto;
const criadas: string[] = [];
const jogadoresCriados: string[] = [];

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  const { db, cenario } = aberto;
  await db.query('DELETE FROM habilidades WHERE id = ANY($1::uuid[])', [criadas]);
  // As notas dos jogadores criados saem antes (FK notas_jogador_id_grupo_id_fkey, sem cascata).
  await db.query('DELETE FROM notas WHERE jogador_id = ANY($1::uuid[])', [jogadoresCriados]);
  await db.query('DELETE FROM jogadores WHERE id = ANY($1::uuid[])', [jogadoresCriados]);
  await db.query(`UPDATE habilidades SET nome = 'Drible' WHERE grupo_id = $1 AND nome = 'Finta'`, [
    cenario.grupoG,
  ]);
  // A auditoria de um teste não vale para o seguinte (a "Drible" é a mesma linha em todos).
  await db.query("DELETE FROM auditoria WHERE grupo_id = $1 AND acao LIKE 'habilidade_%'", [
    cenario.grupoG,
  ]);
  criadas.length = 0;
  jogadoresCriados.length = 0;
});

function como<T>(fn: (db: Db) => Promise<T>, conta = aberto.cenario.contaC) {
  return comDb(aberto.url, conta, fn, { confirmar: true });
}

async function nomesDeG(): Promise<string[]> {
  const r = await aberto.db.query<{ nome: string }>(
    'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
    [aberto.cenario.grupoG],
  );
  return r.rows.map((l) => l.nome);
}

async function idDe(nome: string): Promise<string> {
  const r = await aberto.db.query<{ id: string }>(
    'SELECT id FROM habilidades WHERE grupo_id = $1 AND nome = $2',
    [aberto.cenario.grupoG, nome],
  );
  return r.rows[0]!.id;
}

async function eventos(acao: string, id: string) {
  const r = await aberto.db.query<{ autor: string; resumo: Record<string, unknown> }>(
    'SELECT autor_conta_id AS autor, resumo FROM auditoria WHERE acao = $1 AND entidade_id = $2',
    [acao, id],
  );
  return r.rows;
}

async function jogadorComNotas(apelido: string, notas: Array<[string, number]>): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                            alterado_por, alterado_em)
     VALUES ($1, $2, 1990, 'meia', 0, $3, now(), $3, now()) RETURNING id`,
    [cenario.grupoG, apelido, cenario.contaC],
  );
  const id = r.rows[0]!.id;
  jogadoresCriados.push(id);
  for (const [habilidade, valor] of notas) {
    await db.query(
      'INSERT INTO notas (jogador_id, habilidade_id, grupo_id, valor) VALUES ($1, $2, $3, $4)',
      [id, habilidade, cenario.grupoG, valor],
    );
  }
  return id;
}

async function notasDe(jogador: string) {
  const r = await aberto.db.query<{ habilidade: string; valor: number }>(
    'SELECT habilidade_id AS habilidade, valor FROM notas WHERE jogador_id = $1 ORDER BY habilidade_id',
    [jogador],
  );
  return r.rows;
}

describe('habilidades.listar', () => {
  it('GEL-88: devolve as habilidades do grupo na ordem de cadastro', async () => {
    const lista = await como((db) => habilidades.listar(db, aberto.cenario.grupoG));
    expect(lista.slice(0, 6).map((h) => h.nome)).toEqual([...HABILIDADES_INICIAIS]);
    expect(lista.every((h) => typeof h.id === 'string')).toBe(true);
  });

  it('GEL-96: não traz habilidades de outro grupo', async () => {
    const deG = await como((db) => habilidades.listar(db, aberto.cenario.grupoG));
    const deH = await como(
      (db) => habilidades.listar(db, aberto.cenario.grupoH),
      aberto.cenario.contaB,
    );
    const idsG = new Set(deG.map((h) => h.id));
    expect(deH.some((h) => idsG.has(h.id))).toBe(false);
  });
});

describe('habilidades.criar', () => {
  it('GEL-89, SEC-008: a criada vai para o fim da ordem e audita habilidade_criada só com o id', async () => {
    const r = await como(
      (db) => habilidades.criar(db, aberto.cenario.grupoG, { nome: 'Cabeceio' }),
      aberto.cenario.contaO,
    );
    expect(r.resultado).toBe('ok');
    if (r.resultado !== 'ok') return;
    criadas.push(r.habilidade.id);
    expect(r.habilidade.nome).toBe('Cabeceio');
    expect((await nomesDeG()).at(-1)).toBe('Cabeceio');
    const a = await eventos('habilidade_criada', r.habilidade.id);
    expect(a).toHaveLength(1);
    expect(a[0]?.autor).toBe(aberto.cenario.contaO);
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('Cabeceio');
  });

  it('GEL-91: "passe" com "Passe" no grupo dá nome_repetido e nada é criado', async () => {
    const antes = await nomesDeG();
    const r = await como((db) => habilidades.criar(db, aberto.cenario.grupoG, { nome: 'passe' }));
    expect(r).toEqual({ resultado: 'nome_repetido' });
    expect(await nomesDeG()).toEqual(antes);
  });

  it('GEL-91: o mesmo nome em outro grupo não conta como repetido', async () => {
    const r = await como(
      (db) => habilidades.criar(db, aberto.cenario.grupoH, { nome: 'Nome Só de H' }),
      aberto.cenario.contaB,
    );
    expect(r.resultado).toBe('ok');
    if (r.resultado === 'ok') criadas.push(r.habilidade.id);
    const deG = await como((db) =>
      habilidades.criar(db, aberto.cenario.grupoG, { nome: 'nome só de h' }),
    );
    expect(deG.resultado).toBe('ok');
    if (deG.resultado === 'ok') criadas.push(deG.habilidade.id);
  });
});

describe('habilidades.renomear', () => {
  it('GEL-92, SEC-008: renomear "Drible" mantém as notas e a posição e audita habilidade_renomeada', async () => {
    const drible = await idDe('Drible');
    const jogador = await jogadorComNotas('Driblador', [[drible, 9]]);
    const posicao = (await nomesDeG()).indexOf('Drible');
    const r = await como((db) =>
      habilidades.renomear(db, aberto.cenario.grupoG, drible, { nome: 'Finta' }),
    );
    expect(r).toEqual({ resultado: 'ok', habilidade: { id: drible, nome: 'Finta' } });
    expect((await nomesDeG()).indexOf('Finta')).toBe(posicao);
    expect(await notasDe(jogador)).toEqual([{ habilidade: drible, valor: 9 }]);
    const a = await eventos('habilidade_renomeada', drible);
    expect(a).toHaveLength(1);
    expect(a[0]?.resumo).toEqual({ campos: ['nome'] });
  });

  it('GEL-91: renomear para o nome de outra habilidade (sem caixa) dá nome_repetido', async () => {
    const drible = await idDe('Drible');
    const r = await como((db) =>
      habilidades.renomear(db, aberto.cenario.grupoG, drible, { nome: 'CHUTE' }),
    );
    expect(r).toEqual({ resultado: 'nome_repetido' });
    expect(await nomesDeG()).toContain('Drible');
  });

  it('GEL-92: mudar só a caixa do próprio nome é aceito', async () => {
    const r = await como((db) =>
      habilidades.criar(db, aberto.cenario.grupoG, { nome: 'lançamento' }),
    );
    if (r.resultado !== 'ok') throw new Error('criar falhou');
    criadas.push(r.habilidade.id);
    const re = await como((db) =>
      habilidades.renomear(db, aberto.cenario.grupoG, r.habilidade.id, { nome: 'Lançamento' }),
    );
    expect(re).toEqual({
      resultado: 'ok',
      habilidade: { id: r.habilidade.id, nome: 'Lançamento' },
    });
  });

  it('SEC-008: renomear para o mesmo nome não grava nem audita', async () => {
    const drible = await idDe('Drible');
    const r = await como((db) =>
      habilidades.renomear(db, aberto.cenario.grupoG, drible, { nome: 'Drible' }),
    );
    expect(r.resultado).toBe('ok');
    expect(await eventos('habilidade_renomeada', drible)).toEqual([]);
  });

  it('GEL-96: habilidade de outro grupo dá nao_encontrada e nada muda', async () => {
    const drible = await idDe('Drible');
    const r = await como(
      (db) => habilidades.renomear(db, aberto.cenario.grupoH, drible, { nome: 'Finta' }),
      aberto.cenario.contaB,
    );
    expect(r).toEqual({ resultado: 'nao_encontrada' });
    expect(await nomesDeG()).toContain('Drible');
  });
});

describe('habilidades.excluir', () => {
  it('GEL-93: excluir apaga as notas só dela e audita habilidade_excluida', async () => {
    const r = await como((db) =>
      habilidades.criar(db, aberto.cenario.grupoG, { nome: 'Para Excluir' }),
    );
    if (r.resultado !== 'ok') throw new Error('criar falhou');
    const alvo = r.habilidade.id;
    criadas.push(alvo);
    const passe = await idDe('Passe');
    const jogador = await jogadorComNotas('Com Duas Notas', [
      [alvo, 4],
      [passe, 6],
    ]);
    const e = await como((db) => habilidades.excluir(db, aberto.cenario.grupoG, alvo));
    expect(e).toEqual({ resultado: 'ok' });
    expect(await notasDe(jogador)).toEqual([{ habilidade: passe, valor: 6 }]);
    expect(await nomesDeG()).not.toContain('Para Excluir');
    const a = await eventos('habilidade_excluida', alvo);
    expect(a).toHaveLength(1);
    expect(JSON.stringify(a[0]?.resumo)).not.toContain('Para Excluir');
  });

  it('GEL-96: habilidade de outro grupo dá nao_encontrada e nada é apagado', async () => {
    const passe = await idDe('Passe');
    const r = await como(
      (db) => habilidades.excluir(db, aberto.cenario.grupoH, passe),
      aberto.cenario.contaB,
    );
    expect(r).toEqual({ resultado: 'nao_encontrada' });
    expect(await nomesDeG()).toContain('Passe');
  });
});
