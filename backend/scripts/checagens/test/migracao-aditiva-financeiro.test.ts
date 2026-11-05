import { describe, expect, it } from 'vitest';
import { checarMigracoes, entradaDoRepositorio } from '../migracao-aditiva.ts';

/**
 * Migrações do financeiro aditivas (T9, T10; FIN-42): as duas existem no repositório, com timestamp maior que a última
 * migração da grupos-e-elenco (`1792844520000`) e a checagem `migracao-aditiva` não reprova nenhuma delas.
 */

const DO_FINANCEIRO = ['_financeiro-rls.sql', '_financeiro-trava-acesso.sql'] as const;

describe('migrações do financeiro', () => {
  const e = entradaDoRepositorio();

  it.each(DO_FINANCEIRO)('FIN-42: %s existe, depois de 1792844520000', (sufixo) => {
    const achadas = e.arquivos.filter((a) => a.nome.endsWith(sufixo));
    expect(achadas).toHaveLength(1);
    const ts = Number(achadas[0]?.nome.split('_')[0]);
    expect(ts).toBeGreaterThan(1792844520000);
  });

  it('FIN-42: a checagem de migração aditiva não reprova as migrações do financeiro', () => {
    const problemas = checarMigracoes(e).filter((p) => DO_FINANCEIRO.some((s) => p.includes(s)));
    expect(problemas).toEqual([]);
  });

  it('FIN-42: as migrações do financeiro não têm DROP nem ALTER ... DROP', () => {
    for (const a of e.arquivos.filter((x) => DO_FINANCEIRO.some((s) => x.nome.endsWith(s)))) {
      const semComentario = a.conteudo
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join('\n');
      expect(semComentario, a.nome).not.toMatch(/\bDROP\b/i);
    }
  });
});
