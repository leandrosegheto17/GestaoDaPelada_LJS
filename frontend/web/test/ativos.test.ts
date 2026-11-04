import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const WEB = join(import.meta.dirname, '..');
const MOCKUP = join(WEB, '..', '..', '.specs', 'mockup');

const sha = (arquivo: string) => createHash('sha256').update(readFileSync(arquivo)).digest('hex');

/** Os arquivos do mockup que o front copia sem alterar (R2, R3 e R4 do reuso.md). */
const ATIVOS: { origem: string; destino: string }[] = [
  { origem: 'tokens.css', destino: 'src/estilos/tokens.css' },
  ...readdirSync(join(MOCKUP, 'fontes'))
    .filter((n) => n.endsWith('.woff2') || n === 'OFL.txt')
    .map((n) => ({ origem: `fontes/${n}`, destino: `public/fontes/${n}` })),
  ...readdirSync(join(MOCKUP, 'icones'))
    .filter((n) => n.endsWith('.png') || n === 'icone.svg')
    .map((n) => ({ origem: `icones/${n}`, destino: `public/icones/${n}` })),
];

describe('ativos copiados do mockup', () => {
  test('FUN-30: o mockup tem tokens, 14 fontes mais a licença e 5 ícones', () => {
    expect(ATIVOS).toHaveLength(1 + 15 + 5);
  });

  test.each(ATIVOS)(
    'FUN-30: $destino tem o SHA-256 de .specs/mockup/$origem',
    ({ origem, destino }) => {
      expect(sha(join(WEB, destino))).toBe(sha(join(MOCKUP, origem)));
    },
  );
});
