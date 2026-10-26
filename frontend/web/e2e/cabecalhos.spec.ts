import { expect, test, type APIRequestContext } from '@playwright/test';

function diretivas(csp: string): Map<string, string> {
  return new Map(
    csp
      .split(';')
      .map((parte) => parte.trim())
      .filter(Boolean)
      .map((parte) => {
        const [nome = '', ...valores] = parte.split(/\s+/);
        return [nome, valores.join(' ')] as const;
      }),
  );
}

async function caminhoDoScript(request: APIRequestContext): Promise<string> {
  const html = await (await request.get('/')).text();
  const achado = /<script[^>]*\bsrc="([^"]+)"/.exec(html);
  if (!achado?.[1]) throw new Error('index.html sem script de módulo.');
  return achado[1];
}

// FUN-28: os quatro cabeçalhos nas respostas do domínio (build servido pelo Worker local, sem DSN do Sentry).
test.describe('cabeçalhos de segurança', () => {
  test('páginas, script, fontes, manifest e service worker trazem os quatro cabeçalhos', async ({ request }) => {
    const caminhos = [
      '/',
      '/rota-do-app',
      '/offline.html',
      '/fontes/fontes.css',
      '/manifest.webmanifest',
      '/sw.js',
      await caminhoDoScript(request),
    ];
    for (const caminho of caminhos) {
      const resposta = await request.get(caminho);
      expect(resposta.status(), caminho).toBe(200);
      const h = resposta.headers();

      const csp = h['content-security-policy'];
      expect(csp, caminho).toBeTruthy();
      const d = diretivas(csp ?? '');
      expect(d.get('default-src')).toBe("'self'");
      expect(d.get('connect-src')).toBe("'self'");
      expect(d.get('font-src')).toBe("'self'");
      expect(d.get('img-src')).toBe("'self' data:");
      expect(d.get('frame-ancestors')).toBe("'none'");
      for (const [nome, valor] of d) {
        expect(valor, `${caminho} ${nome}`).not.toMatch(/unsafe-|\*|http:/);
      }

      expect(h['x-content-type-options'], caminho).toBe('nosniff');
      expect(h['referrer-policy'], caminho).toBe('same-origin');
      expect(h['strict-transport-security'], caminho).toMatch(/^max-age=\d{7,}/);
    }
  });

  test('a página abre sem violação de CSP, com o service worker ativo', async ({ page }) => {
    const problemas: string[] = [];
    page.on('console', (m) => {
      if (/content security policy|refused to/i.test(m.text())) problemas.push(m.text());
    });
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`Refused to load: ${e.violatedDirective}`);
      });
    });
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Em breve' })).toBeVisible();
    expect(problemas).toEqual([]);
  });

  test('/_headers não é servido como conteúdo', async ({ request }) => {
    const resposta = await request.get('/_headers');
    expect(await resposta.text()).not.toContain('Content-Security-Policy:');
  });
});
