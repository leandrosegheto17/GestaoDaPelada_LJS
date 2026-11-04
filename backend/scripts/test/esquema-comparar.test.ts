import pg from 'pg';
import { describe, expect, test } from 'vitest';
import { comBancoDeTeste, comTravaDeMigracao } from '../../api/test/apoio/banco.ts';
import { migrar } from '../../api/src/infraestrutura/db/migrar.ts';
import {
  compararContagens,
  compararLinhas,
  conferirParidade,
  lerEsquemaDoBanco,
  urlDoAlvo,
} from '../src/esquema-comparar.ts';

async function migrado(url: string): Promise<void> {
  await comTravaDeMigracao(() => migrar(url));
}

describe('esquema:comparar', () => {
  test('FUN-08: compararLinhas lista o que falta e o que sobra', () => {
    const d = compararLinhas(['a', 'b', 'c'], ['b', 'c', 'd']);
    expect(d).toEqual({ faltando: ['a'], sobrando: ['d'] });
    expect(compararLinhas(['a'], ['a'])).toEqual({ faltando: [], sobrando: [] });
  });

  test('FUN-08: dois bancos locais migrados dão 0 diferenças, e uma coluna a mais é listada', async () => {
    await comBancoDeTeste(async (a) =>
      comBancoDeTeste(async (b) => {
        await migrado(a);
        await migrado(b);
        const igual = compararLinhas(await lerEsquemaDoBanco(a), await lerEsquemaDoBanco(b));
        expect(igual).toEqual({ faltando: [], sobrando: [] });

        const c = new pg.Client({ connectionString: b });
        await c.connect();
        await c.query('alter table contas add column extra_teste text');
        await c.end();

        const d = compararLinhas(await lerEsquemaDoBanco(a), await lerEsquemaDoBanco(b));
        expect(d.faltando).toEqual([]);
        expect(d.sobrando).toEqual(['coluna public.contas.extra_teste text']);
      }),
    );
  }, 180_000);

  test('FUN-09: migrar num banco já migrado não aplica nada, sem DDL e com a mesma contagem', async () => {
    await comBancoDeTeste(async (url) => {
      await migrado(url);
      const referencia = await lerEsquemaDoBanco(url);
      const r = await comTravaDeMigracao(() =>
        conferirParidade(url, { referencia, rodarMigrar: true }),
      );
      expect(r.diferencas).toEqual({ faltando: [], sobrando: [] });
      expect(r.migracoesAplicadas).toEqual([]);
      expect(r.ddlDaMigracao).toEqual({ faltando: [], sobrando: [] });
      expect(r.contagemMudou).toEqual([]);
    });
  }, 180_000);

  test('FUN-09: a comparação de contagens aponta a tabela que mudou', () => {
    expect(compararContagens({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b: 2 -> 3']);
    expect(compararContagens({ a: 1 }, { a: 1 })).toEqual([]);
  });

  test('FUN-19: só local e dev são alvos; produção e desconhecidos são recusados; dev exige a permissão remota', () => {
    expect(() => urlDoAlvo('producao', {})).toThrow('não permitido');
    expect(() => urlDoAlvo('main', {})).toThrow('não permitido');
    expect(() => urlDoAlvo('dev', {})).toThrow('NEON_URL_DEV_MIGRACAO');
    const dev = { NEON_URL_DEV_MIGRACAO: 'postgres://u:segredo@ep-x.neon.tech/db' };
    let erro = '';
    try {
      urlDoAlvo('dev', dev);
    } catch (e) {
      erro = (e as Error).message;
    }
    expect(erro).toContain('PELADA_PERMITIR_HOST_REMOTO');
    expect(erro).not.toContain('segredo');
    expect(urlDoAlvo('dev', { ...dev, PELADA_PERMITIR_HOST_REMOTO: '1' })).toBe(
      dev.NEON_URL_DEV_MIGRACAO,
    );
    expect(() => urlDoAlvo('local', { DATABASE_URL_MIGRACAO: dev.NEON_URL_DEV_MIGRACAO })).toThrow(
      'não permitido',
    );
  });
});
