import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

/**
 * Função única do acumulado (partidas-e-ranking T51; PAR-61; BD:306-308): `acumuladoAte`, `acumuladoComInicial` e
 * `pontosDaPresenca` só aparecem em `backend/dominio/src/pontuacao/`. O teste roda o ESLint do repositório sobre
 * arquivos de prova (`lintText` com um caminho que não existe em disco), como o `sem-relogio.test.ts` do domínio.
 */

const RAIZ = join(import.meta.dirname, '..', '..');

async function errosDe(codigo: string, ...caminho: string[]) {
  const eslint = new ESLint({ cwd: RAIZ });
  const [resultado] = await eslint.lintText(codigo, { filePath: join(RAIZ, ...caminho) });
  return (resultado?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax');
}

const CHAMA_PONTOS =
  "import { pontosDaPresenca } from '@pelada/dominio';\nexport const p = (): number => pontosDaPresenca('presente', false, { presencaSemChuva: 1 } as never);\n";
const CHAMA_SOMA = 'declare function acumuladoAte(...a: unknown[]): number;\nexport const s = (): number => acumuladoAte([]);\n';
const MEMBRO = 'export const m = (d: Record<string, unknown>): unknown => d.acumuladoComInicial;\n';

describe('PAR-61: só o módulo de pontuação soma pontos', () => {
  it('PAR-61: arquivo de prova em backend/api/src que chama pontosDaPresenca falha o lint', async () => {
    const erros = await errosDe(CHAMA_PONTOS, 'backend', 'api', 'src', 'prova-pontos.ts');
    // Um pelo import e um pela chamada.
    expect(erros.length).toBeGreaterThanOrEqual(2);
    expect(erros.every((e) => e.message.includes('PAR-61'))).toBe(true);
  });

  it('PAR-61: chamada a acumuladoAte e acesso a d.acumuladoComInicial fora da pontuação falham', async () => {
    expect(await errosDe(CHAMA_SOMA, 'backend', 'api', 'src', 'rotas', 'prova-soma.ts')).not.toHaveLength(0);
    expect(await errosDe(MEMBRO, 'backend', 'api', 'src', 'prova-membro.ts')).not.toHaveLength(0);
  });

  it('PAR-61: no front e no resto do domínio também falha', async () => {
    expect(await errosDe(CHAMA_PONTOS, 'frontend', 'web', 'src', 'prova-pontos.tsx')).not.toHaveLength(0);
    expect(await errosDe(CHAMA_SOMA, 'backend', 'dominio', 'src', 'ranking', 'prova-soma.ts')).not.toHaveLength(0);
    expect(await errosDe(CHAMA_SOMA, 'backend', 'api', 'test', 'prova-soma.test.ts')).not.toHaveLength(0);
  });

  it('PAR-61: no domínio a regra soma-se à do relógio, sem a substituir', async () => {
    const erros = await errosDe(`${CHAMA_SOMA}export const agora = (): number => Date.now();\n`, 'backend', 'dominio', 'src', 'prova.ts');
    expect(erros.some((e) => e.message.includes('PAR-61'))).toBe(true);
    expect(erros.some((e) => e.message.includes('GEL-70'))).toBe(true);
  });

  it('PAR-61: o mesmo código dentro de backend/dominio/src/pontuacao/ passa', async () => {
    expect(await errosDe(CHAMA_SOMA, 'backend', 'dominio', 'src', 'pontuacao', 'prova-soma.ts')).toHaveLength(0);
    expect(await errosDe(CHAMA_PONTOS, 'backend', 'dominio', 'src', 'pontuacao', 'prova-pontos.ts')).toHaveLength(0);
  });

  it('PAR-61: a pontuação continua sem relógio', async () => {
    const erros = await errosDe('export const agora = (): number => Date.now();\n', 'backend', 'dominio', 'src', 'pontuacao', 'prova.ts');
    expect(erros.some((e) => e.message.includes('GEL-70'))).toBe(true);
  });

  it('PAR-61: as rodadas do ranking podem mostrar o ponto da presença, mas não somar', async () => {
    expect(await errosDe(CHAMA_PONTOS, 'backend', 'dominio', 'src', 'ranking', 'rodadas.ts')).toHaveLength(0);
    expect(await errosDe(CHAMA_SOMA, 'backend', 'dominio', 'src', 'ranking', 'rodadas.ts')).not.toHaveLength(0);
  });

  it('PAR-61: código sem as somas internas passa', async () => {
    expect(await errosDe('export const dobro = (n: number): number => n * 2;\n', 'backend', 'api', 'src', 'prova.ts')).toHaveLength(0);
  });

  it('PAR-61: os arquivos reais da base passam (pnpm lint verde na base)', async () => {
    const eslint = new ESLint({ cwd: RAIZ });
    const resultados = await eslint.lintFiles(['backend/dominio/src/**/*.ts', 'backend/api/src/**/*.ts', 'frontend/web/src/**/*.{ts,tsx}']);
    const achados = resultados.flatMap((r) =>
      r.messages.filter((m) => m.ruleId === 'no-restricted-syntax' && m.message.includes('PAR-61')).map((m) => `${r.filePath}:${m.line}`),
    );
    expect(achados).toEqual([]);
  }, 120_000);
});
