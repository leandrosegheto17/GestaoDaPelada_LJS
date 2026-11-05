import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { HABILIDADES_INICIAIS } from '@pelada/dominio';
import { grupos } from '../../src/infraestrutura/db/repositorios/grupos.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { comDb } from './apoio.ts';

/**
 * Repositório de grupos: criar, listar e ler (T26; GEL-01, GEL-02, GEL-14, GEL-20, GEL-27). Contra o cenário de
 * grupos (C criadora de G, O outra admin de G, B só de H), cada caso numa transação como `pelada_app`, desfeita no fim.
 * No cenário, G tem 3 jogadores (2 com período aberto, 1 com período encerrado), as 6 habilidades iniciais e 2 admins.
 */

let aberto: CenarioGruposAberto;

/** Hoje do relógio da requisição: os pesos padrão nascem vigentes desde ele (PAR-15, T34 da partidas-e-ranking). */
const HOJE = '2026-11-05';

const DADOS = { nome: 'Pelada do Repositório', diaSemana: 'quarta', frequencia: 'quinzenal', horario: '20:30' } as const;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('grupos.criar', () => {
  it('GEL-01: devolve id e slug, e o grupo nasce com criado_por, vínculo com financeiro e auditoria', async () => {
    const { url, cenario } = aberto;
    await comDb(url, cenario.contaB, async (db) => {
      const criado = await grupos.criar(db, DADOS, HOJE);
      expect(criado.slug).toBe('pelada-do-repositorio');
      const detalhe = await grupos.ler(db, criado.id);
      expect(detalhe).toMatchObject({ nome: DADOS.nome, diaSemana: 'quarta', frequencia: 'quinzenal', horario: '20:30' });
      expect(detalhe?.souCriador).toBe(true);
      expect(detalhe?.admins).toBe(1);
      const lista = await grupos.listarDaConta(db);
      expect(lista.ativos.map((g) => g.id)).toContain(criado.id);
    });
  });

  it('GEL-02: o grupo criado tem as 6 habilidades iniciais na ordem da spec', async () => {
    const { url, cenario } = aberto;
    const ordem = await comDb(url, cenario.contaB, async (db) => {
      const criado = await grupos.criar(db, { ...DADOS, nome: 'Pelada das Habilidades' }, HOJE);
      const r = await db
        .selectFrom('habilidades')
        .select('nome')
        .where('grupo_id', '=', criado.id)
        .orderBy('ordem')
        .execute();
      return r.map((h) => h.nome);
    });
    expect(ordem).toEqual(['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme']);
    expect(ordem).toEqual([...HABILIDADES_INICIAIS]);
  });

  it('GEL-14: o slug de um grupo arquivado continua ocupado: o novo ganha -2', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const criado = await comDb(url, cenario.contaB, (db) => grupos.criar(db, { ...DADOS, nome: 'Pelada de Quinta' }, HOJE));
    expect(cenario.slugG).toBe('pelada-de-quinta');
    expect(criado.slug).toBe('pelada-de-quinta-2');
  });

  it('GEL-14: sem colisão, a base do slug vem do domínio (sem acento, minúsculas, hífens)', async () => {
    const { url, cenario } = aberto;
    const criado = await comDb(url, cenario.contaB, (db) => grupos.criar(db, { ...DADOS, nome: 'Fute São João!' }, HOJE));
    expect(criado.slug).toBe('fute-sao-joao');
  });

  it('GEL-01: sem conta na sessão, a grupo_criar recusa (42501) e nada é criado', async () => {
    const { url } = aberto;
    await expect(comDb(url, null, (db) => grupos.criar(db, { ...DADOS, nome: 'Pelada Sem Conta' }, HOJE))).rejects.toMatchObject({
      code: '42501',
    });
    const r = await aberto.db.query(`SELECT 1 FROM grupos WHERE nome = 'Pelada Sem Conta'`);
    expect(r.rowCount).toBe(0);
  });
});

describe('grupos.listarDaConta', () => {
  it('GEL-27: com G ativo, C e O o veem em ativos, e nenhum arquivado', async () => {
    const { url, cenario } = aberto;
    for (const conta of [cenario.contaC, cenario.contaO]) {
      const lista = await comDb(url, conta, (db) => grupos.listarDaConta(db));
      expect(lista.ativos.map((g) => g.id)).toContain(cenario.grupoG);
      expect(lista.arquivados.map((g) => g.id)).not.toContain(cenario.grupoG);
    }
  });

  it('GEL-27: com G arquivado, C o vê em arquivados e não em ativos', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const lista = await comDb(url, cenario.contaC, (db) => grupos.listarDaConta(db));
    expect(lista.arquivados.map((g) => g.id)).toEqual([cenario.grupoG]);
    expect(lista.ativos.map((g) => g.id)).not.toContain(cenario.grupoG);
  });

  it('GEL-27: com G arquivado, O não o vê em nenhuma das listas', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const lista = await comDb(url, cenario.contaO, (db) => grupos.listarDaConta(db));
    expect(lista.ativos.map((g) => g.id)).not.toContain(cenario.grupoG);
    expect(lista.arquivados).toEqual([]);
  });

  it('GEL-27: cada item traz id, nome, slug, dia, frequência e horário em HH:MM', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => grupos.listarDaConta(db));
    const g = lista.ativos.find((item) => item.id === cenario.grupoG);
    expect(g && Object.keys(g).sort()).toEqual(['diaSemana', 'frequencia', 'horario', 'id', 'nome', 'slug']);
    expect(g?.horario).toMatch(/^\d{2}:\d{2}$/);
    expect(g?.slug).toBe(cenario.slugG);
  });

  it('GEL-27: a lista não traz grupo de outra conta', async () => {
    const { url, cenario } = aberto;
    const lista = await comDb(url, cenario.contaC, (db) => grupos.listarDaConta(db));
    expect(lista.ativos.map((g) => g.id)).not.toContain(cenario.grupoH);
  });
});

describe('grupos.ler', () => {
  it('GEL-20: conta só os jogadores com período aberto, as habilidades e os admins', async () => {
    const { url, cenario } = aberto;
    const detalhe = await comDb(url, cenario.contaC, (db) => grupos.ler(db, cenario.grupoG));
    const total = await aberto.db.query<{ n: string }>('SELECT count(*) AS n FROM jogadores WHERE grupo_id = $1', [
      cenario.grupoG,
    ]);
    // O cenário tem 3 jogadores; o inativo (período encerrado) não conta.
    expect(Number(total.rows[0]?.n)).toBe(3);
    expect(detalhe?.jogadoresAtivos).toBe(2);
    expect(detalhe?.habilidades).toBe(6);
    expect(detalhe?.admins).toBe(2);
  });

  it('GEL-20: inativar um jogador tira-o da contagem', async () => {
    const { url, cenario } = aberto;
    const detalhe = await comDb(url, cenario.contaC, async (db) => {
      await db
        .updateTable('periodos_ativos')
        .set({ fim: '2026-02-01' })
        .where('jogador_id', '=', cenario.idsG.jogadorAtivo)
        .where('fim', 'is', null)
        .execute();
      return grupos.ler(db, cenario.grupoG);
    });
    expect(detalhe?.jogadoresAtivos).toBe(1);
  });

  it('GEL-20: souCriador é verdadeiro para C e falso para O', async () => {
    const { url, cenario } = aberto;
    expect((await comDb(url, cenario.contaC, (db) => grupos.ler(db, cenario.grupoG)))?.souCriador).toBe(true);
    expect((await comDb(url, cenario.contaO, (db) => grupos.ler(db, cenario.grupoG)))?.souCriador).toBe(false);
  });

  it('GEL-20: devolve nome, slug, dia, frequência e horário do grupo', async () => {
    const { url, cenario } = aberto;
    const detalhe = await comDb(url, cenario.contaO, (db) => grupos.ler(db, cenario.grupoG));
    expect(detalhe).toMatchObject({ id: cenario.grupoG, nome: 'Pelada de Quinta', slug: cenario.slugG, arquivado: false });
    expect(detalhe?.horario).toMatch(/^\d{2}:\d{2}$/);
  });

  it('GEL-21: sem vínculo, nulo', async () => {
    const { url, cenario } = aberto;
    expect(await comDb(url, cenario.contaB, (db) => grupos.ler(db, cenario.grupoG))).toBeNull();
  });

  it('GEL-25: arquivado, nulo para O e o detalhe para C', async () => {
    const { url, cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    expect(await comDb(url, cenario.contaO, (db) => grupos.ler(db, cenario.grupoG))).toBeNull();
    expect((await comDb(url, cenario.contaC, (db) => grupos.ler(db, cenario.grupoG)))?.arquivado).toBe(true);
  });
});
