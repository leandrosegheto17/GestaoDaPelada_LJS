import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Ativos do mockup (FUN-30; R2, R3 e R4 do reuso.md): o front usa `tokens.css`, as fontes e os
 * ícones idênticos byte a byte aos de `.specs/mockup/`. Qualquer divergência reprova.
 */

const WEB = join(import.meta.dirname, '..');
const MOCKUP = join(WEB, '..', '..', '.specs', 'mockup');

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

interface Par {
  origem: string;
  destino: string;
}

/** Os pares origem → destino, montados a partir do que existe no mockup. */
function pares(): Par[] {
  const lista: Par[] = [
    { origem: join(MOCKUP, 'tokens.css'), destino: join(WEB, 'src', 'estilos', 'tokens.css') },
  ];
  for (const f of readdirSync(join(MOCKUP, 'fontes'))) {
    if (f.endsWith('.woff2') || f === 'OFL.txt') {
      lista.push({ origem: join(MOCKUP, 'fontes', f), destino: join(WEB, 'public', 'fontes', f) });
    }
  }
  for (const f of readdirSync(join(MOCKUP, 'icones'))) {
    if (f.endsWith('.png') || f === 'icone.svg') {
      lista.push({ origem: join(MOCKUP, 'icones', f), destino: join(WEB, 'public', 'icones', f) });
    }
  }
  return lista;
}

describe('ativos do mockup', () => {
  it('FUN-30: o mockup tem tokens, 14 fontes, a licença e os ícones', () => {
    const nomes = pares().map((p) => p.destino.replace(WEB, '').replace(/\\/g, '/'));
    expect(nomes).toContain('/src/estilos/tokens.css');
    expect(nomes.filter((n) => n.endsWith('.woff2'))).toHaveLength(14);
    expect(nomes).toContain('/public/fontes/OFL.txt');
    for (const icone of [
      'icone-192.png',
      'icone-512.png',
      'icone-512-maskable.png',
      'apple-touch-180.png',
      'icone.svg',
    ]) {
      expect(nomes).toContain(`/public/icones/${icone}`);
    }
  });

  for (const par of pares()) {
    const nome = par.destino.replace(WEB, '').replace(/\\/g, '/');
    it(`FUN-30: ${nome} tem SHA-256 igual ao do mockup`, () => {
      expect(existsSync(par.destino), `${nome} não existe no front`).toBe(true);
      expect(sha256(readFileSync(par.destino))).toBe(sha256(readFileSync(par.origem)));
    });
  }

  it('FUN-30: um byte alterado no tokens.css muda o SHA-256 (a comparação pega a divergência)', () => {
    const original = readFileSync(join(WEB, 'src', 'estilos', 'tokens.css'));
    const alterado = Buffer.from(original);
    alterado[alterado.length - 1] = (alterado[alterado.length - 1] ?? 0) ^ 0x01;
    expect(sha256(alterado)).not.toBe(sha256(original));
  });
});
