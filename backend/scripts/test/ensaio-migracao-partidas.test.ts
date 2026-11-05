import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar, PASTA_MIGRACOES } from '@pelada/api/migrar';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import { ensaiar } from '../src/ensaio-migracao.ts';
import { comBancoMigrado, URL_BASE, urlDoBanco } from './apoio/banco.ts';

/**
 * Ensaio das migrações da partidas-e-ranking sobre um "dump da produção" (T81; PAR-13, PAR-14, PAR-91; AD-032, AD-033).
 * O dump é simulado por um banco migrado só até a última migração antes desta feature (as da grupos-e-elenco), com
 * dados de negócio: um grupo que já tem configuração de pesos e um que não tem. As migrações T21 a T26 (e as do
 * financeiro, que vêm depois) são as pendentes. O ensaio real, com o backup cifrado da produção, é do usuário e do
 * /executar (`pnpm --filter @pelada/scripts ensaio`), com a evidência registrada na T81 do tasks.md.
 */

const DA_PARTIDAS = [
  '_pesos-padrao.sql',
  '_grupo-criar-pesos.sql',
  '_eventos-uso.sql',
  '_contas-nomes-do-grupo.sql',
  '_grants-partidas-pesos.sql',
  '_grupos-visiveis-publico-ativo.sql',
] as const;
const DO_FINANCEIRO = ['_financeiro-rls.sql', '_financeiro-trava-acesso.sql'] as const;
const PENDENTES = [...DA_PARTIDAS, ...DO_FINANCEIRO];

let pastaAntiga: string;
let referencia: string[];

beforeAll(async () => {
  pastaAntiga = mkdtempSync(join(tmpdir(), 'migracoes-antes-partidas-'));
  for (const nome of readdirSync(PASTA_MIGRACOES)) {
    if (PENDENTES.some((s) => nome.endsWith(s))) continue;
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
  comPesos: string;
  semPesos: string;
}

/** Dois grupos da mesma criadora, com caixa (para a amostra do financeiro); só o primeiro tem pesos configurados. */
async function semear(url: string): Promise<Ids> {
  return comConexao(url, async (c) => {
    const conta = (await c.query<{ id: string }>(`INSERT INTO contas (email, nome, senha_hash, criada_em) VALUES ('criadora@exemplo.test', 'Criadora', 'x', now()) RETURNING id`)).rows[0]!.id;
    const grupo = async (slug: string): Promise<string> =>
      (
        await c.query<{ id: string }>(
          `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
           VALUES ($1, $1, 'quinta', 'semanal', '20:00', $2, '2026-03-10T23:30:00Z') RETURNING id`,
          [slug, conta],
        )
      ).rows[0]!.id;
    const comPesos = await grupo('pelada-com-pesos');
    const semPesos = await grupo('pelada-sem-pesos');
    for (const g of [comPesos, semPesos]) {
      await c.query(`INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em) VALUES ($1, $2, true, $1, now())`, [conta, g]);
      await c.query(`INSERT INTO config_financeira (grupo_id, mensalidade_centavos, saldo_inicial_centavos, data_saldo_inicial) VALUES ($1, 5000, 0, '2026-01-01')`, [g]);
      await c.query(
        `INSERT INTO lancamentos (grupo_id, tipo, data, descricao, valor_centavos, criado_por, criado_em, alterado_por, alterado_em)
         VALUES ($1, 'entrada', '2026-01-05', 'Mensalidade', 5000, $2, now(), $2, now())`,
        [g, conta],
      );
    }
    await c.query(
      `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                                 lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
       VALUES ($1, '2026-02-01', 3, 4, 2, 2, -5, -5, $2, now())`,
      [comPesos, conta],
    );
    return { comPesos, semPesos };
  });
}

/** Banco `ensaio_*` migrado até antes da partidas-e-ranking; apagado no `finally`. */
async function comBancoDeProducao(fn: (url: string, ids: Ids) => Promise<void>): Promise<void> {
  const nome = `ensaio_teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const url = urlDoBanco(URL_BASE, nome);
    await migrar(url, { pasta: pastaAntiga });
    const ids = await semear(url);
    await fn(url, ids);
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

async function pesosDe(url: string, grupoId: string) {
  return comConexao(url, async (c) =>
    (
      await c.query<{ vigente_desde: string; presenca_sem_chuva: number; expulso: number }>(
        `SELECT to_char(vigente_desde, 'YYYY-MM-DD') AS vigente_desde, presenca_sem_chuva, expulso
           FROM config_pesos WHERE grupo_id = $1 ORDER BY vigente_desde`,
        [grupoId],
      )
    ).rows,
  );
}

describe('ensaiar com as migrações da partidas-e-ranking', () => {
  it('PAR-14: aplica as 6 migrações da feature, nenhuma tabela perde linha e config_pesos ganha uma linha por grupo sem configuração', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia });
      const nomes = r.aplicadas.map((n) => n.replace(/^\d+_/, '').replace(/\.sql$/, ''));
      expect(nomes).toEqual(expect.arrayContaining(DA_PARTIDAS.map((s) => s.slice(1, -4))));
      expect(r.tabelasAlteradas).toEqual([]);
      expect(r.pesos).toEqual({ semConfigAntes: 1, semConfigDepois: 0, linhasNovas: 1 });
      expect(r.depois.config_pesos).toBe((r.antes.config_pesos ?? 0) + 1);
      for (const tabela of Object.keys(r.antes)) {
        if (tabela === 'config_pesos') continue;
        expect({ tabela, n: r.depois[tabela] }).toEqual({ tabela, n: r.antes[tabela] });
      }
      expect(r.segundaExecucao).toEqual([]);
      expect(r.ok).toBe(true);
    });
  });

  it('PAR-14: a configuração que já existia fica intacta e o grupo sem configuração recebe os pesos padrão do dia da criação em São Paulo', async () => {
    await comBancoDeProducao(async (url, ids) => {
      await ensaiar(url, { referencia });
      expect(await pesosDe(url, ids.comPesos)).toEqual([{ vigente_desde: '2026-02-01', presenca_sem_chuva: 3, expulso: -5 }]);
      // criado_em 2026-03-10T23:30Z é 20h30 de 10/03 em São Paulo.
      expect(await pesosDe(url, ids.semPesos)).toEqual([{ vigente_desde: '2026-03-10', presenca_sem_chuva: 1, expulso: -1 }]);
    });
  });

  it('PAR-14: migração que dá duas linhas de pesos ao mesmo grupo reprova o ensaio', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-pesos-a-mais-'));
    try {
      for (const nome of readdirSync(PASTA_MIGRACOES)) copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
      writeFileSync(
        join(pasta, '1792999999999_pesos-duplicados.sql'),
        `-- Up Migration
INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                          lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
SELECT id, '2026-04-01', 1, 1, 1, 1, -1, -1, criado_por, criado_em FROM grupos;
`,
      );
      await comBancoDeProducao(async (url) => {
        const r = await ensaiar(url, { referencia, pasta });
        expect(r.pesos.linhasNovas).toBe(3);
        expect(r.pesos.semConfigAntes - r.pesos.semConfigDepois).toBe(1);
        expect(r.ok).toBe(false);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('PAR-13: sem a migração dos pesos padrão o relatório mostra o grupo que segue sem configuração', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-sem-pesos-'));
    try {
      for (const nome of readdirSync(PASTA_MIGRACOES)) {
        if (nome.endsWith('_pesos-padrao.sql')) continue;
        copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
      }
      await comBancoDeProducao(async (url) => {
        const r = await ensaiar(url, { referencia, pasta });
        expect(r.aplicadas.some((n) => n.replace(/\.sql$/, '').endsWith('_pesos-padrao'))).toBe(false);
        expect(r.pesos).toEqual({ semConfigAntes: 1, semConfigDepois: 1, linhasNovas: 0 });
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('PAR-13: com a pesos-padrao aplicada, grupo que termina sem configuração reprova o ensaio', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-apaga-pesos-'));
    try {
      for (const nome of readdirSync(PASTA_MIGRACOES)) copyFileSync(join(PASTA_MIGRACOES, nome), join(pasta, nome));
      // Apaga a linha que a pesos-padrao acabou de criar: config_pesos fica com a mesma contagem (não aparece em
      // tabelasAlteradas), mas o grupo volta a ficar sem configuração.
      writeFileSync(join(pasta, '1792999999999_apaga-pesos-padrao.sql'), `-- Up Migration\nDELETE FROM config_pesos WHERE vigente_desde = '2026-03-10';\n`);
      await comBancoDeProducao(async (url) => {
        const r = await ensaiar(url, { referencia, pasta });
        expect(r.tabelasAlteradas).toEqual([]);
        expect(r.pesos).toEqual({ semConfigAntes: 1, semConfigDepois: 1, linhasNovas: 0 });
        expect(r.ok).toBe(false);
      });
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it('PAR-91: o schema depois do ensaio é a referência, que inclui as funções e a policy destas migrações', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia });
      expect(r.esquema).toEqual({ faltando: [], sobrando: [] });
      expect(referencia.some((l) => l.startsWith('funcao evento_publico_registrar('))).toBe(true);
      expect(referencia.some((l) => l.startsWith('funcao contas_nomes_do_grupo('))).toBe(true);
    });
  });

  it('PAR-91: referência sem a função pública de eventos reprova o ensaio e lista o que sobra', async () => {
    await comBancoDeProducao(async (url) => {
      const r = await ensaiar(url, { referencia: referencia.filter((l) => !l.startsWith('funcao evento_publico_registrar(')) });
      expect(r.esquema.sobrando.some((l) => l.startsWith('funcao evento_publico_registrar('))).toBe(true);
      expect(r.ok).toBe(false);
    });
  });
});
