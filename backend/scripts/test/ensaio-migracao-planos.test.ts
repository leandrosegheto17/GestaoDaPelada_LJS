import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { conferirPlanos, ensaiar, slugDaCortesia } from '../src/ensaio-migracao.ts';
import { URL_BASE, urlDoBanco } from './apoio/banco.ts';

/**
 * Ensaio das migrações da planos-e-cobranca sobre um "dump da produção" (T18; PLA-11, PLA-12; AD-033, AD-057, AD-073,
 * AD-113). O dump é simulado por um banco migrado até antes da `planos-tabelas`, com dois grupos `uso_proprio` (um é o
 * grupo de teste) e um já `ativo`. As migrações desta feature vão numa pasta temporária com a constante
 * `SLUG_GRUPO_TESTE` da cortesia trocada pelo slug do grupo de teste do dump (o que o /executar faz com o slug da T9).
 * O ensaio real, com o backup cifrado da produção, é do usuário e do /executar, com a evidência na T18 do tasks.md.
 */

const PRIMEIRA_DA_FEATURE = '_planos-tabelas.sql';
const CORTESIA = '_planos-cortesia.sql';
const SLUG_TESTE = 'grupo-de-teste-do-ensaio';

let pastaAntes: string;
let pastaCompleta: string;
let referencia: string[];

beforeAll(async () => {
  const nomes = readdirSync(PASTA_MIGRACOES).filter((n) => n.endsWith('.sql')).sort();
  const primeira = nomes.find((n) => n.endsWith(PRIMEIRA_DA_FEATURE));
  expect(primeira, 'a migração da T10 existe').toBeDefined();
  pastaAntes = mkdtempSync(join(tmpdir(), 'migracoes-antes-planos-'));
  pastaCompleta = mkdtempSync(join(tmpdir(), 'migracoes-planos-'));
  for (const nome of nomes) {
    const origem = join(PASTA_MIGRACOES, nome);
    if (nome < (primeira ?? '')) copyFileSync(origem, join(pastaAntes, nome));
    if (nome.endsWith(CORTESIA)) {
      const texto = readFileSync(origem, 'utf8').replace(
        /SLUG_GRUPO_TESTE constant text := '[^']*';/,
        `SLUG_GRUPO_TESTE constant text := '${SLUG_TESTE}';`,
      );
      writeFileSync(join(pastaCompleta, nome), texto);
    } else {
      copyFileSync(origem, join(pastaCompleta, nome));
    }
  }
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaCompleta });
    referencia = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
});

afterAll(() => {
  for (const p of [pastaAntes, pastaCompleta]) if (p) rmSync(p, { recursive: true, force: true });
});

interface Semeado {
  teste: string;
  outro: string;
  ativo: string;
}

/** Três grupos com caixa; o primeiro é o grupo de teste. */
async function semear(url: string): Promise<Semeado> {
  return comConexao(url, async (c) => {
    const conta = (
      await c.query<{ id: string }>(
        `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('criadora@exemplo.test', 'Criadora', 'x', now()) RETURNING id`,
      )
    ).rows[0]!.id;
    const grupo = async (slug: string, situacao: string) => {
      const id = (
        await c.query<{ id: string }>(
          `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, situacao_comercial, criado_por, criado_em)
           VALUES ($1, $1, 'quinta', 'semanal', '20:00', $2, $3, now()) RETURNING id`,
          [slug, situacao, conta],
        )
      ).rows[0]!.id;
      await c.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, true, $1, now())`,
        [conta, id],
      );
      await c.query(
        `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now())`,
        [id, conta],
      );
      return id;
    };
    return { teste: await grupo(SLUG_TESTE, 'uso_proprio'), outro: await grupo('outra-pelada', 'uso_proprio'), ativo: await grupo('pelada-ativa', 'ativo') };
  });
}

async function comDump(fn: (url: string, s: Semeado) => Promise<void>): Promise<void> {
  const nome = `ensaio_teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaAntes });
    await fn(url, await semear(url));
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

describe('ensaio das migrações da planos-e-cobranca', () => {
  it('PLA-11: nenhuma tabela muda de contagem e só o grupo do slug fica uso_proprio', async () => {
    await comDump(async (url, s) => {
      const r = await ensaiar(url, { pasta: pastaCompleta, referencia });
      expect(r.tabelasAlteradas).toEqual([]);
      expect(r.planos.slugGrupoTeste).toBe(SLUG_TESTE);
      expect(r.planos.problemas).toEqual([]);
      const porId = Object.fromEntries(r.planos.grupos.map((g) => [g.grupoId, g]));
      expect(porId[s.teste]).toMatchObject({ antes: 'uso_proprio', depois: 'uso_proprio', trialInicioDepois: null });
      expect(porId[s.outro]).toMatchObject({ antes: 'uso_proprio', depois: 'trial', trialInicioDepois: r.planos.hoje });
      expect(porId[s.ativo]).toMatchObject({ antes: 'ativo', depois: 'ativo', trialInicioDepois: null });
      expect(r.segundaExecucao).toEqual([]);
    });
  });

  it('PLA-12: o relatório não traz nome de grupo nem de pessoa', async () => {
    await comDump(async (url) => {
      const r = await ensaiar(url, { pasta: pastaCompleta, referencia });
      expect(JSON.stringify(r.planos)).not.toMatch(/Criadora|criadora@exemplo/);
    });
  });
});

describe('conferirPlanos', () => {
  const g = (slug: string, s: string, t: string | null = null) => ({ slug, s, t });

  it('PLA-11: o grupo de teste que deixa a cortesia é problema', () => {
    const antes = new Map([['1', g('teste', 'uso_proprio')]]);
    const depois = new Map([['1', g('teste', 'trial', '2026-11-05')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toHaveLength(1);
  });

  it('PLA-11: uso_proprio que fica uso_proprio sem ser o de teste é problema', () => {
    const antes = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'uso_proprio')]]);
    const depois = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'uso_proprio')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toHaveLength(1);
  });

  it('PLA-11: trial com outra data é problema', () => {
    const antes = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'uso_proprio')]]);
    const depois = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'trial', '2026-11-04')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toHaveLength(1);
  });

  it('PLA-11: situação que não era uso_proprio e muda é problema', () => {
    const antes = new Map([['1', g('teste', 'uso_proprio')], ['2', g('ativa', 'ativo')]]);
    const depois = new Map([['1', g('teste', 'uso_proprio')], ['2', g('ativa', 'trial', '2026-11-05')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toHaveLength(1);
  });

  it('PLA-11: slug que não existe no dump é problema', () => {
    const antes = new Map([['1', g('outro', 'uso_proprio')]]);
    const depois = new Map([['1', g('outro', 'trial', '2026-11-05')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toEqual([
      'nenhum grupo com o slug do grupo de teste (teste)',
    ]);
  });

  it('PLA-11: sem a cortesia no ensaio, qualquer mudança de situação é problema', () => {
    const antes = new Map([['1', g('outro', 'uso_proprio')]]);
    const depois = new Map([['1', g('outro', 'trial', '2026-11-05')]]);
    expect(conferirPlanos(antes, depois, null, '2026-11-05').problemas).toHaveLength(1);
  });

  it('PLA-11: o caso certo não tem problema', () => {
    const antes = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'uso_proprio')], ['3', g('ativa', 'ativo')]]);
    const depois = new Map([['1', g('teste', 'uso_proprio')], ['2', g('outro', 'trial', '2026-11-05')], ['3', g('ativa', 'ativo')]]);
    expect(conferirPlanos(antes, depois, 'teste', '2026-11-05').problemas).toEqual([]);
  });
});

describe('slugDaCortesia', () => {
  it('PLA-11: lê a constante da migração da pasta', () => {
    expect(slugDaCortesia(pastaCompleta)).toBe(SLUG_TESTE);
  });

  it('PLA-11: pasta sem a cortesia devolve nulo', () => {
    expect(slugDaCortesia(pastaAntes)).toBeNull();
  });
});
