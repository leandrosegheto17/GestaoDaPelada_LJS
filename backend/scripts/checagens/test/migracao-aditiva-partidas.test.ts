import { describe, expect, it } from 'vitest';
import { checarMigracoes, entradaDoRepositorio } from '../migracao-aditiva.ts';

/**
 * Migrações da partidas-e-ranking aditivas (T21 a T26; PAR-14): cada uma existe no repositório, com timestamp maior
 * que a última migração da grupos-e-elenco (`1792844520000`), e a checagem `migracao-aditiva` não reprova nenhuma.
 * Cada tarefa acrescenta o sufixo da sua migração a esta lista.
 */

const DA_FEATURE = ['_pesos-padrao.sql', '_grupo-criar-pesos.sql', '_eventos-uso.sql', '_contas-nomes-do-grupo.sql', '_grants-partidas-pesos.sql'] as const;

describe('migrações da partidas-e-ranking', () => {
  const e = entradaDoRepositorio();

  it.each(DA_FEATURE)('PAR-14: %s existe, depois de 1792844520000', (sufixo) => {
    const achadas = e.arquivos.filter((a) => a.nome.endsWith(sufixo));
    expect(achadas).toHaveLength(1);
    const ts = Number(achadas[0]?.nome.split('_')[0]);
    expect(ts).toBeGreaterThan(1792844520000);
  });

  it('PAR-14: a checagem de migração aditiva não reprova as migrações da feature', () => {
    const problemas = checarMigracoes(e).filter((p) => DA_FEATURE.some((s) => p.includes(s)));
    expect(problemas).toEqual([]);
  });

  it('PAR-14: as migrações da feature não têm DROP', () => {
    for (const a of e.arquivos.filter((x) => DA_FEATURE.some((s) => x.nome.endsWith(s)))) {
      const semComentario = a.conteudo
        .split('\n')
        .map((l) => l.replace(/--.*$/, ''))
        .join('\n');
      expect(semComentario, a.nome).not.toMatch(/\bDROP\b/i);
    }
  });
});
