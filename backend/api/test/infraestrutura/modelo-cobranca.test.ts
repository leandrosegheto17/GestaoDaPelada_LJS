import { describe, expect, it } from 'vitest';
import {
  caminhoMeuPlano,
  dataBrasileira,
  emailCobranca,
  TITULO_DO_AVISO,
  type DadosEmailCobranca,
} from '../../src/infraestrutura/email/modelo-cobranca.ts';

/** E-mail de aviso de cobrança (notificacoes T23; NOT-40). */

const URL = 'https://app.exemplo.test';
const GRUPO = '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21';
const MEU_PLANO = `${URL}/app/grupos/${GRUPO}/plano`;

const BASE: DadosEmailCobranca = {
  urlPublica: URL,
  tipo: 'cobranca_gerada',
  grupoId: GRUPO,
  grupoNome: 'Pelada de Quinta',
  valorCentavos: 990,
  vencimento: '2026-11-10',
};

/** Os links (href) do HTML e as URLs do texto. */
function links(conteudo: { texto: string; html: string }): string[] {
  const doHtml = [...conteudo.html.matchAll(/href="([^"]+)"/g)].map((m) =>
    (m[1] ?? '').replace(/&amp;/g, '&'),
  );
  const doTexto = [...conteudo.texto.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
  return [...doHtml, ...doTexto];
}

describe('emailCobranca', () => {
  it.each([
    ['cobranca_gerada', 'Cobrança gerada'],
    ['pagamento_confirmado', 'Pagamento confirmado'],
    ['pagamento_atrasado', 'Pagamento em atraso'],
  ] as const)(
    'NOT-40: %s tem o tipo em texto claro, o valor, o vencimento e só o link de Meu plano',
    (tipo, titulo) => {
      const c = emailCobranca({ ...BASE, tipo });
      expect(TITULO_DO_AVISO[tipo]).toBe(titulo);
      expect(c.assunto).toBe(`${titulo}: Pelada de Quinta`);
      for (const parte of [c.texto, c.html]) {
        expect(parte).toContain(titulo);
        expect(parte).toContain('Pelada de Quinta');
        expect(parte).toContain('R$ 9,90');
        expect(parte).toContain('10/11/2026');
      }
      expect(links(c)).toEqual([MEU_PLANO, MEU_PLANO]);
      expect(`${c.texto}${c.html}`.toLowerCase()).not.toContain('asaas');
    },
  );

  it.each([
    [1, 'R$ 0,01'],
    [990, 'R$ 9,90'],
    [100000, 'R$ 1.000,00'],
  ])('NOT-40: %i centavos viram %s', (centavos, reais) => {
    const c = emailCobranca({ ...BASE, valorCentavos: centavos });
    expect(c.texto).toContain(`Valor: ${reais}`);
    expect(c.html).toContain(`Valor: ${reais}`);
  });

  it.each([
    ['2026-01-31', '31/01/2026'],
    ['2027-01-01', '01/01/2027'],
    ['2026-12-31', '31/12/2026'],
  ])('NOT-40: vencimento %s vira %s, sem deslocar pelo fuso', (vencimento, esperado) => {
    expect(dataBrasileira(vencimento)).toBe(esperado);
    expect(emailCobranca({ ...BASE, vencimento }).texto).toContain(`Vencimento: ${esperado}`);
  });

  it('NOT-40: o nome do grupo sai escapado no HTML', () => {
    const c = emailCobranca({ ...BASE, grupoNome: 'Pelada & <script>alert(1)</script>' });
    expect(c.html).not.toContain('<script');
    expect(c.html).toContain('&amp;');
    expect(c.html).toContain('&lt;script&gt;');
    // Um único link, mesmo com HTML no nome.
    expect(links(c)).toEqual([MEU_PLANO, MEU_PLANO]);
  });

  it('NOT-40: nome com endereço não vira link no texto (nomeDoGrupoNoEmail)', () => {
    const c = emailCobranca({ ...BASE, grupoNome: 'Pague em www.golpe.com' });
    expect(links(c)).toEqual([MEU_PLANO, MEU_PLANO]);
    expect(c.texto).not.toContain('www.golpe.com');
  });

  it('recusa vencimento fora de AAAA-MM-DD, valor fracionário e URL_PUBLICA ausente', () => {
    expect(() => emailCobranca({ ...BASE, vencimento: '10/11/2026' })).toThrow();
    expect(() => emailCobranca({ ...BASE, valorCentavos: 9.9 })).toThrow();
    expect(() => emailCobranca({ ...BASE, urlPublica: '' })).toThrow(/URL_PUBLICA/);
  });

  it('caminho de Meu plano é /app/grupos/<id>/plano', () => {
    expect(caminhoMeuPlano(GRUPO)).toBe(`/app/grupos/${GRUPO}/plano`);
  });
});
