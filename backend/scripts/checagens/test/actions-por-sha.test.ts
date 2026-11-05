import { describe, expect, it } from 'vitest';
import { arquivosDoGithub, checarActions, problemaDoUses } from '../actions-por-sha.ts';

const SHA = '3d3c42e5aac5ba805825da76410c181273ba90b1';

function workflow(uses: string): { caminho: string; conteudo: string }[] {
  return [{ caminho: '.github/workflows/x.yml', conteudo: `jobs:\n  a:\n    steps:\n      - uses: ${uses}\n` }];
}

describe('checagem actions-por-sha', () => {
  it('FUN-40: uses: actions/checkout@v4 reprova', () => {
    const p = checarActions(workflow('actions/checkout@v4'));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^\.github\/workflows\/x\.yml:4: uses actions\/checkout@v4/);
  });

  it('FUN-40: com SHA de 40 caracteres passa, inclusive com o comentário da versão', () => {
    expect(checarActions(workflow(`actions/checkout@${SHA} # v7.0.1`))).toEqual([]);
  });

  it('FUN-40: uses: ./.github/actions/x (local) passa', () => {
    expect(checarActions(workflow('./.github/actions/dump-cifrado'))).toEqual([]);
  });

  it('FUN-40: branch, SHA curto, SHA com 41 caracteres e sem versão reprovam', () => {
    for (const ref of ['actions/checkout@main', 'actions/checkout@3d3c42e', `actions/checkout@${SHA}a`, 'actions/checkout']) {
      expect(problemaDoUses(ref), ref).not.toBeNull();
    }
  });

  it('FUN-40: SHA em maiúsculas reprova (o GitHub mostra em minúsculas)', () => {
    expect(problemaDoUses(`actions/checkout@${SHA.toUpperCase()}`)).not.toBeNull();
  });

  it('FUN-40: uses entre aspas e em subpasta de repositório também é conferido', () => {
    expect(checarActions(workflow(`"github/codeql-action/init@v3"`))).toHaveLength(1);
    expect(checarActions(workflow(`'github/codeql-action/init@${SHA}'`))).toEqual([]);
  });

  it('FUN-40: imagem Docker sem digest reprova e com digest passa', () => {
    expect(problemaDoUses('docker://alpine:3.20')).not.toBeNull();
    expect(problemaDoUses(`docker://alpine@sha256:${'a'.repeat(64)}`)).toBeNull();
  });

  it('FUN-40: uses na action composta (sem o hífen da lista) também é conferido', () => {
    const p = checarActions([{ caminho: '.github/actions/x/action.yml', conteudo: 'runs:\n  steps:\n    - name: a\n      uses: actions/cache@v4\n' }]);
    expect(p).toHaveLength(1);
  });

  it('FUN-40: a checagem roda nos workflows existentes e passa', () => {
    const arquivos = arquivosDoGithub();
    expect(arquivos.map((a) => a.caminho)).toContain('.github/workflows/backup.yml');
    expect(checarActions(arquivos)).toEqual([]);
  });
});
