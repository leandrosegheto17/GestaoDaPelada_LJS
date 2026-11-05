import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';
import {
  abrirCenarioGrupos,
  comCenarioGrupos,
  gruposVistos,
  type CenarioGruposAberto,
} from './cenario-grupos.ts';

/**
 * Cenário de grupos e elenco (T0; GEL-112). Caracteriza o estado de partida: com as 23 migrações,
 * a criadora C e a outra admin O enxergam G como `pelada_app`; a conta B enxerga só H.
 *
 * Evidência da rede (registrar na T0 do tasks.md): com `grupo_criar` sabotada no banco de teste (sem o INSERT
 * em vinculos_admin), C deixa de ver G e o primeiro teste fica vermelho.
 */

const URL_BASE = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;

async function bancosDeTeste(): Promise<string[]> {
  return comCliente(URL_BASE, async (c) => {
    const r = await c.query<{ datname: string }>(
      `SELECT datname FROM pg_database WHERE datname LIKE 'teste\\_%'`,
    );
    return r.rows.map((l) => l.datname).sort();
  });
}

describe('cenário de grupos e elenco', () => {
  let aberto: CenarioGruposAberto;

  beforeAll(async () => {
    aberto = await abrirCenarioGrupos();
  });

  afterAll(async () => {
    await aberto?.fechar();
  });

  it('GEL-112: a criadora C enxerga G (e o grupo A do cenário de conta) como pelada_app', async () => {
    const { db, cenario } = aberto;
    expect(await gruposVistos(db, cenario.contaC)).toEqual([cenario.grupoA, cenario.grupoG].sort());
  });

  it('GEL-112: a outra admin O enxerga só G', async () => {
    const { db, cenario } = aberto;
    expect(await gruposVistos(db, cenario.contaO)).toEqual([cenario.grupoG]);
  });

  it('GEL-112: a conta B enxerga só H', async () => {
    const { db, cenario } = aberto;
    expect(await gruposVistos(db, cenario.contaB)).toEqual([cenario.grupoH]);
  });

  it('GEL-112: G nasce pela grupo_criar com criado_por = C e o slug da base', async () => {
    const { db, cenario } = aberto;
    const r = await db.query<{ criado_por: string; slug: string }>(
      'SELECT criado_por, slug FROM grupos WHERE id = $1',
      [cenario.grupoG],
    );
    expect(r.rows[0]).toEqual({ criado_por: cenario.contaC, slug: 'pelada-de-quinta' });
  });

  it.each(['jogadores', 'periodos_ativos', 'habilidades', 'notas', 'presencas', 'pagamentos_mes'])(
    'GEL-112: G tem ao menos uma linha em %s',
    async (tabela) => {
      const { db, cenario } = aberto;
      const r = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${db.escapeIdentifier(tabela)} WHERE grupo_id = $1`,
        [cenario.grupoG],
      );
      expect(r.rows[0]?.n).toBeGreaterThan(0);
    },
  );

  it('GEL-112: G tem uma linha em toda tabela com grupo_id do catálogo', async () => {
    const { db, cenario } = aberto;
    for (const { tabela, coluna } of cenario.tabelas) {
      const r = await db.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ${db.escapeIdentifier(tabela)} WHERE ${db.escapeIdentifier(coluna)} = $1`,
        [cenario.grupoG],
      );
      expect({ tabela, temLinha: (r.rows[0]?.n ?? 0) > 0 }).toEqual({ tabela, temLinha: true });
    }
  });
});

describe('limpeza do cenário de grupos', () => {
  it('GEL-112: o banco é removido no finally quando o corpo lança erro', async () => {
    let nome = '';
    await expect(
      comCenarioGrupos(async (_db, _cenario, banco) => {
        nome = banco.nome;
        throw new Error('falha de propósito');
      }),
    ).rejects.toThrow('falha de propósito');
    expect(nome).toMatch(/^teste_/);
    expect(await bancosDeTeste()).not.toContain(nome);
  });

  it('GEL-112: o banco é removido quando a criação do cenário de grupos falha', async () => {
    const antes = await bancosDeTeste();
    // Nome com 2 caracteres viola o CHECK de grupos.nome dentro da grupo_criar.
    await expect(
      comCenarioGrupos(async () => 'não deveria rodar', { nomeG: 'PQ' }),
    ).rejects.toMatchObject({
      code: '23514',
    });
    expect(await bancosDeTeste()).toEqual(antes);
  });

  it('GEL-112: abrirCenarioGrupos que falha na criação não deixa banco órfão', async () => {
    const antes = await bancosDeTeste();
    await expect(abrirCenarioGrupos({ nomeG: 'PQ' })).rejects.toMatchObject({ code: '23514' });
    expect(await bancosDeTeste()).toEqual(antes);
  });
});
