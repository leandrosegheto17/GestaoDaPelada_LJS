import { randomBytes } from 'node:crypto';
import { lerEsquema, OPCOES_REFERENCIA } from '@pelada/api/esquema';
import { migrar } from '@pelada/api/migrar';
import pg from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { comConexao } from '../src/conectar.ts';
import {
  compararEsquema,
  comandoComparar,
  conferirRoles,
  diferencas,
  lerArgumentos,
  migrarConferindo,
  urlDoAlvo,
} from '../src/esquema-comparar.ts';

/**
 * Comparador de schema (FUN-08, FUN-09, FUN-11; T80), com dois bancos locais descartáveis. Cada
 * banco `teste_*` é apagado no `finally`.
 */

const URL_BASE = process.env.DATABASE_URL_TESTE ?? 'postgres://postgres:postgres@127.0.0.1:5432/pelada';

async function comBancoMigrado<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const nome = `teste_${randomBytes(6).toString('hex')}`;
  await comConexao(URL_BASE, (c) => c.query(`CREATE DATABASE ${nome}`));
  try {
    const u = new URL(URL_BASE);
    u.pathname = `/${nome}`;
    await migrar(u.toString());
    return await fn(u.toString());
  } finally {
    await comConexao(URL_BASE, (c) => c.query(`DROP DATABASE IF EXISTS ${nome} WITH (FORCE)`));
  }
}

const esquemaDe = (url: string) => comConexao(url, (c) => lerEsquema(c, OPCOES_REFERENCIA));

describe('esquema:comparar', () => {
  it('FUN-08: diferencas lista o que falta e o que sobra, e nada quando são iguais', () => {
    expect(diferencas(['a', 'b'], ['a', 'b'])).toEqual({ faltando: [], sobrando: [] });
    expect(diferencas(['a', 'b'], ['b', 'c'])).toEqual({ faltando: ['a'], sobrando: ['c'] });
  });

  it('FUN-08: dois bancos locais migrados iguais dão 0 diferenças', async () => {
    await comBancoMigrado(async (urlA) =>
      comBancoMigrado(async (urlB) => {
        const r = await compararEsquema(urlB, await esquemaDe(urlA));
        expect(r).toEqual({ faltando: [], sobrando: [] });
      }),
    );
  }, 120_000);

  it('FUN-08: uma diferença (tabela a mais e policy a menos) é listada', async () => {
    await comBancoMigrado(async (urlA) =>
      comBancoMigrado(async (urlB) => {
        const referencia = await esquemaDe(urlA);
        await comConexao(urlB, (c) => c.query('CREATE TABLE public.tabela_a_mais (id int)'));
        const r = await compararEsquema(urlB, referencia);
        expect(r.faltando).toEqual([]);
        expect(r.sobrando.some((l) => l.includes('tabela_a_mais'))).toBe(true);

        const semUma = referencia.slice(1);
        const r2 = await compararEsquema(urlA, semUma);
        expect(r2.sobrando).toEqual([referencia[0]]);
      }),
    );
  }, 120_000);

  it('FUN-09: --migrar num banco já migrado aplica zero migrações e mantém a contagem de linhas', async () => {
    await comBancoMigrado(async (url) => {
      const r = await migrarConferindo(url);
      expect(r.aplicadas).toEqual([]);
      expect(r.contagemIgual).toBe(true);
      expect(Object.keys(r.antes).length).toBeGreaterThan(0);
    });
  }, 120_000);

  it('FUN-11: confere a existência de pelada_owner, pelada_app e pelada_backup_ro', async () => {
    const roles = await conferirRoles(URL_BASE);
    expect(Object.keys(roles).sort()).toEqual(['pelada_app', 'pelada_backup_ro', 'pelada_owner']);
    for (const v of Object.values(roles)) expect(typeof v).toBe('boolean');
  });

  it('FUN-08: o alvo é obrigatório e só aceita dev ou local', () => {
    expect(() => lerArgumentos([])).toThrow(/--alvo/);
    expect(() => lerArgumentos(['--alvo', 'main'])).toThrow(/--alvo/);
    expect(lerArgumentos(['--alvo', 'dev', '--migrar'])).toEqual({ alvo: 'dev', migrar: true });
  });

  it('FUN-19: alvo dev sem NEON_URL_DEV_MIGRACAO falha com a orientação', () => {
    expect(() => urlDoAlvo('dev', {})).toThrow(/NEON_URL_DEV_MIGRACAO/);
  });

  it('FUN-19: host remoto sem PELADA_PERMITIR_HOST_REMOTO=1 aborta antes de conectar', async () => {
    const conectar = vi.spyOn(pg.Client.prototype, 'connect');
    try {
      const remoto = { NEON_URL_DEV_MIGRACAO: 'postgres://u:p@ep-x.sa-east-1.aws.neon.tech/neondb' };
      await expect(comandoComparar(['--alvo', 'dev'], remoto)).rejects.toThrow(/não permitido/);
      await expect(comandoComparar(['--alvo', 'dev'], { ...remoto, PELADA_PERMITIR_HOST_REMOTO: '0' })).rejects.toThrow(
        /não permitido/,
      );
      expect(conectar).not.toHaveBeenCalled();
    } finally {
      conectar.mockRestore();
    }
  });
});
