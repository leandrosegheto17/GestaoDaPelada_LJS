// Critério: SEC-005 (T77). Nome do grupo, apelido e nome da habilidade recusam NUL, caracteres de controle e de
// formatação invisíveis (U+200B, U+202E, U+FEFF...) com mensagem em português, e são normalizados em NFC antes do
// tamanho e da unicidade.
import { describe, expect, it } from 'vitest';
import { editarJogadorCorpo, jogadorCorpo } from '../src/elenco.ts';
import { criarGrupoCorpo, editarGrupoCorpo } from '../src/grupo.ts';
import { habilidadeCorpo } from '../src/habilidades.ts';
import { MENSAGEM_TEXTO_INVISIVEL } from '../src/texto.ts';
import { camposDe } from './apoio.ts';

const GRUPO = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' };
const JOGADOR = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia' };
const HOJE = '2026-10-30';

interface Schema {
  safeParse(v: unknown): {
    success: boolean;
    data?: unknown;
    error?: { issues: readonly { path: readonly PropertyKey[]; message: string }[] };
  };
}

/** Cada campo de texto livre, com um corpo válido e como trocar o valor do campo. */
const CAMPOS: [string, Schema, string, (v: string) => object][] = [
  ['nome do grupo (criar)', criarGrupoCorpo, 'nome', (v) => ({ ...GRUPO, nome: v })],
  ['nome do grupo (editar)', editarGrupoCorpo, 'nome', (v) => ({ ...GRUPO, nome: v })],
  ['apelido (criar)', jogadorCorpo(HOJE), 'apelido', (v) => ({ ...JOGADOR, apelido: v })],
  ['apelido (editar)', editarJogadorCorpo(HOJE), 'apelido', (v) => ({ ...JOGADOR, apelido: v })],
  ['habilidade', habilidadeCorpo, 'nome', (v) => ({ nome: v })],
];

const valorDe = (schema: Schema, campo: string, corpo: object): unknown =>
  (schema.safeParse(corpo).data as Record<string, unknown> | undefined)?.[campo];

describe.each(CAMPOS)('%s (SEC-005)', (_nome, schema, campo, corpo) => {
  it.each([
    ['NUL', 'Ze\u0000ca'],
    ['controle (U+0007)', 'Ze\u0007ca'],
    ['quebra de linha no meio', 'Ze\nca'],
    ['tab no meio', 'Ze\tca'],
    ['DEL (U+007F)', 'Ze\u007Fca'],
    ['controle C1 (U+0085)', 'Ze\u0085ca'],
    ['espaço de largura zero (U+200B)', 'Beto\u200B'],
    ['espaço de largura zero no meio', 'Be\u200Bto'],
    ['inversão de direção (U+202E)', '\u202EBeto'],
    ['marca da esquerda para a direita (U+200E)', 'Beto\u200E'],
    ['isolamento de direção (U+2066)', 'Beto\u2066'],
    ['BOM no meio (U+FEFF)', 'Be\uFEFFto'],
    ['hífen suave (U+00AD)', 'Be\u00ADto'],
    ['só invisíveis', '\u200B\u200B\u200B'],
  ])('%s → recusado com a mensagem no campo', (_caso, valor) => {
    expect(camposDe(schema, corpo(valor))).toEqual({ [campo]: MENSAGEM_TEXTO_INVISIVEL });
  });

  it('texto acentuado normal continua aceito', () => {
    expect(valorDe(schema, campo, corpo('Zé Côrtes da Ação'))).toBe('Zé Côrtes da Ação');
  });

  it('acento decomposto (NFD) é guardado em NFC', () => {
    const nfd = 'José Conceição';
    const guardado = valorDe(schema, campo, corpo(nfd));
    expect(guardado).toBe('José Conceição');
    expect(guardado).toBe((guardado as string).normalize('NFC'));
  });

  it('o tamanho conta depois da NFC: 30 letras acentuadas decompostas passam', () => {
    // 30 "é" em NFD têm 60 unidades; em NFC, 30 (cabe em todos os campos, cujo máximo é 30 ou 60).
    const nfd = 'é'.repeat(30);
    expect(valorDe(schema, campo, corpo(nfd))).toBe('é'.repeat(30));
  });

  it('espaços das pontas continuam saindo (inclusive quebra de linha nas pontas)', () => {
    expect(valorDe(schema, campo, corpo('  Racha\n'))).toBe('Racha');
  });
});

describe('mensagem (SEC-005)', () => {
  it('é em português', () => {
    expect(MENSAGEM_TEXTO_INVISIVEL).toBe('Use só caracteres visíveis, sem caracteres de controle ou invisíveis.');
  });
});
