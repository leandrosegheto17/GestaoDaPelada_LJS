// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  adaptarCorpo,
  entradasAtivas,
  type MapaTelas,
} from '../../e2e/ferramentas/telas-reais.mjs';

/**
 * Entradas do financeiro no `telas.json` (financeiro T45; FIN-47, AD-054, AD-021): as 12 telas de t22, t23 e t24 são
 * reais, nas rotas do app (`/app/grupos/g-quinta/financeiro…`), com as respostas de sessão e do mês, e os estados que
 * eram de revisão manual (desmarcar, erro de pagamento, erro e excluir do t23, erro do t24) agora têm `passos`.
 * Molde: `telas-grupos-elenco.test.ts`.
 */

const RAIZ_MOCKUP = new URL('../../../../.specs/mockup/', import.meta.url);
const MAPA = JSON.parse(
  readFileSync(fileURLToPath(new URL('telas.json', RAIZ_MOCKUP)), 'utf8'),
) as MapaTelas & {
  revisaoManual?: { id: string; estado: string }[];
};

type Entrada = {
  id: string;
  estado: string;
  rota: string;
  real?: boolean;
  mockup: string;
  respostas?: { url: string; arquivo?: string; status?: number }[];
  passos?: Record<string, unknown>[];
};

const ESPERADAS = [
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

const DO_FINANCEIRO = ((MAPA.telas ?? []) as Entrada[]).filter((t) =>
  ['T22', 'T23', 'T24'].includes(t.id),
);
const CHAVES_DE_PASSO = new Set([
  'preencher',
  'valor',
  'clicar',
  'indice',
  'esperar',
  'aguardarMs',
]);

describe('telas do financeiro no telas.json', () => {
  it('FIN-47: as 12 entradas existem uma vez cada e são reais', () => {
    expect(DO_FINANCEIRO.map((t) => `${t.id} ${t.estado}`).sort()).toEqual([...ESPERADAS].sort());
    for (const t of DO_FINANCEIRO) expect(t.real).toBe(true);
    const ativas = {
      telas: ESPERADAS.map((e) => ({ id: e.split(' ')[0] ?? '', estado: e.split(' ')[1] ?? '' })),
    };
    expect(() => entradasAtivas(MAPA, ativas)).not.toThrow();
  });

  it('FIN-47, AD-054: as rotas são do app, nenhuma em /admin', () => {
    for (const t of DO_FINANCEIRO) {
      expect(t.rota.startsWith('/app/grupos/g-quinta/financeiro')).toBe(true);
      expect(t.rota).not.toContain('/admin');
    }
  });

  it('FIN-47: toda entrada responde a sessão e a mockup e as respostas existem no disco', () => {
    for (const t of DO_FINANCEIRO) {
      expect(existsSync(fileURLToPath(new URL(t.mockup, RAIZ_MOCKUP)))).toBe(true);
      const urls = (t.respostas ?? []).map((r) => r.url);
      expect(urls).toContain('**/api/sessao');
      for (const r of t.respostas ?? []) {
        if (r.arquivo)
          expect(existsSync(fileURLToPath(new URL(r.arquivo, RAIZ_MOCKUP))), r.arquivo).toBe(true);
      }
    }
  });

  it('FIN-47: os estados de interação têm passos só com as chaves do runner e saíram da revisão manual', () => {
    const comPassos = [
      'T22 desmarcar',
      'T22 erro-pagamento',
      'T23 erro',
      'T23 excluir',
      'T24 erro',
    ];
    for (const nome of comPassos) {
      const t = DO_FINANCEIRO.find((e) => `${e.id} ${e.estado}` === nome);
      expect(t?.passos?.length ?? 0, nome).toBeGreaterThan(0);
      for (const passo of t?.passos ?? [])
        for (const chave of Object.keys(passo))
          expect(CHAVES_DE_PASSO.has(chave), chave).toBe(true);
    }
    const manuais = (MAPA.revisaoManual ?? []).map((r) => `${r.id} ${r.estado}`);
    for (const nome of comPassos) expect(manuais).not.toContain(nome);
  });

  it('FIN-47: o 422 do t23 já está no formato da API, com a mensagem de cada campo', () => {
    const t = DO_FINANCEIRO.find((e) => e.id === 'T23' && e.estado === 'erro');
    const arquivo = t?.respostas?.find((r) => r.status === 422)?.arquivo ?? '';
    const corpo = JSON.parse(
      adaptarCorpo(readFileSync(fileURLToPath(new URL(arquivo, RAIZ_MOCKUP)), 'utf8')),
    ) as {
      codigo: string;
      campos: string[];
      mensagens: Record<string, string>;
    };
    expect(corpo.codigo).toBe('dados_invalidos');
    expect(corpo.campos).toEqual(['descricao', 'valorCentavos']);
    expect(corpo.mensagens.descricao).toBe('Informe a descrição.');
  });
});
