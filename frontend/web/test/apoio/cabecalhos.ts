/**
 * Valores esperados dos cabeçalhos de segurança dos assets (FUN-29), usados pelo teste do
 * `public/_headers` e pelo e2e (`e2e/cabecalhos.spec.ts`). São a spec escrita em código: o
 * arquivo e o servidor é que precisam bater com eles.
 */

export const CSP_ESPERADA =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; " +
  "connect-src 'self' https://*.ingest.sentry.io; manifest-src 'self'; worker-src 'self'; object-src 'none'; " +
  "base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

export const CABECALHOS_DOS_ASSETS: Readonly<Record<string, string>> = {
  'content-security-policy': CSP_ESPERADA,
  'x-content-type-options': 'nosniff',
  // same-origin, e não no-referrer: com no-referrer o Chromium manda `Origin: null` (CLAUDE.md).
  'referrer-policy': 'same-origin',
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};

/** Diretivas da CSP como mapa (nome em minúsculas → fontes). */
export function diretivasCsp(csp: string): Map<string, string[]> {
  const mapa = new Map<string, string[]>();
  for (const parte of csp.split(';')) {
    const [nome, ...fontes] = parte.trim().split(/\s+/);
    if (nome) mapa.set(nome.toLowerCase(), fontes);
  }
  return mapa;
}

/** Fontes que valem para script: `script-src` ou, sem ela, `default-src`. */
export function fontesDeScript(csp: string): string[] {
  const d = diretivasCsp(csp);
  return d.get('script-src') ?? d.get('default-src') ?? [];
}
