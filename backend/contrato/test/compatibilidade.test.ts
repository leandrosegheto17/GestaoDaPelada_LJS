// Critério: ACE-48 (G-20): remover campo quebra, campo opcional novo passa.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { comparar, formaDe, lerQuebras } from '../scripts/checar-compatibilidade';

const RAIZ = resolve(import.meta.dirname, '..');
const base = { id: z.string(), nome: z.string() };
const forma = (campos: z.ZodRawShape) => formaDe({ sessaoEu: z.strictObject(campos) });
const nenhuma = new Set<string>();

describe('comparar', () => {
  it('remover um campo de sessaoEu é quebra', () => {
    const problemas = comparar(forma(base), forma({ id: base.id }), nenhuma);
    expect(problemas).toEqual(['sessaoEu.nome: campo removido ou renomeado']);
  });
  it('renomear um campo é quebra', () => {
    expect(comparar(forma(base), forma({ id: base.id, titulo: z.string() }), nenhuma).length).toBeGreaterThan(0);
  });
  it('acrescentar um campo opcional passa', () => {
    expect(comparar(forma(base), forma({ ...base, apelido: z.string().optional() }), nenhuma)).toEqual([]);
  });
  it('acrescentar um campo obrigatório é quebra', () => {
    expect(comparar(forma(base), forma({ ...base, apelido: z.string() }), nenhuma)).toEqual([
      'sessaoEu.apelido: campo novo e obrigatório',
    ]);
  });
  it('campo opcional que fica obrigatório é quebra', () => {
    const antes = forma({ ...base, apelido: z.string().optional() });
    expect(comparar(antes, forma({ ...base, apelido: z.string() }), nenhuma)).toEqual([
      'sessaoEu.apelido: passou a ser obrigatório',
    ]);
  });
  it('campo de objeto dentro de lista também conta', () => {
    const antes = forma({ grupos: z.array(z.strictObject({ id: z.string() })) });
    const depois = forma({ grupos: z.array(z.strictObject({})) });
    expect(comparar(antes, depois, nenhuma)).toEqual(['sessaoEu.grupos[].id: campo removido ou renomeado']);
  });
  it('schema removido é quebra', () => {
    expect(comparar(forma(base), {}, nenhuma)).toEqual(['sessaoEu: schema removido']);
  });
  it('a quebra listada em QUEBRAS.md passa', () => {
    const quebras = lerQuebras('# Quebras\n\n- `sessaoEu.nome` - motivo\n');
    expect(comparar(forma(base), forma({ id: base.id }), quebras)).toEqual([]);
  });
});

describe('script', () => {
  const rodar = (...args: string[]) =>
    spawnSync(process.execPath, ['scripts/checar-compatibilidade.ts', ...args], { cwd: RAIZ, encoding: 'utf8' });

  it('passa com o snapshot gravado', () => {
    const r = rodar();
    expect(r.status).toBe(0);
  });
  it('sai com código diferente de 0 quando o snapshot tem um campo que sessaoEu perdeu', () => {
    const snapshot = JSON.parse(readFileSync(join(RAIZ, 'compatibilidade.json'), 'utf8')) as Record<
      string,
      Record<string, unknown>
    >;
    snapshot['sessaoEu']!['telefone'] = { tipo: 'string', obrigatorio: true };
    const arquivo = join(mkdtempSync(join(tmpdir(), 'compat-')), 'snapshot.json');
    writeFileSync(arquivo, JSON.stringify(snapshot));
    const r = rodar('--snapshot', arquivo);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('sessaoEu.telefone');
  });
});
