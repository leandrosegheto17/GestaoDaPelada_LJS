import { describe, expect, it } from 'vitest';
import { arquivosReais, checarSoPrevia } from '../so-previa.ts';

const jsonc = (conteudo: string) => [{ caminho: 'wrangler.jsonc', conteudo }];
const deploy = (conteudo: string) => [{ caminho: '.github/workflows/deploy.yml', conteudo }];

describe('checagem so-previa', () => {
  it('FUN-28: name: gestaodapelada reprova; gestaodapelada-v2 passa', () => {
    const p = checarSoPrevia(jsonc('{\n  "name": "gestaodapelada",\n}\n'));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^wrangler\.jsonc:2: cita o Worker gestaodapelada sem -v2/);
    expect(checarSoPrevia(jsonc('{ "name": "gestaodapelada-v2" }'))).toEqual([]);
  });

  it('FUN-28: o nome antigo no deploy.yml (ex.: --name) e em maiúsculas também reprova', () => {
    expect(checarSoPrevia(deploy('run: wrangler x --name gestaodapelada\n'))).toHaveLength(1);
    expect(checarSoPrevia(jsonc('"name": "GestaoDaPelada"'))).toHaveLength(1);
    expect(checarSoPrevia(jsonc('"name": "gestaodapelada-v3"'))).toHaveLength(1);
  });

  it('FUN-28: routes e route no wrangler.jsonc reprovam', () => {
    expect(checarSoPrevia(jsonc('  "routes": [{ "pattern": "x.com/*" }],\n'))).toHaveLength(1);
    expect(checarSoPrevia(jsonc('  "route": "x.com/*",\n'))).toHaveLength(1);
  });

  it('FUN-28: custom_domain no wrangler.jsonc e no deploy.yml reprova', () => {
    expect(checarSoPrevia(jsonc('  { "pattern": "app.x.com", "custom_domain": true }\n'))).not.toHaveLength(0);
    expect(checarSoPrevia(deploy('# custom_domain: app.x.com\n'))).toHaveLength(1);
  });

  it('FUN-28: routes e --route/--domain no deploy.yml reprovam', () => {
    expect(checarSoPrevia(deploy('        routes: x.com/*\n'))).toHaveLength(1);
    expect(checarSoPrevia(deploy('run: wrangler x --route x.com/*\n'))).toHaveLength(1);
    expect(checarSoPrevia(deploy('run: wrangler x --domain app.x.com\n'))).toHaveLength(1);
  });

  it('FUN-28: environment: producao passa (AD-119)', () => {
    expect(checarSoPrevia(deploy('jobs:\n  deploy:\n    environment: producao\n'))).toEqual([]);
  });

  it('FUN-28: a checagem passa nos arquivos reais', () => {
    const reais = arquivosReais();
    expect(reais.map((a) => a.caminho)).toEqual(['wrangler.jsonc', '.github/workflows/deploy.yml']);
    expect(checarSoPrevia(reais)).toEqual([]);
  });
});
