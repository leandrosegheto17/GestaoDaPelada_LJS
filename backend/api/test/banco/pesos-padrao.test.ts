import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { abrirCenarioGrupos, comoSuperusuario, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Migração dos pesos padrão (T21; PAR-13, PAR-14; `BD:120-124`). No banco migrado a migração já rodou sem grupos;
 * aqui o SQL dela roda de novo, como superusuário (o owner das migrações), sobre grupos criados depois, numa transação
 * desfeita ao fim. Isso prova a conversão do fuso, a idempotência e que grupo com configuração fica intacto.
 *
 * Casos limite: grupo criado às 02:30 UTC (ainda é o dia anterior em São Paulo); grupo que já tinha configuração;
 * grupo arquivado sem configuração (também recebe os pesos, como no SQL da Base); segunda execução; nenhuma leitura do
 * relógio (AD-015).
 */

const SUFIXO = '_pesos-padrao.sql';

function arquivoDaMigracao(): string {
  const achados = readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith(SUFIXO));
  if (achados.length !== 1) throw new Error(`esperava uma migração ${SUFIXO}, achei ${achados.length}`);
  return join(PASTA_MIGRACOES, achados[0] ?? '');
}

const SQL_MIGRACAO = readFileSync(arquivoDaMigracao(), 'utf8');

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface LinhaPesos {
  vigente_desde: string;
  pesos: number[];
  registrado_por: string;
  mesmo_momento: boolean;
}

async function pesosDe(d: pg.Client, grupo: string): Promise<LinhaPesos[]> {
  const r = await d.query<LinhaPesos>(
    `SELECT c.vigente_desde::text AS vigente_desde,
            ARRAY[c.presenca_sem_chuva, c.presenca_com_chuva, c.lesionado_sem_chuva, c.lesionado_com_chuva,
                  c.expulso, c.expulso_com_chuva]::int[] AS pesos,
            c.registrado_por, c.registrado_em = g.criado_em AS mesmo_momento
       FROM config_pesos c JOIN grupos g ON g.id = c.grupo_id
      WHERE c.grupo_id = $1
      ORDER BY c.vigente_desde`,
    [grupo],
  );
  return r.rows;
}

async function novoGrupo(d: pg.Client, conta: string, slug: string, criadoEm: string, arquivado = false): Promise<string> {
  const r = await d.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em, arquivado_em)
     VALUES ($1, $1, 'quinta', 'semanal', '20:00', $2, $3, CASE WHEN $4 THEN now() END) RETURNING id`,
    [slug, conta, criadoEm, arquivado],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('grupo sem id');
  return id;
}

async function totalPesos(d: pg.Client): Promise<number> {
  const r = await d.query<{ n: number }>('SELECT count(*)::int AS n FROM config_pesos');
  return r.rows[0]?.n ?? -1;
}

describe('migração dos pesos padrão', () => {
  it('PAR-13: grupo criado em 2026-10-01 02:30 UTC ganha 1, 1, 1, 1, -1, -1 vigentes desde 2026-09-30', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const x = await novoGrupo(d, cenario.contaB, 'racha-da-madrugada', '2026-10-01T02:30:00Z');
      await d.query(SQL_MIGRACAO);
      expect(await pesosDe(d, x)).toEqual([
        { vigente_desde: '2026-09-30', pesos: [1, 1, 1, 1, -1, -1], registrado_por: cenario.contaB, mesmo_momento: true },
      ]);
    });
  });

  it('PAR-13: grupo criado às 03:00 UTC (meia-noite em São Paulo) fica no mesmo dia', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const x = await novoGrupo(d, cenario.contaB, 'racha-da-meia-noite', '2026-10-01T03:00:00Z');
      await d.query(SQL_MIGRACAO);
      expect((await pesosDe(d, x)).map((l) => l.vigente_desde)).toEqual(['2026-10-01']);
    });
  });

  it('PAR-13: grupo arquivado sem configuração também recebe os pesos padrão', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const x = await novoGrupo(d, cenario.contaB, 'racha-arquivado', '2026-05-10T15:00:00Z', true);
      await d.query(SQL_MIGRACAO);
      expect((await pesosDe(d, x)).map((l) => l.pesos)).toEqual([[1, 1, 1, 1, -1, -1]]);
    });
  });

  it('PAR-14: grupo que já tinha configuração fica intacto', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const antes = await pesosDe(d, cenario.grupoG);
      expect(antes.length, 'o cenário precisa de configuração em G').toBeGreaterThan(0);
      await d.query(SQL_MIGRACAO);
      expect(await pesosDe(d, cenario.grupoG)).toEqual(antes);
    });
  });

  it('PAR-14: rodar de novo não duplica', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const x = await novoGrupo(d, cenario.contaB, 'racha-repetido', '2026-08-20T12:00:00Z');
      await d.query(SQL_MIGRACAO);
      const depoisDaPrimeira = await totalPesos(d);
      await d.query(SQL_MIGRACAO);
      expect(await totalPesos(d)).toBe(depoisDaPrimeira);
      expect(await pesosDe(d, x)).toHaveLength(1);
    });
  });

  it('PAR-14: depois da migração, nenhum grupo fica sem configuração', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      await novoGrupo(d, cenario.contaB, 'racha-sem-config', '2026-02-02T10:00:00Z');
      await d.query(SQL_MIGRACAO);
      const r = await d.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM grupos g WHERE NOT EXISTS (SELECT 1 FROM config_pesos c WHERE c.grupo_id = g.id)`,
      );
      expect(r.rows[0]?.n).toBe(0);
    });
  });

  it('PAR-13: a migração converte um momento gravado e não lê o relógio (AD-015)', () => {
    const semComentario = SQL_MIGRACAO.split('\n')
      .map((l) => l.replace(/--.*$/, ''))
      .join('\n');
    expect(semComentario).not.toMatch(/\bnow\s*\(|\bcurrent_(date|timestamp)\b|\blocaltimestamp\b|\bclock_timestamp\b/i);
    expect(semComentario).toMatch(/criado_em\s+AT\s+TIME\s+ZONE\s+'America\/Sao_Paulo'/i);
  });
});
