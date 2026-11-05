import { describe, expect, it } from 'vitest';
import { arquivosReais, ASAAS_URL_SANDBOX, checarSoPrevia, DOMINIO_PERMITIDO } from '../so-previa.ts';

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

  describe('AD-121: o único domínio próprio permitido', () => {
    const rota = (pattern: string, resto = '') =>
      jsonc(`  "routes": [{ "pattern": "${pattern}", "custom_domain": true${resto} }],
`);

    it('FUN-28: a rota do domínio permitido passa no wrangler.jsonc', () => {
      expect(checarSoPrevia(rota(DOMINIO_PERMITIDO))).toEqual([]);
    });

    it('FUN-28: outro domínio, ou o permitido com sufixo ou prefixo, reprova', () => {
      expect(checarSoPrevia(rota('outro.ljssoftware.com.br'))).not.toHaveLength(0);
      expect(checarSoPrevia(rota(`${DOMINIO_PERMITIDO}.evil.com`))).not.toHaveLength(0);
      expect(checarSoPrevia(rota(`x.${DOMINIO_PERMITIDO}`))).not.toHaveLength(0);
      expect(checarSoPrevia(rota(`${DOMINIO_PERMITIDO}/*`))).not.toHaveLength(0);
    });

    it('FUN-28: um segundo pattern na mesma linha reprova', () => {
      const linha = `  "routes": [{ "pattern": "${DOMINIO_PERMITIDO}", "custom_domain": true }, { "pattern": "x.com", "custom_domain": true }],
`;
      expect(checarSoPrevia(jsonc(linha))).not.toHaveLength(0);
    });

    it('FUN-28: o domínio permitido não vale no deploy.yml nem como opção do wrangler', () => {
      expect(checarSoPrevia(deploy(`run: wrangler x --domain ${DOMINIO_PERMITIDO}
`))).not.toHaveLength(0);
      expect(checarSoPrevia(deploy(`        routes: ${DOMINIO_PERMITIDO}
`))).not.toHaveLength(0);
      expect(checarSoPrevia(deploy(`# custom_domain: ${DOMINIO_PERMITIDO}
`))).not.toHaveLength(0);
    });

    it('FUN-28: a rota permitida não esconde o Worker gestaodapelada sem -v2', () => {
      const linha = `  "routes": [{ "pattern": "${DOMINIO_PERMITIDO}", "custom_domain": true }], "name": "gestaodapelada",
`;
      expect(checarSoPrevia(jsonc(linha))).not.toHaveLength(0);
    });
  });

  it('FUN-28: environment: producao passa (AD-119)', () => {
    expect(checarSoPrevia(deploy('jobs:\n  deploy:\n    environment: producao\n'))).toEqual([]);
  });

  describe('PLA-38: ASAAS_URL só no sandbox', () => {
    it('PLA-38: ASAAS_URL com https://api.asaas.com/v3 reprova no wrangler.jsonc e no deploy.yml', () => {
      expect(checarSoPrevia(jsonc('    "ASAAS_URL": "https://api.asaas.com/v3"
'))).toHaveLength(1);
      expect(checarSoPrevia(deploy('          --var "ASAAS_URL:https://api.asaas.com/v3"
'))).toHaveLength(1);
    });

    it('PLA-38: a do sandbox passa', () => {
      expect(checarSoPrevia(jsonc(`    "ASAAS_URL": "${ASAAS_URL_SANDBOX}"
`))).toEqual([]);
      expect(checarSoPrevia(deploy(`          --var "ASAAS_URL:${ASAAS_URL_SANDBOX}"
`))).toEqual([]);
      expect(ASAAS_URL_SANDBOX).toBe('https://api-sandbox.asaas.com/v3');
    });

    it('PLA-38: ASAAS_URL vinda de vars, secrets ou variável de shell reprova (o valor não pode ser conferido)', () => {
      expect(checarSoPrevia(deploy('          --var "ASAAS_URL:${{ vars.ASAAS_URL }}"
'))).toHaveLength(1);
      expect(checarSoPrevia(deploy('          ASAAS_URL: ${{ secrets.ASAAS_URL }}
'))).toHaveLength(1);
      expect(checarSoPrevia(deploy('          --var "ASAAS_URL:$ASAAS_URL"
'))).toHaveLength(1);
    });

    it('PLA-38: o sandbox com outro endereço na mesma linha reprova; outro caminho do sandbox também', () => {
      expect(
        checarSoPrevia(jsonc(`    "ASAAS_URL": "${ASAAS_URL_SANDBOX}", "X": "https://api.asaas.com/v3"
`)),
      ).toHaveLength(1);
      expect(checarSoPrevia(jsonc('    "ASAAS_URL": "https://api-sandbox.asaas.com/v2"
'))).toHaveLength(1);
      expect(checarSoPrevia(jsonc('    "ASAAS_URL": "https://asaas.exemplo.com/v3"
'))).toHaveLength(1);
    });

    it('PLA-38: o endereço de produção do Asaas reprova mesmo sem o nome ASAAS_URL', () => {
      expect(checarSoPrevia(deploy('        run: curl https://api.asaas.com/v3/payments
'))).toHaveLength(1);
      expect(checarSoPrevia(deploy('        run: curl https://API.ASAAS.COM/v3
'))).toHaveLength(1);
    });
  });

  it('FUN-28: a checagem passa nos arquivos reais', () => {
    const reais = arquivosReais();
    expect(reais.map((a) => a.caminho)).toEqual(['wrangler.jsonc', '.github/workflows/deploy.yml']);
    expect(checarSoPrevia(reais)).toEqual([]);
  });
});
