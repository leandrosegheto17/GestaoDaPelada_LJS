import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { conferirPush, ensaiar, ErroEnsaio, TABELAS_DO_PUSH } from '../src/ensaio-migracao.ts';
import { URL_BASE, urlDoBanco } from './apoio/banco.ts';

/**
 * Ensaio das migrações da notificacoes sobre um "dump da produção" (T33; NOT-49; AD-033, AD-073). O dump é simulado
 * por um banco migrado até antes da `notificacoes-tabelas`, com uma conta, um grupo Pro com caixa e uma partida. O
 * ensaio aplica as migrações da feature (T7 a T11) e confere: nenhuma tabela perde linha, as 3 tabelas novas existem e
 * estão vazias, o schema é o da referência (o banco migrado do zero), a segunda execução não aplica nada.
 * O ensaio real, com o backup cifrado da produção (decifrado pelo usuário fora do repositório), é do /executar, com a
 * evidência na T33 do tasks.md. Nada roda contra a `main` do Neon: o `ensaiar` exige host local.
 */

const PRIMEIRA_DA_FEATURE = '_notificacoes-tabelas.sql';
/** A última migração da feature anterior a esta no roteiro (NOT-49: as desta vêm depois). */
const TIMESTAMP_MINIMO = 1792844520000;

let pastaAntes: string;
let daFeature: string[];
let referencia: string[];

beforeAll(async () => {
  const nomes = readdirSync(PASTA_MIGRACOES)
    .filter((n) => n.endsWith('.sql'))
    .sort();
  const primeira = nomes.find((n) => n.endsWith(PRIMEIRA_DA_FEATURE));
  expect(primeira, 'a migração da T7 existe').toBeDefined();
  daFeature = nomes.filter((n) => n >= (primeira ?? ''));
  pastaAntes = mkdtempSync(join(tmpdir(), 'migracoes-antes-notificacoes-'));
  for (const nome of nomes)
    if (nome < (primeira ?? '')) copyFileSync(join(PASTA_MIGRACOES, nome), join(pastaAntes, nome));

  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url);
    referencia = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
});

afterAll(() => {
  if (pastaAntes) rmSync(pastaAntes, { recursive: true, force: true });
});

/** Uma conta criadora, um grupo Pro com caixa (para a amostra do FIN-39) e uma partida. */
async function semear(url: string): Promise<void> {
  await comConexao(url, async (c) => {
    const conta = (
      await c.query<{ id: string }>(
        `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('criadora@exemplo.test', 'Criadora', 'x', now()) RETURNING id`,
      )
    ).rows[0]!.id;
    const grupo = (
      await c.query<{ id: string }>(
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, situacao_comercial, criado_por, criado_em)
         VALUES ('Pelada do Ensaio', 'pelada-do-ensaio', 'quinta', 'semanal', '20:00', 'ativo', $1, now()) RETURNING id`,
        [conta],
      )
    ).rows[0]!.id;
    await c.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, true, $1, now())`,
      [conta, grupo],
    );
    await c.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now())`,
      [grupo, conta],
    );
    await c.query(
      `INSERT INTO partidas (grupo_id, data, choveu, criada_por, criada_em, alterada_por, alterada_em)
       VALUES ($1, '2026-01-08', false, $2, now(), $2, now())`,
      [grupo, conta],
    );
  });
}

async function comDump(
  fn: (url: string) => Promise<void>,
  opcoes: { semear?: boolean } = {},
): Promise<void> {
  const nome = `ensaio_teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaAntes });
    if (opcoes.semear ?? true) await semear(url);
    await fn(url);
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

describe('ensaio das migrações da notificacoes', () => {
  it('NOT-49: aplica as migrações da feature, nenhuma tabela perde linha e as 3 tabelas novas ficam vazias', async () => {
    await comDump(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.aplicadas.map((n) => n.replace(/\.sql$/, ''))).toEqual(
        daFeature.map((n) => n.replace(/\.sql$/, '')),
      );
      expect(r.tabelasAlteradas).toEqual([]);
      expect(r.push.aplicada).toBe(true);
      expect(r.push.problemas).toEqual([]);
      expect(r.push.linhas).toEqual({ push_ranking: 0, push_conta: 0, avisos_cobranca: 0 });
      for (const tabela of Object.keys(r.antes)) expect(r.depois[tabela]).toBe(r.antes[tabela]);
      expect(r.ok).toBe(true);
    });
  });

  it('NOT-49: o schema é a referência mais só o que as migrações da feature criam', async () => {
    await comDump(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.esquema.faltando).toEqual([]);
      expect(r.esquema.sobrando).toEqual([]);
      // Troca de corpo de função com a mesma assinatura (ex.: `grupo_criar` na R1-T2, AD-125) aparece como removida e
      // nova: não é remoção. Qualquer outra remoção (tabela, coluna, policy, função) continua reprovando.
      const novas = r.mudancaDoEsquema.novas;
      const semTrocaDeCorpo = r.mudancaDoEsquema.removidas.filter((linha) => {
        const i = linha.lastIndexOf(' corpo=');
        if (!linha.startsWith('funcao ') || i < 0) return true;
        const prefixo = linha.slice(0, i + ' corpo='.length);
        return !novas.some((n) => n.startsWith(prefixo));
      });
      expect(semTrocaDeCorpo).toEqual([]);
      const textoNovas = novas.join('\n');
      for (const tabela of TABELAS_DO_PUSH) expect(textoNovas).toContain(tabela);
      for (const funcao of [
        'push_ranking_assinar',
        'push_conta_assinar',
        'push_envio_grupo',
        'aviso_cobranca_registrar',
        'notificacoes_limpar',
      ])
        expect(textoNovas).toContain(funcao);
    });
  });

  it('NOT-49: a segunda execução não aplica nada nem muda linha (zero DDL)', async () => {
    await comDump(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.segundaExecucao).toEqual([]);
      expect(r.tabelasAlteradas).not.toContain('segunda execução mudou linhas');
    });
  });

  it('NOT-49: dump sem linhas nas tabelas de negócio bloqueia o ensaio (AD-073)', async () => {
    await comDump(
      async (url) => {
        await expect(ensaiar(url, { referencia })).rejects.toBeInstanceOf(ErroEnsaio);
      },
      { semear: false },
    );
  });

  it('NOT-49: as migrações da feature têm timestamp depois da última da feature anterior', () => {
    expect(daFeature.length).toBeGreaterThanOrEqual(5);
    for (const nome of daFeature) {
      const ts = Number(/^(\d+)_/.exec(nome)?.[1]);
      expect(ts, nome).toBeGreaterThan(TIMESTAMP_MINIMO);
    }
  });
});

describe('conferirPush', () => {
  const aplicadas = ['1792846200000_notificacoes-tabelas.sql'];

  it('NOT-49: sem a migração no ensaio, nada a conferir', () => {
    expect(conferirPush(['1792844520000_outra.sql'], {})).toEqual({
      aplicada: false,
      linhas: {},
      problemas: [],
    });
  });

  it('NOT-49: tabela do push com linha é problema', () => {
    const r = conferirPush(aplicadas, { push_ranking: 1, push_conta: 0, avisos_cobranca: 0 });
    expect(r.problemas).toEqual(['push_ranking: 1 linhas, esperado vazia']);
  });

  it('NOT-49: tabela do push que não existe depois de migrar é problema', () => {
    const r = conferirPush(aplicadas, { push_ranking: 0, push_conta: 0 });
    expect(r.problemas).toEqual(['avisos_cobranca: não existe depois de migrar']);
  });

  it('NOT-49: as 3 vazias não têm problema', () => {
    const r = conferirPush(aplicadas, { push_ranking: 0, push_conta: 0, avisos_cobranca: 0 });
    expect(r.problemas).toEqual([]);
  });
});
