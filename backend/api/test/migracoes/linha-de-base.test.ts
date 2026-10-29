import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { lerEsquema } from '../../src/infraestrutura/db/migracoes/esquema.ts';
import { aplicarMigracoes, PASTA_MIGRACOES } from '../../src/infraestrutura/db/migracoes/executar.ts';
import { esquemaDaLinhaDeBase } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { comCliente, criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { aplicarComoLegado, lerMigracoesLegado } from '../apoio/runner-legado.ts';

const LINHA_DE_BASE = '1792843200000_linha-de-base.sql';

const NOMES_LEGADO = [
  '202610161700_acesso.sql',
  '202610161701_grupos.sql',
  '202610161710_elenco.sql',
  '202610161711_habilidades.sql',
  '202610161712_partidas.sql',
  '202610161713_uso.sql',
  '202610161720_habilidades_ordem.sql',
  '202610161730_escalacoes.sql',
  '202610161740_financeiro.sql',
  '202610171000_comentarios_lgpd.sql',
  '202610200000_adequacao_legado.sql',
  '202610201000_inicio_pontuacao.sql',
  '202610210000_contrai_posicao.sql',
];

// As 19 tabelas do legado (analise-legado.md §3).
const TABELAS_LEGADO = [
  'auditoria',
  'config_financeira',
  'config_pesos',
  'contas',
  'escalacoes',
  'eventos_uso',
  'grupos',
  'habilidades',
  'jogadores',
  'lancamentos',
  'notas',
  'pagamentos_mes',
  'partidas',
  'pedidos_reset',
  'periodos_ativos',
  'presencas',
  'sessoes',
  'tentativas_login',
  'vinculos_admin',
];

const bancos: BancoTemporario[] = [];
const pastas: string[] = [];

async function novoBanco(): Promise<BancoTemporario> {
  const banco = await criarBancoTemporario();
  bancos.push(banco);
  return banco;
}

afterEach(async () => {
  for (const banco of bancos.splice(0)) await banco.remover();
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

describe('linha de base (FUN-07, FUN-08)', () => {
  it('a fixture tem as 13 migrations do legado, nos nomes registrados em migracoes_aplicadas', () => {
    expect(lerMigracoesLegado().map((m) => m.nome)).toEqual(NOMES_LEGADO);
  });

  it('é a concatenação literal das 13 migrations do legado, em ordem, sem alteração', () => {
    const linhaDeBase = readFileSync(join(PASTA_MIGRACOES, LINHA_DE_BASE), 'utf8');
    const corpo = lerMigracoesLegado()
      .map(({ nome, sql }) => `\n-- legado: ${nome}\n${sql}`)
      .join('');
    expect(linhaDeBase.startsWith('-- Up Migration\n')).toBe(true);
    expect(linhaDeBase.endsWith(corpo)).toBe(true);
    // Antes do corpo, só comentários (o marcador do node-pg-migrate e a explicação).
    const cabecalho = linhaDeBase.slice(0, linhaDeBase.length - corpo.length);
    expect(cabecalho.split('\n').filter((l) => l !== '' && !l.startsWith('--'))).toEqual([]);
  });

  it('banco vazio migrado tem as mesmas tabelas, colunas, restrições, índices e triggers do legado', async () => {
    const legado = await novoBanco();
    const novo = await novoBanco();
    await aplicarComoLegado(legado.url);
    expect(await aplicarMigracoes({ url: novo.url, quantas: 1 })).toEqual(['1792843200000_linha-de-base']);

    const esquemaLegado = await comCliente(legado.url, lerEsquema);
    const esquemaNovo = await comCliente(novo.url, lerEsquema);

    expect(esquemaNovo).toEqual(esquemaLegado);
    const tabelas = esquemaNovo.filter((l) => l.startsWith('tabela ')).map((l) => l.slice('tabela '.length));
    expect(tabelas).toEqual(TABELAS_LEGADO);
    expect(esquemaNovo).toContainEqual(expect.stringMatching(/^trigger grupos\.grupos_slug_imutavel /));
    expect(esquemaNovo).toContainEqual(expect.stringMatching(/^restricao jogadores\.jogadores_posicao_check /));
  });

  // ADR-031: o PostgreSQL 18 guarda o NOT NULL também em pg_constraint; a impressão digital não pode mudar por isso.
  it('o schema da linha de base bate com linha-de-base.esquema.txt, sem NOT NULL como restrição', async () => {
    const banco = await novoBanco();
    await aplicarMigracoes({ url: banco.url, quantas: 1 });
    const esquema = await comCliente(banco.url, lerEsquema);
    expect(esquema.filter((l) => /^restricao \S+ NOT NULL /.test(l))).toEqual([]);
    expect(esquema).toEqual(esquemaDaLinhaDeBase());
  });

  it('deixa o pgcrypto instalado e funcionando (FUN-03)', async () => {
    const banco = await novoBanco();
    await aplicarMigracoes({ url: banco.url });
    const { extensao, hash } = await comCliente(banco.url, async (c) => {
      const ext = await c.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname = 'pgcrypto'");
      const dig = await c.query<{ hash: string }>("SELECT encode(digest('pelada', 'sha256'), 'hex') AS hash");
      return { extensao: ext.rows.map((r) => r.extname), hash: dig.rows[0]?.hash };
    });
    expect(extensao).toEqual(['pgcrypto']);
    expect(hash).toBe('cc2760d2584959230374fc3f29234d01e5dc76f78a62a2ea416995b821a7b9a1');
  });
});

describe('uma transação por migration (FUN-07)', () => {
  it('a falha numa migration desfaz só ela: as anteriores ficam aplicadas e as seguintes não rodam', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'migracoes-'));
    pastas.push(pasta);
    writeFileSync(join(pasta, '1000_a.sql'), '-- Up Migration\nCREATE TABLE a (id int);\n');
    writeFileSync(join(pasta, '2000_b.sql'), '-- Up Migration\nCREATE TABLE b (id int);\nSELECT 1 / 0;\n');
    writeFileSync(join(pasta, '3000_c.sql'), '-- Up Migration\nCREATE TABLE c (id int);\n');
    const banco = await novoBanco();

    await expect(aplicarMigracoes({ url: banco.url, pasta })).rejects.toThrow();

    const { registradas, tabelas } = await comCliente(banco.url, async (c) => ({
      registradas: (await c.query<{ name: string }>('SELECT name FROM pgmigrations ORDER BY id')).rows.map(
        (r) => r.name,
      ),
      tabelas: (
        await c.query<{ t: string }>(
          "SELECT table_name AS t FROM information_schema.tables WHERE table_name IN ('a', 'b', 'c') ORDER BY 1",
        )
      ).rows.map((r) => r.t),
    }));
    expect(registradas).toEqual(['1000_a']);
    expect(tabelas).toEqual(['a']);
  });
});
