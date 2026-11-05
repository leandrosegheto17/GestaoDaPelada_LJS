import { describe, expect, it } from 'vitest';
import { emailConvite, nomeDoGrupoNoEmail } from '../../src/infraestrutura/email/modelos.ts';

/**
 * Nome do grupo seguro no e-mail de convite (grupos-e-elenco T51; SEC-006). O nome sai como texto puro, numa linha,
 * com até 60 caracteres, e URL, `www.`, domínio ou e-mail não viram link (separadores cercados de espaço), no assunto,
 * no texto e no HTML. Os testes de ACE-31 da CA (`modelos.test.ts`) continuam como estão.
 */

const URL = 'https://pelada.exemplo.test';
const TOKEN = 'a'.repeat(43);

/** Domínio ou e-mail colado (sem espaço ao redor do separador), como o cliente de e-mail transformaria em link. */
const RE_LINK = /(\bwww\.\S|\w\.(com|net|org|br)\b|\S@\S|:\/\/)/i;

/** O nome como aparece dentro do `<strong>` do HTML. */
function nomeNoHtml(html: string): string {
  return /<strong>([^<]*)<\/strong>/.exec(html)?.[1] ?? '';
}

describe('nomeDoGrupoNoEmail', () => {
  it('SEC-006: nome normal sai igual ao de antes', () => {
    for (const nome of ['Pelada de Sábado', 'Racha do Zé', 'Futebol às 20h']) {
      expect(nomeDoGrupoNoEmail(nome)).toBe(nome);
    }
  });

  it.each([
    ['www.', 'Pelada www.golpe.com', 'Pelada www . golpe . com'],
    ['URL', 'Pix em https://golpe.com/x', 'Pix em https : / / golpe . com / x'],
    ['e-mail', 'Fale com pix@golpe.com', 'Fale com pix @ golpe . com'],
    ['domínio', 'Pelada golpe.net', 'Pelada golpe . net'],
  ])('SEC-006: %s no nome tem os separadores cercados de espaço', (_caso, nome, esperado) => {
    const saida = nomeDoGrupoNoEmail(nome);
    expect(saida).toBe(esperado);
    expect(saida).not.toMatch(RE_LINK);
  });

  it.each([
    ['quebra de linha', 'Pelada\nClique aqui'],
    ['retorno de carro', 'Pelada\r\nClique aqui'],
    ['tabulação', 'Pelada\tClique aqui'],
    ['espaço de largura zero', 'Pelada​\nClique aqui'],
  ])('SEC-006: %s vira um espaço só, numa linha', (_caso, nome) => {
    expect(nomeDoGrupoNoEmail(nome)).toBe('Pelada Clique aqui');
  });

  it('SEC-006: o nome sai com até 60 caracteres, mesmo depois dos espaços dos separadores', () => {
    const longo = `${'a.'.repeat(40)}fim`;
    const saida = nomeDoGrupoNoEmail(longo);
    expect(Array.from(saida).length).toBeLessThanOrEqual(60);
    expect(saida).not.toMatch(/\n/);
  });

  it('SEC-006: 60 caracteres sem separador ficam inteiros', () => {
    const nome = 'P'.repeat(60);
    expect(nomeDoGrupoNoEmail(nome)).toBe(nome);
  });
});

describe('emailConvite com o nome do grupo', () => {
  it('SEC-006: "Pelada www.golpe.com" não gera link no assunto, no texto e no HTML', () => {
    const c = emailConvite({ urlPublica: URL, grupoNome: 'Pelada www.golpe.com', token: TOKEN });
    expect(c.assunto).not.toMatch(RE_LINK);
    expect(c.assunto).toContain('Pelada www . golpe . com');
    // No texto, o único link é o do convite, na última linha.
    const semLinkDoConvite = c.texto.replace(/https:\/\/pelada\.exemplo\.test\S*/g, '');
    expect(semLinkDoConvite).not.toMatch(RE_LINK);
    expect(c.texto).toContain('Pelada www . golpe . com');
    expect(nomeNoHtml(c.html)).toBe('Pelada www . golpe . com');
    expect(c.html.match(/<a /g)).toHaveLength(1);
  });

  it('SEC-006: "Pelada\\nClique aqui" não gera linha nova no assunto, no texto nem no HTML', () => {
    const c = emailConvite({ urlPublica: URL, grupoNome: 'Pelada\nClique aqui', token: TOKEN });
    expect(c.assunto).toBe('Convite para administrar Pelada Clique aqui');
    expect(c.texto.split('\n')[0]).toBe(
      'Você foi convidada para administrar o grupo Pelada Clique aqui no Gestão da Pelada.',
    );
    expect(nomeNoHtml(c.html)).toBe('Pelada Clique aqui');
  });

  it('SEC-006: nome normal sai igual no assunto, no texto e no HTML', () => {
    const c = emailConvite({ urlPublica: URL, grupoNome: 'Pelada de Sábado', token: TOKEN });
    expect(c.assunto).toBe('Convite para administrar Pelada de Sábado');
    expect(c.texto).toContain('o grupo Pelada de Sábado no Gestão da Pelada.');
    expect(nomeNoHtml(c.html)).toBe('Pelada de Sábado');
  });

  it('SEC-006: o nome tratado ainda é escapado no HTML', () => {
    const c = emailConvite({ urlPublica: URL, grupoNome: 'A <b>forte</b>', token: TOKEN });
    expect(c.html).not.toContain('<b>');
    expect(c.html).toContain('&lt;b&gt;forte&lt; / b&gt;');
  });
});
