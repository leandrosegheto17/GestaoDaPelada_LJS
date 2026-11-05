// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import stylelint from 'stylelint';
import { describe, expect, it } from 'vitest';
import { entradasAtivas, type MapaTelas } from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Telas do financeiro na comparação visual (financeiro T46; FIN-46, FIN-47, FIN-34; AD-118, AD-029): as 12 telas de
 * t22, t23 e t24 e a t09 `sucesso` (com o mockup do projeto e o grupo com saldo) estão ativas, a t09 `sem-financeiro`
 * não; o CSS novo do financeiro passa no Stylelint de tokens (FUN-32). A comparação em si (até 1%, PC e celular) é do
 * `e2e/visual.mjs`; a asserção espacial das mensagens, de `e2e/financeiro-erros-campo.spec.ts`.
 * Molde: `telas-grupos-elenco.test.ts` e `stylelint.test.ts`.
 */

const RAIZ_MOCKUP = new URL('../../../../.specs/mockup/', import.meta.url);
const MAPA = JSON.parse(
  readFileSync(fileURLToPath(new URL('telas.json', RAIZ_MOCKUP)), 'utf8'),
) as MapaTelas;
const ATIVAS = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../e2e/telas-ativas.json', import.meta.url)), 'utf8'),
) as {
  telas: { id: string; estado: string }[];
};
const WEB = join(import.meta.dirname, '..', '..');

const DO_FINANCEIRO = [
  'T22 sucesso',
  'T22 vazio-config',
  'T22 vazio-mes',
  'T22 sem-permissao',
  'T22 desmarcar',
  'T22 erro-pagamento',
  'T23 novo',
  'T23 edicao',
  'T23 erro',
  'T23 excluir',
  'T24 vazio',
  'T24 erro',
];

describe('telas ativas do financeiro', () => {
  const ativos = ATIVAS.telas.map((t) => `${t.id} ${t.estado}`);

  it('FIN-47: as 12 telas do financeiro estão ativas, em PC e celular', () => {
    for (const e of DO_FINANCEIRO) expect(ativos).toContain(e);
    const entradas = entradasAtivas(MAPA, ATIVAS).filter((t) =>
      ['T22', 'T23', 'T24'].includes(t.id),
    );
    expect(entradas).toHaveLength(12);
    for (const t of entradas)
      expect((t as { viewports?: string[] }).viewports).toEqual(['pc', 'celular']);
  });

  it('FIN-34, AD-118: a t09 sucesso está ativa com o mockup do projeto e o grupo com saldo; a sem-financeiro fica fora', () => {
    expect(ativos).toContain('T09 sucesso');
    expect(ativos).not.toContain('T09 sem-financeiro');
    const t09 = entradasAtivas(MAPA, ATIVAS).find(
      (t) => t.id === 'T09' && t.estado === 'sucesso',
    ) as {
      mockup: string;
      respostas: { url: string; arquivo: string }[];
    };
    expect(t09.mockup).toBe('telas/t09-inicio--sucesso.html');
    const grupo = t09.respostas.find((r) => r.url === '**/api/grupos/g-quinta');
    const corpo = JSON.parse(
      readFileSync(fileURLToPath(new URL(grupo?.arquivo ?? '', RAIZ_MOCKUP)), 'utf8'),
    ) as {
      saldoFinanceiroCentavos?: number;
    };
    expect(corpo.saldoFinanceiroCentavos).toBe(124550);
  });

  it('FIN-47: sem entrada repetida', () => {
    expect(new Set(ativos).size).toBe(ativos.length);
  });

  it('FIN-46: o CSS do financeiro passa no Stylelint de tokens', async () => {
    const r = await stylelint.lint({
      files: [join(WEB, 'src/telas/financeiro/financeiro.module.css')],
      configFile: join(WEB, '.stylelintrc.json'),
      configBasedir: WEB,
    });
    expect(r.results.flatMap((x) => x.warnings.map((a) => `${a.rule}: ${a.text}`))).toEqual([]);
    expect(r.errored).toBe(false);
  });
});
