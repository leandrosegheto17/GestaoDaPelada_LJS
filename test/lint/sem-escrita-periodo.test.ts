import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Regra `pelada/sem-escrita-periodo` ligada (partidas-e-ranking T52; PAR-140; BD:309-314; AD-039): fora de
 * `repositorios/jogadores.ts` e das migrações, nenhum arquivo de `backend/api/src` escreve em `periodos_ativos`.
 * Roda o ESLint do repositório sobre arquivos de prova (`lintText` com caminho que não existe em disco) e sobre os
 * arquivos reais que só leem os períodos.
 */

const RAIZ = join(import.meta.dirname, '..', '..');
const REGRA = 'pelada/sem-escrita-periodo';
const REPOS = ['backend', 'api', 'src', 'infraestrutura', 'db', 'repositorios'] as const;

async function achados(codigo: string, ...caminho: string[]) {
  const eslint = new ESLint({ cwd: RAIZ });
  const [resultado] = await eslint.lintText(codigo, { filePath: join(RAIZ, ...caminho) });
  return (resultado?.messages ?? []).filter((m) => m.ruleId === REGRA);
}

const fora = (codigo: string) => achados(codigo, ...REPOS, 'prova-periodo.ts');

describe('PAR-140: pelada/sem-escrita-periodo', () => {
  it("PAR-140: insertInto('periodos_ativos') fora do repositório de jogadores falha o lint", async () => {
    const erros = await fora("export const f = (db: any) => db.insertInto('periodos_ativos').values({}).execute();\n");
    expect(erros).toHaveLength(1);
    expect(erros[0]?.message).toContain('PAR-140');
  });

  it("PAR-140: updateTable('periodos_ativos') com inicio ou fim falha", async () => {
    expect(await fora("export const f = (db: any) => db.updateTable('periodos_ativos').set({ fim: null }).execute();\n")).toHaveLength(1);
    expect(await fora("export const f = (db: any) => db['updateTable']('periodos_ativos').set({ inicio: '2026-01-01' });\n")).toHaveLength(1);
  });

  it('PAR-140: SQL à mão com UPDATE ou INSERT INTO periodos_ativos falha, em template com expressão e em texto', async () => {
    expect(await fora('export const q = (fim: string) => sql`UPDATE periodos_ativos SET fim = ${fim}::date`;\ndeclare const sql: any;\n')).toHaveLength(1);
    expect(await fora("export const q = 'insert into public.\"periodos_ativos\" (inicio) values ($1)';\n")).toHaveLength(1);
  });

  it('PAR-140: nome da tabela guardado em variável ou montado por partes falha', async () => {
    expect(await fora("export const TABELA = 'periodos_ativos';\n")).toHaveLength(1);
    expect(await fora("export const t = 'periodos' + '_ativos';\n")).toHaveLength(1);
    expect(await fora("export const t = (x: string) => 'periodos_' + x;\n")).toHaveLength(1);
    expect(await fora('export const t = (x: string) => `periodos_${x}`;\n')).toHaveLength(1);
  });

  it('PAR-140: ler os períodos passa (selectFrom e SELECT … FROM)', async () => {
    expect(await fora("export const f = (db: any) => db.selectFrom('periodos_ativos').selectAll().execute();\n")).toHaveLength(0);
    expect(
      await fora('export const q = (id: string) => sql`SELECT inicio, fim FROM periodos_ativos WHERE jogador_id = ${id} FOR KEY SHARE`;\ndeclare const sql: any;\n'),
    ).toHaveLength(0);
  });

  it('PAR-140: o repositório de jogadores e as migrações podem escrever', async () => {
    const escrita = "export const f = (db: any) => db.insertInto('periodos_ativos').values({}).execute();\n";
    expect(await achados(escrita, ...REPOS, 'jogadores.ts')).toHaveLength(0);
    expect(await achados(escrita, 'backend', 'api', 'src', 'infraestrutura', 'db', 'migracoes', 'prova.ts')).toHaveLength(0);
  });

  it('PAR-140: rota fora dos repositórios também é pega', async () => {
    expect(await achados("export const f = (db: any) => db.insertInto('periodos_ativos');\n", 'backend', 'api', 'src', 'rotas', 'prova.ts')).toHaveLength(1);
  });

  it('PAR-140: partidas.ts (que só lê períodos) passa', async () => {
    const caminho = join(RAIZ, ...REPOS, 'partidas.ts');
    const r = await achados(readFileSync(caminho, 'utf8'), ...REPOS, 'partidas.ts');
    expect(r).toEqual([]);
  });

  it('PAR-140: lint antes de ligar, zero achados em backend/api/src', async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    const resultados = await eslint.lintFiles(['backend/api/src/**/*.ts']);
    const lista = resultados.flatMap((r) => r.messages.filter((m) => m.ruleId === REGRA).map((m) => `${r.filePath}:${m.line}`));
    expect(lista).toEqual([]);
  }, 120_000);
});
