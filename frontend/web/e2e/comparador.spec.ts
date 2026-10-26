import { expect, test, type Browser } from '@playwright/test';
// @ts-expect-error módulo .mjs sem tipos
import { diferenca } from './ferramentas/comparar-visual-captura.mjs';

interface Resultado {
  porcentagem: number;
  tamanhoMockup: string;
  tamanhoApp: string;
}

const LIMITE = 1;

async function imprimir(browser: Browser, html: string, altura = 300): Promise<Buffer> {
  const pagina = await browser.newPage({ viewport: { width: 390, height: altura } });
  await pagina.setContent(html);
  const png = await pagina.screenshot();
  await pagina.close();
  return png;
}

const tela = (cor: string) =>
  `<body style="margin:0"><div style="height:300px;background:#fff"><div style="width:200px;height:120px;background:${cor}"></div></div></body>`;

// FUN-37: o comparador tem que reprovar uma divergência de verdade (e aprovar páginas iguais).
test.describe('comparador visual', () => {
  test('páginas iguais ficam dentro do limite de 1%', async ({ browser }) => {
    const a = await imprimir(browser, tela('#1b7f3b'));
    const b = await imprimir(browser, tela('#1b7f3b'));
    const r = (await diferenca(browser, a, b, 0.1)) as Resultado;
    expect(r.porcentagem).toBeLessThanOrEqual(LIMITE);
    expect(r.tamanhoMockup).toBe(r.tamanhoApp);
  });

  test('uma divergência injetada passa do limite e a comparação falha', async ({ browser }) => {
    const a = await imprimir(browser, tela('#1b7f3b'));
    const b = await imprimir(browser, tela('#c0392b'));
    const r = (await diferenca(browser, a, b, 0.1)) as Resultado;
    expect(r.porcentagem).toBeGreaterThan(LIMITE);
  });

  test('página de altura diferente também é divergência', async ({ browser }) => {
    const a = await imprimir(browser, tela('#1b7f3b'));
    const maior = await imprimir(browser, tela('#1b7f3b'), 500);
    const r = (await diferenca(browser, a, maior, 0.1)) as Resultado;
    expect(r.tamanhoMockup).not.toBe(r.tamanhoApp);
  });
});
