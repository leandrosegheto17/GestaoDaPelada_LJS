import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checarChaveAsaas } from '../chave-asaas.ts';
import { lerEnvExample } from '../env-example.ts';
import { arquivosDoRepositorio, RAIZ } from '../sem-url-absoluta.ts';

// O prefixo e a chave de prova são montados por partes: a checagem e o gitleaks reprovariam este teste.
const PREFIXO = ['$', 'aa', 'ct_'].join('');
const CHAVE_DE_PROVA = `${PREFIXO}${'AbC123'.repeat(7).slice(0, 40)}`;

describe('checagem chave-asaas', () => {
  it('PLA-37: arquivo de prova com o prefixo do Asaas seguido de 40 caracteres reprova', () => {
    const p = checarChaveAsaas([{ caminho: 'backend/api/src/x.ts', conteudo: `// ok\nconst k = '${CHAVE_DE_PROVA}';\n` }]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^backend\/api\/src\/x\.ts:2: parece uma chave da API do Asaas/);
    expect(p[0]).not.toContain(CHAVE_DE_PROVA);
  });

  it('PLA-37: a chave nova (prod_ ou hmlg_) também reprova, em qualquer arquivo', () => {
    const nova = `${PREFIXO}prod_${'a'.repeat(48)}`;
    expect(checarChaveAsaas([{ caminho: '.env.example', conteudo: `ASAAS_API_KEY=${nova}\n` }])).toHaveLength(1);
    expect(checarChaveAsaas([{ caminho: 'docs/runbook.md', conteudo: `use ${nova}` }])).toHaveLength(1);
  });

  it('PLA-37: só o prefixo, ou com menos de 40 caracteres, passa (exemplo de formato na documentação)', () => {
    expect(checarChaveAsaas([{ caminho: 'docs/x.md', conteudo: `A chave começa por ${PREFIXO}.` }])).toEqual([]);
    expect(checarChaveAsaas([{ caminho: 'x.ts', conteudo: `${PREFIXO}${'a'.repeat(39)}` }])).toEqual([]);
  });

  it('PLA-37: o .env.example traz ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN e ASAAS_URL sem valor de segredo', () => {
    const texto = readFileSync(join(RAIZ, '.env.example'), 'utf8');
    const vars = new Map(lerEnvExample(texto).map((v) => [v.nome, v]));
    for (const nome of ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN', 'ASAAS_URL']) expect(vars.has(nome)).toBe(true);
    expect(vars.get('ASAAS_API_KEY')?.valor).toBe('');
    expect(vars.get('ASAAS_WEBHOOK_TOKEN')?.valor).toBe('');
    expect(vars.get('ASAAS_API_KEY')?.comentario).toMatch(/segredo: sim/);
    expect(vars.get('ASAAS_WEBHOOK_TOKEN')?.comentario).toMatch(/segredo: sim/);
    expect(checarChaveAsaas([{ caminho: '.env.example', conteudo: texto }])).toEqual([]);
  });

  it('PLA-37: o .gitleaks.toml tem a regra do prefixo do Asaas', () => {
    const toml = readFileSync(join(RAIZ, '.gitleaks.toml'), 'utf8');
    expect(toml).toContain('id = "asaas-api-key"');
    expect(toml).toContain('aact_');
  });

  it('PLA-37: a base atual do repositório passa', () => {
    expect(checarChaveAsaas(arquivosDoRepositorio(RAIZ))).toEqual([]);
  });
});
