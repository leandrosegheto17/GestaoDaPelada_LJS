import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/migracoes/esquema.ts';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migracoes/executar.ts';
import {
  detectarEstado,
  EstadoParcial,
  impressaoDigital,
  migrar,
} from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { comCliente, criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { contarLinhas, gravarGrupoDeTeste } from '../apoio/dados-legado.ts';
import { aplicarComoLegado, lerMigracoesLegado } from '../apoio/runner-legado.ts';

const LINHA_DE_BASE = '1792843200000_linha-de-base';
const TODAS = readdirSync(PASTA_MIGRACOES)
  .filter((n) => n.endsWith('.sql'))
  .sort()
  .map((n) => n.replace(/\.sql$/, ''));
const NOVAS = TODAS.filter((n) => n !== LINHA_DE_BASE);

const bancos: BancoTemporario[] = [];
async function novoBanco(): Promise<BancoTemporario> {
  const banco = await criarBancoTemporario();
  bancos.push(banco);
  return banco;
}
afterEach(async () => {
  for (const banco of bancos.splice(0)) await banco.remover();
});

const registradasEmPgmigrations = (url: string) =>
  comCliente(url, async (c) =>
    (await c.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id')).rows.map((r) => r.name),
  );
const existePgmigrations = (url: string) =>
  comCliente(
    url,
    async (c) =>
      (await c.query<{ e: boolean }>("SELECT to_regclass('public.pgmigrations') IS NOT NULL AS e")).rows[0]?.e,
  );

/** Fixture B: banco vazio migrado só até a linha de base. */
async function impressaoDaFixtureB(): Promise<string> {
  const b = await novoBanco();
  await aplicarMigracoes({ url: b.url, quantas: 1 });
  return comCliente(b.url, impressaoDigital);
}

describe('fixture A: 13 migrations aplicadas pelo runner antigo (FUN-09)', () => {
  it('é detectada como legado e tem a mesma impressão digital da fixture B', async () => {
    const a = await novoBanco();
    await aplicarComoLegado(a.url);
    await gravarGrupoDeTeste(a.url);

    const deteccao = await comCliente(a.url, detectarEstado);
    expect(deteccao).toEqual({ estado: 'legado', diferencas: [] });
    expect(await comCliente(a.url, impressaoDigital)).toBe(await impressaoDaFixtureB());
  });

  it('migrar registra a linha de base sem executá-la, não altera dados e aplica só as novas', async () => {
    const a = await novoBanco();
    await aplicarComoLegado(a.url);
    await gravarGrupoDeTeste(a.url);
    const antes = await comCliente(a.url, contarLinhas);
    const esquemaAntes = await comCliente(a.url, lerEsquema);

    const resultado = await migrar(a.url);

    expect(resultado).toEqual({ estado: 'legado', registradas: [LINHA_DE_BASE], aplicadas: NOVAS });
    expect(await registradasEmPgmigrations(a.url)).toEqual(TODAS);
    expect(await comCliente(a.url, contarLinhas)).toEqual(antes);
    expect(antes['jogadores']).toBe(5);
    expect(antes['presencas']).toBe(5);
    // A linha de base não rodou: as tabelas, colunas, restrições, índices e triggers continuam os mesmos.
    expect(await comCliente(a.url, lerEsquema)).toEqual(esquemaAntes);
  });

  it('rodar migrar de novo não aplica nada (estado gerenciado)', async () => {
    const a = await novoBanco();
    await aplicarComoLegado(a.url);
    await migrar(a.url);

    expect(await migrar(a.url)).toEqual({ estado: 'gerenciado', registradas: [], aplicadas: [] });
    expect(await registradasEmPgmigrations(a.url)).toEqual(TODAS);
  });
});

describe('fixture B: banco vazio (FUN-08)', () => {
  it('é detectado como vazio e migrar aplica todas as migrations', async () => {
    const b = await novoBanco();
    expect(await comCliente(b.url, detectarEstado)).toEqual({ estado: 'vazio', diferencas: [] });

    expect(await migrar(b.url)).toEqual({ estado: 'vazio', registradas: [], aplicadas: TODAS });
    expect(await registradasEmPgmigrations(b.url)).toEqual(TODAS);
  });
});

describe('fixture C: schema parcial (FUN-10)', () => {
  it('só parte das migrations do legado: aborta sem alterar nada e lista as que faltam', async () => {
    const c = await novoBanco();
    await aplicarComoLegado(c.url, lerMigracoesLegado().slice(0, 5));
    const esquemaAntes = await comCliente(c.url, lerEsquema);
    const linhasAntes = await comCliente(c.url, contarLinhas);

    const erro = await migrar(c.url).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(EstadoParcial);
    const diferencas = (erro as EstadoParcial).diferencas;
    expect(diferencas).toContain('migracoes_aplicadas faltando: 202610161713_uso.sql');
    expect(diferencas).toContain('migracoes_aplicadas faltando: 202610210000_contrai_posicao.sql');
    expect(diferencas).toContain('schema faltando: tabela eventos_uso');
    expect((erro as Error).message).toContain('nada foi alterado');
    expect((erro as Error).message).toContain('schema faltando: tabela eventos_uso');
    expect(await existePgmigrations(c.url)).toBe(false);
    expect(await comCliente(c.url, lerEsquema)).toEqual(esquemaAntes);
    expect(await comCliente(c.url, contarLinhas)).toEqual(linhasAntes);
  });

  it('os 13 nomes do legado com o schema alterado à mão: aborta e lista a diferença do schema', async () => {
    const c = await novoBanco();
    await aplicarComoLegado(c.url);
    await comCliente(c.url, (cl) => cl.query('ALTER TABLE jogadores ADD COLUMN apelido_antigo text'));

    const erro = await migrar(c.url).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(EstadoParcial);
    expect((erro as EstadoParcial).diferencas).toEqual(['schema a mais: coluna jogadores.apelido_antigo text']);
    expect(await existePgmigrations(c.url)).toBe(false);
  });

  it('schema igual ao do legado sem o registro em migracoes_aplicadas: aborta', async () => {
    const c = await novoBanco();
    await aplicarComoLegado(c.url);
    await comCliente(c.url, (cl) =>
      cl.query("DELETE FROM migracoes_aplicadas WHERE nome = '202610171000_comentarios_lgpd.sql'"),
    );

    const erro = await migrar(c.url).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(EstadoParcial);
    expect((erro as EstadoParcial).diferencas).toEqual([
      'migracoes_aplicadas faltando: 202610171000_comentarios_lgpd.sql',
    ]);
    expect(await existePgmigrations(c.url)).toBe(false);
  });
});
