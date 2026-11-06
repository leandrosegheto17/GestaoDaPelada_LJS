import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PASTA_MIGRACOES } from '../../src/infraestrutura/db/migrar.ts';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  comoSuperusuario,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Pesos padrão desde o início do grupo (fundação R1-T2; PAR-165, PAR-15, PAR-09, PAR-56; AD-125, AD-126).
 * `grupo_criar` data a configuração padrão em 1900-01-01 e a migração leva para lá a padrão única, datada na criação,
 * dos grupos que já existem. O SQL da migração roda de novo como superusuário (o dono das migrações), numa transação
 * desfeita ao fim, sobre grupos criados no teste.
 *
 * Casos limite: grupo novo (qualquer data de partida usa o peso padrão); grupo existente com padrão única na criação;
 * pesos alterados, duas linhas ou data diferente da criação (ficam intactos); segunda execução (idempotente).
 */

const SUFIXO = '_pesos-padrao-desde-o-inicio.sql';

function arquivoDaMigracao(): string {
  const achados = readdirSync(PASTA_MIGRACOES).filter((f) => f.endsWith(SUFIXO));
  if (achados.length !== 1)
    throw new Error(`esperava uma migração ${SUFIXO}, achei ${achados.length}`);
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

interface Linha {
  vigente_desde: string;
  pesos: number[];
}

const PESOS_SQL = `ARRAY[presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva, lesionado_com_chuva,
                  expulso, expulso_com_chuva]::int[]`;

async function pesosDe(d: pg.Client, grupo: string): Promise<Linha[]> {
  const r = await d.query<Linha>(
    `SELECT vigente_desde::text AS vigente_desde, ${PESOS_SQL} AS pesos
       FROM config_pesos WHERE grupo_id = $1 ORDER BY vigente_desde`,
    [grupo],
  );
  return r.rows;
}

/** A configuração que vale numa data: a de maior `vigente_desde` até ela, ou a mais antiga (PAR-56). */
async function vigenteEm(d: pg.Client, grupo: string, data: string): Promise<number[]> {
  const r = await d.query<{ pesos: number[] }>(
    `SELECT ${PESOS_SQL} AS pesos
       FROM config_pesos WHERE grupo_id = $1
      ORDER BY (vigente_desde <= $2::date) DESC,
               CASE WHEN vigente_desde <= $2::date THEN vigente_desde END DESC,
               vigente_desde ASC
      LIMIT 1`,
    [grupo, data],
  );
  return r.rows[0]?.pesos ?? [];
}

async function novoGrupo(
  d: pg.Client,
  conta: string,
  slug: string,
  criadoEm: string,
): Promise<string> {
  const r = await d.query<{ id: string }>(
    `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
     VALUES ($1, $1, 'quinta', 'semanal', '20:00', $2, $3) RETURNING id`,
    [slug, conta, criadoEm],
  );
  const id = r.rows[0]?.id;
  if (!id) throw new Error('grupo sem id');
  return id;
}

async function novaConfig(
  d: pg.Client,
  grupo: string,
  conta: string,
  desde: string,
  pesos: number[],
): Promise<void> {
  await d.query(
    `INSERT INTO config_pesos (grupo_id, vigente_desde, presenca_sem_chuva, presenca_com_chuva, lesionado_sem_chuva,
                               lesionado_com_chuva, expulso, expulso_com_chuva, registrado_por, registrado_em)
     VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, $9, now())`,
    [grupo, desde, ...pesos, conta],
  );
}

const PADRAO = [1, 1, 1, 1, -1, -1];

async function criarGrupo(d: pg.Client, slug: string): Promise<string> {
  const r = await d.query<{ id: string }>(
    `SELECT id FROM grupo_criar('Racha Inicio', 'quinta', 'semanal', '20:00', $1,
                                ARRAY['Passe']::text[], '2026-03-15'::date)`,
    [slug],
  );
  return r.rows[0]?.id ?? '';
}

describe('grupo_criar com a configuração padrão desde o início', () => {
  it('PAR-165: o grupo novo nasce com os pesos padrão vigentes desde 1900-01-01, qualquer que seja p_hoje', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const id = await criarGrupo(d, 'racha-inicio');
      expect(id).toBeTruthy();
      await d.query('RESET ROLE');
      expect(await pesosDe(d, id)).toEqual([{ vigente_desde: '1900-01-01', pesos: PADRAO }]);
    });
  });

  it('PAR-165 e PAR-56: partida de ontem e de antes da criação usam o peso padrão no grupo novo', async () => {
    const { db, cenario } = aberto;
    await comoApp(db, { conta: cenario.contaC }, async (d) => {
      const id = await criarGrupo(d, 'racha-passado');
      await d.query('RESET ROLE');
      // Uma gravação "não" de hoje (PAR-163): a de ontem e a de 2020 mantêm o padrão; a de hoje usa o novo.
      await novaConfig(d, id, cenario.contaC, '2026-03-15', [2, 2, 1, 1, -1, -1]);
      expect(await vigenteEm(d, id, '2026-03-14')).toEqual(PADRAO);
      expect(await vigenteEm(d, id, '2020-01-01')).toEqual(PADRAO);
      expect(await vigenteEm(d, id, '2026-03-15')).toEqual([2, 2, 1, 1, -1, -1]);
    });
  });
});

describe('migração dos pesos padrão desde o início', () => {
  it('PAR-165: a padrão única datada na criação (fuso de São Paulo) passa para 1900-01-01', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      // 02:30 UTC de 2026-10-01 ainda é 2026-09-30 em São Paulo.
      const x = await novoGrupo(d, cenario.contaB, 'racha-da-madrugada-i', '2026-10-01T02:30:00Z');
      await novaConfig(d, x, cenario.contaB, '2026-09-30', PADRAO);
      await d.query(SQL_MIGRACAO);
      expect(await pesosDe(d, x)).toEqual([{ vigente_desde: '1900-01-01', pesos: PADRAO }]);
    });
  });

  it('PAR-165: pesos alterados, duas linhas ou data diferente da criação ficam intactos', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const alterado = await novoGrupo(d, cenario.contaB, 'racha-alterado', '2026-10-01T15:00:00Z');
      await novaConfig(d, alterado, cenario.contaB, '2026-10-01', [2, 1, 1, 1, -1, -1]);
      const duas = await novoGrupo(d, cenario.contaB, 'racha-duas', '2026-10-01T15:00:00Z');
      await novaConfig(d, duas, cenario.contaB, '2026-10-01', PADRAO);
      await novaConfig(d, duas, cenario.contaB, '2026-10-05', [3, 3, 1, 1, -1, -1]);
      const outra = await novoGrupo(d, cenario.contaB, 'racha-outra-data', '2026-10-01T15:00:00Z');
      await novaConfig(d, outra, cenario.contaB, '2026-10-03', PADRAO);
      await d.query(SQL_MIGRACAO);
      expect(await pesosDe(d, alterado)).toEqual([
        { vigente_desde: '2026-10-01', pesos: [2, 1, 1, 1, -1, -1] },
      ]);
      expect((await pesosDe(d, duas)).map((l) => l.vigente_desde)).toEqual([
        '2026-10-01',
        '2026-10-05',
      ]);
      expect(await pesosDe(d, outra)).toEqual([{ vigente_desde: '2026-10-03', pesos: PADRAO }]);
    });
  });

  it('PAR-165: rodar de novo não muda nada (idempotente)', async () => {
    const { db, cenario } = aberto;
    await comoSuperusuario(db, async (d) => {
      const x = await novoGrupo(d, cenario.contaB, 'racha-idempotente', '2026-10-01T15:00:00Z');
      await novaConfig(d, x, cenario.contaB, '2026-10-01', PADRAO);
      await d.query(SQL_MIGRACAO);
      const depois1 = await pesosDe(d, x);
      await d.query(SQL_MIGRACAO);
      expect(await pesosDe(d, x)).toEqual(depois1);
      expect(depois1).toEqual([{ vigente_desde: '1900-01-01', pesos: PADRAO }]);
    });
  });
});
