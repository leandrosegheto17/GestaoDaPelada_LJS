import { describe, expect, it } from 'vitest';
import { arquivosDoRepositorio, checarUrls, permitido } from '../sem-url-absoluta.ts';

// Os domínios são montados por partes: este arquivo não pode citá-los por inteiro, senão a
// checagem da base atual reprovaria o próprio teste.
const LJS = ['gestaodapelada', 'ljssoftware', 'com', 'br'].join('.');
const WORKERS = ['gestaodapelada-v2', 'conta', 'workers', 'dev'].join('.');

describe('checagem sem-url-absoluta', () => {
  it('FUN-23: arquivo de código com o domínio do LJS reprova', () => {
    const p = checarUrls([
      { caminho: 'backend/api/src/exemplo.ts', conteudo: `const u = 'https://${LJS}/g';\n` },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^backend\/api\/src\/exemplo\.ts:1: cita domínio do LJS/);
  });

  it('FUN-23: o domínio do LJS em docs/ passa', () => {
    expect(checarUrls([{ caminho: 'docs/runbook.md', conteudo: `Abra https://${LJS}\n` }])).toEqual(
      [],
    );
  });

  it('FUN-23: o endereço padrão da Cloudflare (workers + .dev) num .ts reprova', () => {
    const p = checarUrls([
      {
        caminho: 'frontend/web/src/app/api.ts',
        conteudo: `// ok\nfetch('https://${WORKERS}/api/health');\n`,
      },
    ]);
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/^frontend\/web\/src\/app\/api\.ts:2: cita workers/);
  });

  it('FUN-23: o domínio numa migração reprova', () => {
    const p = checarUrls([
      {
        caminho: 'backend/api/src/infraestrutura/db/migracoes/1799999999999_x.sql',
        conteudo: `-- Up Migration\nINSERT INTO links (url) VALUES ('https://${LJS}');\n`,
      },
    ]);
    expect(p).toHaveLength(1);
  });

  it('FUN-23: maiúsculas não escapam', () => {
    expect(
      checarUrls([{ caminho: 'a.ts', conteudo: `'https://${LJS.toUpperCase()}'` }]),
    ).toHaveLength(1);
    expect(
      checarUrls([{ caminho: 'a.ts', conteudo: `'https://${WORKERS.toUpperCase()}'` }]),
    ).toHaveLength(1);
  });

  it('FUN-23: wrangler.jsonc, .env.example e .specs/ são permitidos', () => {
    const conteudo = `${LJS} ${WORKERS}\n`;
    expect(
      checarUrls([
        { caminho: 'wrangler.jsonc', conteudo },
        { caminho: '.env.example', conteudo },
        { caminho: '.specs/features/fundacao/spec.md', conteudo },
      ]),
    ).toEqual([]);
  });

  it('FUN-23: a lista permitida é exata, não um prefixo solto', () => {
    expect(permitido('backend/wrangler.jsonc')).toBe(false);
    expect(permitido('documentos/x.md')).toBe(false);
    expect(permitido('frontend/docs/x.ts')).toBe(false);
    expect(permitido('.env.example.ts')).toBe(false);
    expect(permitido('docs/x.md')).toBe(true);
  });

  it('FUN-23: arquivo sem os domínios passa', () => {
    expect(checarUrls([{ caminho: 'a.ts', conteudo: `const u = env.URL_PUBLICA;\n` }])).toEqual([]);
  });

  it('FUN-23: a checagem roda na base atual e passa', () => {
    expect(checarUrls(arquivosDoRepositorio())).toEqual([]);
  });
});
