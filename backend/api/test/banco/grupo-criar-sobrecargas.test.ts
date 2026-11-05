import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Rede de proteção antes da remoção da `grupo_criar` de 6 parâmetros (simulador T1; linha de base de T25; AD-037,
 * AD-048). Na T1, o estado depois da `partidas-e-ranking`: as duas sobrecargas, a de 6 delegando à de 7
 * (`1792844640000_grupo-criar-pesos.sql:86-101`); desde a T25, só a de 7. Em qualquer momento, nenhum código de
 * produção (`src` dos pacotes do backend) nem o seed chama a de 6.
 *
 * Casos limite: chamada em template SQL com `${...}` (o repositório `grupos.ts`), chamada com `::time`/`::text[]`,
 * menção em comentário sem parênteses (não conta), argumentos com vírgula dentro de aspas ou de `ARRAY[...]`.
 */

const ASSINATURA_7 = 'grupo_criar(text,text,text,time without time zone,text,text[],date)';
const ASSINATURA_6 = 'grupo_criar(text,text,text,time without time zone,text,text[])';

const RAIZ_BACKEND = fileURLToPath(new URL('../../../', import.meta.url));
const PASTAS_DE_PRODUCAO = ['api/src', 'contrato/src', 'dominio/src', 'scripts/src'];

/**
 * Conta os argumentos de cada chamada `grupo_criar(...)` no texto: vírgulas no nível zero de parênteses, colchetes e
 * chaves, fora de aspas simples, duplas e crases.
 */
function aridadesDasChamadas(texto: string): number[] {
  const aridades: number[] = [];
  const padrao = /\bgrupo_criar\s*\(/g;
  let achado: RegExpExecArray | null;
  while ((achado = padrao.exec(texto)) !== null) {
    let i = achado.index + achado[0].length;
    let profundidade = 0;
    let aspas: string | null = null;
    let virgulas = 0;
    let algumConteudo = false;
    for (; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === aspas) aspas = null;
        continue;
      }
      if (c === "'" || c === '"') {
        aspas = c;
        algumConteudo = true;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') profundidade++;
      else if (c === ')' || c === ']' || c === '}') {
        if (profundidade === 0) break;
        profundidade--;
      } else if (c === ',' && profundidade === 0) virgulas++;
      if (c !== undefined && !/\s/.test(c)) algumConteudo = true;
    }
    aridades.push(algumConteudo ? virgulas + 1 : 0);
  }
  return aridades;
}

function arquivosTs(pasta: string): string[] {
  return (readdirSync(pasta, { recursive: true }) as string[])
    .filter((f) => f.endsWith('.ts') && !f.includes('node_modules'))
    .map((f) => join(pasta, f));
}

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

describe('contador de argumentos da grupo_criar', () => {
  it('conta 6 e 7 argumentos, ignora vírgulas aninhadas e menções sem parênteses', () => {
    const texto = [
      "SELECT id FROM grupo_criar('A, B', 'quinta', 'semanal', '20:00', $1, ARRAY['Passe', 'Chute']::text[])",
      'SELECT id, slug FROM grupo_criar(${d.nome}, ${d.dia}, ${d.freq}, ${d.horario}::time, ${d.slug}, ${hab}::text[], ${hoje}::date)',
      '/** a `grupo_criar` de 7 parâmetros */',
    ].join('\n');
    expect(aridadesDasChamadas(texto)).toEqual([6, 7]);
  });
});

// A rede da T1 previa as duas sobrecargas e a de 6 delegando; a T25 (`1792844940000_grupo-criar-contrair.sql`) remove
// a de 6, e o caso passa a afirmar o estado depois da contração (inversão prevista na T1, autorizada).
describe('sobrecargas da grupo_criar no catálogo (depois da T25)', () => {
  it('SIM-67: existe só a de 7 parâmetros', async () => {
    const r = await aberto.db.query<{ assinatura: string }>(
      `SELECT p.oid::regprocedure::text AS assinatura
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'grupo_criar'
        ORDER BY p.pronargs`,
    );
    expect(r.rows.map((l) => l.assinatura)).toEqual([ASSINATURA_7]);
  });

  it('SIM-67: a de 6 não existe mais', async () => {
    const r = await aberto.db.query<{ existe: boolean }>(`SELECT to_regprocedure($1) IS NOT NULL AS existe`, [
      ASSINATURA_6,
    ]);
    expect(r.rows[0]?.existe).toBe(false);
  });
});

describe('quem chama a grupo_criar de 6 parâmetros', () => {
  it('SIM-67: nenhum arquivo de src nem o seed chama a de 6 argumentos', () => {
    const chamadasDe6: string[] = [];
    for (const pasta of PASTAS_DE_PRODUCAO) {
      for (const arquivo of arquivosTs(join(RAIZ_BACKEND, pasta))) {
        const aridades = aridadesDasChamadas(readFileSync(arquivo, 'utf8'));
        if (aridades.includes(6)) chamadasDe6.push(arquivo.slice(RAIZ_BACKEND.length));
      }
    }
    expect(chamadasDe6).toEqual([]);
  });
});
