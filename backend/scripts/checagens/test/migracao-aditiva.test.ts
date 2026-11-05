import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checarMigracoes, entradaDoRepositorio, type Entrada } from '../migracao-aditiva.ts';

const STATE = '- **AD-099** (2026-11-04): exceção aditiva de exemplo.\n';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

function entrada(arquivos: Record<string, string>, herdadas: Record<string, string> = {}): Entrada {
  return {
    arquivos: Object.entries(arquivos).map(([nome, conteudo]) => ({ nome, conteudo })),
    herdadas: new Map(Object.entries(herdadas).map(([n, c]) => [n, sha(c)])),
    state: STATE,
  };
}

const NOVA = '1799999999999_nova.sql';

describe('checagem migracao-aditiva', () => {
  const DESTRUTIVOS: Array<[string, string]> = [
    ['DROP TABLE', 'DROP TABLE jogadores;'],
    ['DROP TABLE IF EXISTS', 'DROP TABLE IF EXISTS jogadores;'],
    ['DROP COLUMN', 'ALTER TABLE jogadores DROP COLUMN apelido;'],
    ['ALTER COLUMN ... TYPE', 'ALTER TABLE jogadores ALTER COLUMN nome TYPE varchar(10);'],
    ['ALTER ... SET DATA TYPE', 'ALTER TABLE jogadores ALTER nome SET DATA TYPE varchar(10);'],
    ['RENAME de tabela', 'ALTER TABLE jogadores RENAME TO atletas;'],
    ['RENAME de coluna', 'ALTER TABLE jogadores RENAME COLUMN nome TO apelido;'],
    ['caixa baixa', 'drop table jogadores;'],
  ];

  for (const [nome, sql] of DESTRUTIVOS) {
    it(`FUN-56: ${nome} reprova numa migração nova`, () => {
      const p = checarMigracoes(entrada({ [NOVA]: `-- Up Migration\n${sql}\n` }));
      expect(p).toHaveLength(1);
      expect(p[0]).toMatch(/não é aditiva/);
    });
  }

  it('FUN-56: migração só aditiva passa', () => {
    const sql = '-- Up Migration\nCREATE TABLE x (id int);\nALTER TABLE x ADD COLUMN y text;\n';
    expect(checarMigracoes(entrada({ [NOVA]: sql }))).toEqual([]);
  });

  it('FUN-56: DROP citado só em comentário não reprova', () => {
    const sql = '-- Up Migration\n-- aqui não há DROP TABLE\nCREATE TABLE x (id int);\n';
    expect(checarMigracoes(entrada({ [NOVA]: sql }))).toEqual([]);
  });

  it('FUN-56: com a linha de exceção e a AD em STATE.md, passa', () => {
    const sql = '-- Up Migration\n-- excecao-aditiva: AD-099\nDROP TABLE velha;\n';
    expect(checarMigracoes(entrada({ [NOVA]: sql }))).toEqual([]);
  });

  it('FUN-56: exceção que cita AD inexistente reprova', () => {
    const sql = '-- Up Migration\n-- excecao-aditiva: AD-998\nDROP TABLE velha;\n';
    const p = checarMigracoes(entrada({ [NOVA]: sql }));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/AD-998, que não está/);
  });

  it('FUN-56: herdada com DROP passa pela lista fechada', () => {
    const nome = '1792843200000_linha-de-base.sql';
    const herdada = '-- Up Migration\nDROP TABLE antiga;\n';
    expect(checarMigracoes(entrada({ [nome]: herdada }, { [nome]: herdada }))).toEqual([]);
  });

  it('FUN-56: herdada alterada reprova pelo hash', () => {
    const nome = '1792843200000_linha-de-base.sql';
    const p = checarMigracoes(entrada({ [nome]: 'mudou' }, { [nome]: 'original' }));
    expect(p).toEqual([`${nome}: migração herdada alterada (hash diferente)`]);
  });

  it('FUN-56: as 23 copiadas do repositório passam', () => {
    const e = entradaDoRepositorio();
    expect(e.herdadas.size).toBe(23);
    expect(checarMigracoes(e)).toEqual([]);
  });

  it('FUN-56: um 24º arquivo com DROP reprova, mesmo com as 23 da lista', () => {
    const e = entradaDoRepositorio();
    e.arquivos.push({ nome: NOVA, conteudo: '-- Up Migration\nDROP TABLE jogadores;\n' });
    const p = checarMigracoes(e);
    expect(p).toHaveLength(1);
    expect(p[0]?.startsWith(`${NOVA}: não é aditiva`)).toBe(true);
  });
});
