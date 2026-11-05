import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { ensaiar, ErroEnsaio } from '../src/ensaio-migracao.ts';
import { comBancoMigrado, URL_BASE, urlDoBanco } from './apoio/banco.ts';

/**
 * Ensaio das migrações do financeiro sobre um "dump da produção" (T15; FIN-42, FIN-39; AD-033). O dump é simulado por
 * um banco migrado só até a última migração antes do financeiro, com dados de negócio; as migrações T9 e T10 são as
 * pendentes. O ensaio real, com o backup cifrado da produção, é feito pelo usuário e pelo /executar
 * (`pnpm --filter @pelada/scripts ensaio`), com a evidência registrada na T15 do tasks.md.
 */

const DO_FINANCEIRO = ['_financeiro-rls.sql', '_financeiro-trava-acesso.sql'] as const;

let pastaAntiga: string;
let referencia: string[];

beforeAll(async () => {
  pastaAntiga = mkdtempSync(join(tmpdir(), 'migracoes-antes-financeiro-'));
  for (const nome of readdirSync(PASTA_MIGRACOES)) {
    if (DO_FINANCEIRO.some((s) => nome.endsWith(s))) continue;
    copyFileSync(join(PASTA_MIGRACOES, nome), join(pastaAntiga, nome));
  }
  await comBancoMigrado(async (url) => {
    referencia = await comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));
  });
});

afterAll(() => {
  if (pastaAntiga) rmSync(pastaAntiga, { recursive: true, force: true });
});

interface Ids {
  grupo: string;
  comAcesso: string;
  semAcesso: string;
}

async function semear(url: string, comAdminSemAcesso = true): Promise<Ids> {
  return comConexao(url, async (c) => {
    const conta = async (email: string): Promise<string> =>
      (
        await c.query<{ id: string }>(
          `INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ($1, $1, 'x', now()) RETURNING id`,
          [email],
        )
      ).rows[0]!.id;
    const comAcesso = await conta('criadora@exemplo.test');
    const semAcesso = await conta('outra@exemplo.test');
    const grupo = (
      await c.query<{ id: string }>(
        `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
         VALUES ('Pelada', 'pelada-ensaio', 'quinta', 'semanal', '20:00', $1, now()) RETURNING id`,
        [comAcesso],
      )
    ).rows[0]!.id;
    await c.query(
      `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, true, $1, now())`,
      [comAcesso, grupo],
    );
    if (comAdminSemAcesso) {
      await c.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, false, $3, now())`,
        [semAcesso, grupo, comAcesso],
      );
    }
    await c.query(
      `INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial) VALUES ($1, 5000, 0, '2026-01-01')`,
      [grupo],
    );
    await c.query(
      `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
       VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now()),
              ($1, 'saida', '2026-01-09', 'Bolas', 1500, $2, now(), $2, now())`,
      [grupo, comAcesso],
    );
    return { grupo, comAcesso, semAcesso };
  });
}

/** Banco `ensaio_*` migrado até antes do financeiro; apagado no `finally`. */
async function comBancoDeProducao(
  fn: (url: string) => Promise<void>,
  opcoes: { semear?: boolean; adminSemAcesso?: boolean } = {},
): Promise<void> {
  const nome = `ensaio_teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaAntiga });
    if (opcoes.semear !== false) await semear(url, opcoes.adminSemAcesso !== false);
    await fn(url);
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

describe('ensaiar', () => {
  it('FIN-42: aplica as migrações do financeiro sem mudar a contagem de nenhuma tabela, com schema igual e segunda execução vazia', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.aplicadas.map((n) => n.replace(/^\d+_/, '').replace(/\.sql$/, ''))).toEqual(
        expect.arrayContaining(['financeiro-rls', 'financeiro-trava-acesso']),
      );
      expect(r.tabelasAlteradas).toEqual([]);
      expect(r.depois).toEqual(r.antes);
      expect(r.esquema).toEqual({ faltando: [], sobrando: [] });
      expect(r.segundaExecucao).toEqual([]);
      expect(r.ok).toBe(true);
    });
  });

  it('FIN-39: a conta com acesso lê o caixa do grupo dela inteiro e a sem acesso lê zero linhas', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.amostra).toMatchObject({ esperadas: 3, lidasComAcesso: 3, lidasSemAcesso: 0 });
    });
  });

  it('FIN-39: grupo sem conta sem acesso também passa, sem a comparação com a conta sem acesso', async () => {
    await comBancoDeProducao(
      async (url) => {
        const r = await ensaiar(url, { referencia });
        expect(r.amostra?.lidasSemAcesso).toBeUndefined();
        expect(r.amostra?.lidasComAcesso).toBe(r.amostra?.esperadas);
        expect(r.ok).toBe(true);
      },
      { adminSemAcesso: false },
    );
  });

  it('FIN-42: dump sem linhas de negócio bloqueia o ensaio e não aplica migração nenhuma', async () => {
    await comBancoDeProducao(
      async (url) => {
        await expect(ensaiar(url, { referencia })).rejects.toThrow(ErroEnsaio);
        await expect(ensaiar(url, { referencia })).rejects.toThrow(/não prova nada/);
        const aplicadas = await comConexao(
          url,
          async (c) =>
            (await c.query(`SELECT 1 FROM pgmigrations WHERE name LIKE '%financeiro%'`)).rowCount,
        );
        expect(aplicadas).toBe(0);
      },
      { semear: false },
    );
  });

  it('FIN-42: migração que apaga linhas reprova o ensaio e a tabela aparece com antes e depois', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-apaga-'));
    try {
      for (const nome of readdirSync(PASTA_MIGRACOES))
        copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
      writeFileSync(
        join(pasta, '1792999999999_apaga-lancamentos.sql'),
        '-- Up Migration\nDELETE FROM lancamentos;\n',
      );
      await comBancoDeProducao(async (url) => {
        const r = await ensaiar(url, { referencia, pasta });
        expect(r.tabelasAlteradas).toEqual(['lancamentos: 2 → 0']);
        expect(r.ok).toBe(false);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('FIN-42: tabela listada em podeGanhar pode crescer, mas não encolher', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-cresce-'));
    try {
      for (const nome of readdirSync(PASTA_MIGRACOES))
        copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
      writeFileSync(
        join(pasta, '1792999999999_enche-config.sql'),
        `-- Up Migration\nINSERT INTO habilidades (grupo_id, nome) SELECT id, 'Extra' FROM grupos;\n`,
      );
      await comBancoDeProducao(async (url) => {
        const sem = await ensaiar(url, { referencia, pasta });
        expect(sem.tabelasAlteradas).toEqual(['habilidades: 0 → 1']);
      });
      await comBancoDeProducao(async (url) => {
        const com = await ensaiar(url, { referencia, pasta, podeGanhar: ['habilidades'] });
        expect(com.tabelasAlteradas).toEqual([]);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('FIN-42: schema diferente da referência reprova o ensaio e lista o que sobra', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, {
        referencia: referencia.filter((l) => !l.startsWith('funcao app_acessa_financeiro(')),
      });
      expect(r.esquema.sobrando.some((l) => l.startsWith('funcao app_acessa_financeiro('))).toBe(
        true,
      );
      expect(r.ok).toBe(false);
    });
  });

  it('FIN-42: host fora da lista local é recusado antes de qualquer conexão', async () => {
    await expect(
      ensaiar('postgres://u:p@ep-abc.sa-east-1.aws.neon.tech/neondb', { referencia }),
    ).rejects.toThrow(/não permitido/);
  });
});
