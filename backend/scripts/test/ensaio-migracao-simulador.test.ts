import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { ensaiar, mudancaDoEsquema } from '../src/ensaio-migracao.ts';
import { comBancoMigrado, URL_BASE, urlDoBanco } from './apoio/banco.ts';

/**
 * Ensaio da migração da simulador sobre um "dump da produção" (T42; SIM-67; AD-033, AD-037, AD-048, AD-073). O dump é
 * simulado por um banco migrado até a última migração antes da `grupo-criar-contrair` (as da partidas-e-ranking), com
 * dados de negócio. A contrair e as do financeiro, que vêm depois no nome, são as pendentes.
 *
 * Para o diff do schema ser só o desta feature, o ensaio "só da simulador" usa a pasta até a contrair, com a referência
 * lida de um banco migrado com essa mesma pasta; o ensaio completo usa todas as migrações e a referência da v2.
 * O ensaio real, com o backup cifrado da produção, é do usuário e do /executar (`pnpm --filter @pelada/scripts ensaio`),
 * com a evidência registrada na T42 do tasks.md.
 */

const CONTRAIR = '_grupo-criar-contrair.sql';
/** Prefixo da linha do `lerEsquema` para a função (`'funcao ' || proname || '(' || args || ')'`). */
const FUNCAO_GRUPO_CRIAR = 'funcao grupo_criar(';

let pastaAntes: string;
let pastaAteContrair: string;
let referenciaAteContrair: string[];
let referenciaV2: string[];
let nomeContrair = '';

function copiarAte(pasta: string, ate: (nome: string) => boolean): void {
  for (const nome of readdirSync(PASTA_MIGRACOES)) {
    if (!nome.endsWith('.sql')) continue;
    if (ate(nome)) copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
  }
}

async function esquemaDaPasta(pasta: string | undefined): Promise<string[]> {
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta });
    return await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

beforeAll(async () => {
  nomeContrair = readdirSync(PASTA_MIGRACOES).find((n) => n.endsWith(CONTRAIR)) ?? '';
  expect(nomeContrair, 'a migração da T25 existe').not.toBe('');
  pastaAntes = mkdtempSync(join(tmpdir(), 'migracoes-antes-simulador-'));
  pastaAteContrair = mkdtempSync(join(tmpdir(), 'migracoes-ate-contrair-'));
  // Os nomes começam pelo timestamp de 13 dígitos: a ordem de texto é a ordem de aplicação.
  copiarAte(pastaAntes, (n) => n < nomeContrair);
  copiarAte(pastaAteContrair, (n) => n <= nomeContrair);
  referenciaAteContrair = await esquemaDaPasta(pastaAteContrair);
  await comBancoMigrado(async (url) => {
    referenciaV2 = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  });
});

afterAll(() => {
  for (const p of [pastaAntes, pastaAteContrair]) if (p) rmSync(p, { recursive: true, force: true });
});

/** Um grupo com caixa, jogador e partida (os pesos vêm da `pesos-padrao`, já aplicada no dump). */
async function semear(url: string): Promise<string> {
  return comConexao(url, async (c) => {
    const conta = (
      await c.query<{ id: string }>(
        `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('criadora@exemplo.test', 'Criadora', 'x', now()) RETURNING id`,
      )
    ).rows[0]!.id;
    const grupo = (
      await c.query<{ id: string }>(
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ('Pelada do Ensaio', 'pelada-do-ensaio', 'quinta', 'semanal', '20:00', $1, '2026-03-10T23:30:00Z') RETURNING id`,
        [conta],
      )
    ).rows[0]!.id;
    await c.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, true, $1, now())`,
      [conta, grupo],
    );
    await c.query(
      `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial)
       VALUES ($1, 5000, 0, '2026-01-01')`,
      [grupo],
    );
    await c.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now())`,
      [grupo, conta],
    );
    const jogador = (
      await c.query<{ id: string }>(
        `INSERT INTO jogadores (grupo_id, apelido, ano_nascimento, posicao, pontuacao_inicial, criado_por, criado_em,
                                alterado_por, alterado_em)
         VALUES ($1, 'Do Ensaio', 1990, 'meia', 0, $2, now(), $2, now()) RETURNING id`,
        [grupo, conta],
      )
    ).rows[0]!.id;
    await c.query(`INSERT INTO periodos_ativos (jogador_id, grupo_id, inicio) VALUES ($1, $2, '2026-01-01')`, [jogador, grupo]);
    const partida = (
      await c.query<{ id: string }>(
        `INSERT INTO partidas (grupo_id, data, criada_por, criada_em, alterada_por, alterada_em)
         VALUES ($1, '2026-03-12', $2, now(), $2, now()) RETURNING id`,
        [grupo, conta],
      )
    ).rows[0]!.id;
    await c.query(`INSERT INTO presencas (partida_id, jogador_id, grupo_id, situacao) VALUES ($1, $2, $3, 'presente')`, [
      partida,
      jogador,
      grupo,
    ]);
    return grupo;
  });
}

/** Banco `ensaio_teste_*` migrado até antes da contrair e com dados; apagado no `finally`. */
async function comBancoDeProducao(fn: (url: string) => Promise<void>): Promise<void> {
  const nome = `ensaio_teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaAntes });
    await semear(url);
    await fn(url);
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

async function funcoesGrupoCriar(url: string): Promise<string[]> {
  const esquema = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  return esquema.filter((l) => l.startsWith(FUNCAO_GRUPO_CRIAR));
}

describe('ensaiar com a migração da simulador', () => {
  it('SIM-67: o dump tem as 2 grupo_criar; depois da contrair, só a de 7 parâmetros', async () => {
    await comBancoDeProducao(async (url) => {
      expect(await funcoesGrupoCriar(url)).toHaveLength(2);
      await ensaiar(url, { pasta: pastaAteContrair, referencia: referenciaAteContrair });
      const depois = await funcoesGrupoCriar(url);
      expect(depois).toHaveLength(1);
      // A de 7 tem a data de hoje como parâmetro: um `date` que a de 6 não tem.
      expect(depois[0]).toContain('date');
    });
  });

  it('SIM-67: nenhuma tabela perde linha e o diff do schema é só a grupo_criar de 6 parâmetros', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { pasta: pastaAteContrair, referencia: referenciaAteContrair });
      expect(r.aplicadas.map((n) => n.replace(/\.sql$/, ''))).toEqual([nomeContrair.replace(/\.sql$/, '')]);
      expect(r.tabelasAlteradas).toEqual([]);
      for (const tabela of Object.keys(r.antes)) expect({ tabela, n: r.depois[tabela] }).toEqual({ tabela, n: r.antes[tabela] });
      expect(r.mudancaDoEsquema.novas).toEqual([]);
      // Sai a função e o que pende dela (grants de EXECUTE), nada mais.
      expect(r.mudancaDoEsquema.removidas.length).toBeGreaterThanOrEqual(1);
      for (const linha of r.mudancaDoEsquema.removidas) expect(linha).toContain('grupo_criar(');
      expect(r.mudancaDoEsquema.removidas.filter((l) => l.startsWith(FUNCAO_GRUPO_CRIAR))).toHaveLength(1);
      expect(r.esquema).toEqual({ faltando: [], sobrando: [] });
      expect(r.segundaExecucao).toEqual([]);
    });
  });

  it('SIM-67: o ensaio completo, com as do financeiro, termina na referência da v2 e passa', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia: referenciaV2 });
      expect(r.aplicadas.some((n) => n.endsWith(CONTRAIR))).toBe(true);
      expect(r.tabelasAlteradas).toEqual([]);
      expect(r.esquema).toEqual({ faltando: [], sobrando: [] });
      expect(r.segundaExecucao).toEqual([]);
      expect(r.ok).toBe(true);
    });
  });

  it('SIM-67: referência que ainda tem a grupo_criar de 6 reprova o ensaio e a lista como faltando', async () => {
    await comBancoDeProducao(async (url) => {
      const comAAntiga = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
      const daAntiga = comAAntiga.filter((l) => l.includes('grupo_criar(') && !referenciaAteContrair.includes(l));
      expect(daAntiga.length).toBeGreaterThanOrEqual(1);
      const r = await ensaiar(url, { pasta: pastaAteContrair, referencia: [...referenciaAteContrair, ...daAntiga] });
      expect(r.esquema.faltando).toEqual(expect.arrayContaining(daAntiga));
      expect(r.ok).toBe(false);
    });
  });
});

describe('mudancaDoEsquema', () => {
  it('SIM-67: separa as linhas que saíram das que entraram, ordenadas', () => {
    expect(mudancaDoEsquema(['b', 'a', 'c'], ['c', 'd', 'a'])).toEqual({ removidas: ['b'], novas: ['d'] });
    expect(mudancaDoEsquema(['a'], ['a'])).toEqual({ removidas: [], novas: [] });
  });
});
