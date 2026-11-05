import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Página offline (FUN-35, AD-007): sem URL externa nem script, estilo só pelo CSS do build (que
 * usa só tokens) e com `lang="pt-BR"`, título e a landmark `main`.
 *
 * SPEC_DEVIATION: a página nasce em `frontend/web/offline.html` (segunda entrada do Vite), e não
 * em `public/offline.html`, porque o arquivo de `public` é copiado sem passar pelo build e não
 * acharia o CSS com os tokens. O build a grava em `dist/offline.html`, onde o SW a procura.
 */

const WEB = join(import.meta.dirname, '..', '..');
const HTML = readFileSync(join(WEB, 'offline.html'), 'utf8');
const TOKENS = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'), 'utf8');

function documento(): Document {
  return new DOMParser().parseFromString(HTML, 'text/html');
}

/** Todas as URLs citadas no HTML (href, src, url(...)). */
function urlsDoHtml(): string[] {
  const achadas: string[] = [];
  for (const m of HTML.matchAll(/\s(?:href|src|action|poster|data)\s*=\s*["']([^"']*)["']/gi)) achadas.push(m[1] ?? '');
  for (const m of HTML.matchAll(/url\(\s*["']?([^"')]+)/gi)) achadas.push(m[1] ?? '');
  return achadas;
}

/** Folhas de estilo locais do HTML, resolvidas para o arquivo-fonte. */
function folhasDeEstilo(): string[] {
  return [...documento().querySelectorAll('link[rel="stylesheet"]')].map((l) => {
    const href = l.getAttribute('href') ?? '';
    return join(WEB, ...href.split('/').filter(Boolean));
  });
}

describe('página offline', () => {
  it('FUN-35: o HTML não referencia nenhuma URL externa', () => {
    const urls = urlsDoHtml();
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url, `URL externa: ${url}`).not.toMatch(/^(?:[a-z][a-z0-9+.-]*:)?\/\//i);
      expect(url, `URL com esquema: ${url}`).not.toMatch(/^(?:https?|data|javascript):/i);
    }
  });

  it('FUN-35: sem script e sem estilo embutido; o estilo vem só do CSS do build', () => {
    const doc = documento();
    expect(doc.querySelectorAll('script')).toHaveLength(0);
    expect(doc.querySelectorAll('style')).toHaveLength(0);
    expect(doc.querySelectorAll('[style]')).toHaveLength(0);
    const folhas = folhasDeEstilo();
    expect(folhas).toHaveLength(1);
    for (const f of folhas) expect(existsSync(f), `${f} não existe`).toBe(true);
  });

  it('FUN-35: o CSS da página só usa var(--...) definidos em tokens.css e importa o global.css', () => {
    for (const folha of folhasDeEstilo()) {
      const css = readFileSync(folha, 'utf8');
      expect(css).toMatch(/@import\s+['"]\.\.\/estilos\/global\.css['"]/);
      const usados = [...css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1] ?? '');
      expect(usados.length).toBeGreaterThan(0);
      for (const nome of usados) {
        expect(TOKENS, `${nome} não está em tokens.css`).toMatch(new RegExp(`${nome}\\s*:`));
      }
      expect(css, 'cor literal no CSS da página offline').not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    }
  });

  it('FUN-35: tem lang="pt-BR", título e uma landmark main com h1', () => {
    const doc = documento();
    expect(doc.documentElement.getAttribute('lang')).toBe('pt-BR');
    expect(doc.title.trim().length).toBeGreaterThan(0);
    const main = doc.querySelectorAll('main');
    expect(main).toHaveLength(1);
    expect(main[0]?.querySelector('h1')?.textContent?.trim()).toBe('Sem conexão');
  });

  it('FUN-35: usa a casca de t03-indisponivel--erro (barra com o nome do app e tela-mensagem)', () => {
    const doc = documento();
    expect(doc.querySelector('header.barra .barra__titulo')?.textContent).toBe('Gestão da Pelada');
    expect(doc.querySelector('main.tela-mensagem .vazio__titulo')).not.toBeNull();
    expect(doc.querySelector('main.tela-mensagem .vazio__texto')?.textContent?.trim().length).toBeGreaterThan(0);
  });
});
