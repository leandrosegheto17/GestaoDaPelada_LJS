import { describe, expect, it } from 'vitest';
import {
  editarJogadorCorpo,
  ehDataDoCalendario,
  jogadorCorpo,
  jogadorItem,
  MENSAGEM_APELIDO,
  MENSAGEM_DATA_ANTES_DO_PISO,
  MENSAGEM_DATA_FUTURA,
  MENSAGEM_DATA_INVALIDA,
  MENSAGEM_PONTUACAO,
  MENSAGEM_POSICAO,
  MENSAGEM_TELEFONE,
  POSICOES,
} from '../src/elenco.ts';
import { MENSAGEM_TEXTO_INVISIVEL } from '../src/grupo.ts';

/** Contrato do jogador (T17; GEL-33 a GEL-43, SEC-002, SEC-005). */

const HOJE = '2026-11-05';
const AMANHA = '2026-11-06';
const VALIDO = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia' };

const cadastro = jogadorCorpo(HOJE);
const edicao = editarJogadorCorpo(HOJE);

function mensagens(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = String(problema.path[0] ?? '');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

describe('apelido', () => {
  it('GEL-34: 1 caractere é recusado com a mensagem', () => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, apelido: ' A ' }))).toEqual({ apelido: [MENSAGEM_APELIDO] });
    expect(MENSAGEM_APELIDO).toBe('O apelido precisa ter de 2 a 30 caracteres.');
  });

  it('GEL-34: 31 caracteres são recusados com a mensagem', () => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, apelido: 'a'.repeat(31) }))).toEqual({ apelido: [MENSAGEM_APELIDO] });
  });

  it('GEL-34: 2 e 30 caracteres são aceitos, sem os espaços das pontas', () => {
    expect(cadastro.parse({ ...VALIDO, apelido: '  Zé  ' }).apelido).toBe('Zé');
    expect(cadastro.parse({ ...VALIDO, apelido: 'a'.repeat(30) }).apelido).toBe('a'.repeat(30));
  });

  it('SEC-005: U+200B no apelido é recusado', () => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, apelido: 'Beto​' }))).toEqual({
      apelido: [MENSAGEM_TEXTO_INVISIVEL],
    });
    expect(edicao.safeParse({ ...VALIDO, apelido: 'Ze\u0000ca' }).success).toBe(false);
  });
});

describe('anoNascimento', () => {
  const MENSAGEM = 'O ano precisa estar entre 1940 e 2016.';

  it.each([1939, 2017, 1990.5])('GEL-36: %s é recusado com "entre 1940 e 2016" em 2026', (ano) => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, anoNascimento: ano }))).toEqual({ anoNascimento: [MENSAGEM] });
  });

  it('GEL-36: ano ausente ou como texto dá a mesma mensagem', () => {
    const { anoNascimento: _a, ...semAno } = VALIDO;
    expect(mensagens(cadastro.safeParse(semAno))).toEqual({ anoNascimento: [MENSAGEM] });
    expect(mensagens(cadastro.safeParse({ ...VALIDO, anoNascimento: '1990' }))).toEqual({ anoNascimento: [MENSAGEM] });
  });

  it.each([1940, 2016])('GEL-36: %s é aceito em 2026', (ano) => {
    expect(cadastro.safeParse({ ...VALIDO, anoNascimento: ano }).success).toBe(true);
  });

  it('GEL-36: o máximo acompanha o ano de hoje', () => {
    expect(jogadorCorpo('2030-01-01').safeParse({ ...VALIDO, anoNascimento: 2020 }).success).toBe(true);
    expect(mensagens(editarJogadorCorpo('2030-01-01').safeParse({ ...VALIDO, anoNascimento: 2021 }))).toEqual({
      anoNascimento: ['O ano precisa estar entre 1940 e 2020.'],
    });
  });
});

describe('posicao', () => {
  it('GEL-37: "defensor" é recusado no campo posicao', () => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, posicao: 'defensor' }))).toEqual({ posicao: [MENSAGEM_POSICAO] });
  });

  it('GEL-37: as 7 posições são aceitas', () => {
    expect(POSICOES).toEqual(['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante']);
    for (const posicao of POSICOES) expect(cadastro.safeParse({ ...VALIDO, posicao }).success).toBe(true);
  });
});

describe('telefone', () => {
  it.each([
    ['ausente', undefined],
    ['vazio', ''],
    ['só espaços', '   '],
    ['nulo', null],
  ])('GEL-38: telefone %s vira sem telefone', (_nome, telefone) => {
    expect(cadastro.parse({ ...VALIDO, telefone }).telefone).toBeNull();
  });

  it('GEL-39: "(11) 91234-5678" é gravado só com os 11 dígitos', () => {
    expect(cadastro.parse({ ...VALIDO, telefone: '(11) 91234-5678' }).telefone).toBe('11912345678');
    expect(edicao.parse({ ...VALIDO, telefone: '11912345678' }).telefone).toBe('11912345678');
  });

  it.each([
    ['DDD 01', '(01) 91234-5678'],
    ['DDD com zero no fim', '(10) 91234-5678'],
    ['sem o 9', '(11) 81234-5678'],
    ['10 dígitos', '(11) 1234-5678'],
    ['12 dígitos', '(11) 912345-6789'],
    ['letra', '(11) 9123A-5678'],
    ['número em vez de texto', 11912345678],
  ])('GEL-39: %s é recusado com a mensagem', (_nome, telefone) => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, telefone }))).toEqual({ telefone: [MENSAGEM_TELEFONE] });
    expect(MENSAGEM_TELEFONE).toBe('Informe o telefone como (DD) 9XXXX-XXXX.');
  });
});

describe('pontuacaoInicial', () => {
  it.each([-1, 10000, 1.5, '10'])('GEL-40: %j é recusado com a mensagem', (pontuacaoInicial) => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, pontuacaoInicial }))).toEqual({
      pontuacaoInicial: [MENSAGEM_PONTUACAO],
    });
    expect(mensagens(edicao.safeParse({ ...VALIDO, pontuacaoInicial }))).toEqual({
      pontuacaoInicial: [MENSAGEM_PONTUACAO],
    });
    expect(MENSAGEM_PONTUACAO).toBe('Informe um número inteiro de 0 a 9999.');
  });

  it.each([0, 9999])('GEL-40: %s é aceito', (pontuacaoInicial) => {
    expect(cadastro.parse({ ...VALIDO, pontuacaoInicial }).pontuacaoInicial).toBe(pontuacaoInicial);
  });

  it('GEL-40: ausente no cadastro vale 0', () => {
    expect(cadastro.parse(VALIDO).pontuacaoInicial).toBe(0);
  });

  it('GEL-43: ausente na edição continua ausente (o repositório mantém o valor)', () => {
    const corpo = edicao.parse(VALIDO);
    expect(corpo.pontuacaoInicial).toBeUndefined();
    expect('pontuacaoInicial' in corpo).toBe(false);
  });
});

describe('dataEntrada', () => {
  it('GEL-33: amanhã é recusado com "A data não pode ser no futuro."', () => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, dataEntrada: AMANHA }))).toEqual({
      dataEntrada: [MENSAGEM_DATA_FUTURA],
    });
    expect(MENSAGEM_DATA_FUTURA).toBe('A data não pode ser no futuro.');
  });

  it('GEL-33: hoje é aceito', () => {
    expect(cadastro.parse({ ...VALIDO, dataEntrada: HOJE }).dataEntrada).toBe(HOJE);
  });

  it('GEL-32: ausente continua ausente (a rota usa hoje)', () => {
    expect(cadastro.parse(VALIDO).dataEntrada).toBeUndefined();
  });

  it.each(['0000-01-01', '0001-01-01', '1999-12-31'])('SEC-002: %s é recusada com a mensagem do piso', (data) => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, dataEntrada: data }))).toEqual({
      dataEntrada: [MENSAGEM_DATA_ANTES_DO_PISO],
    });
    expect(MENSAGEM_DATA_ANTES_DO_PISO).toBe('A data de início não pode ser anterior a 01/01/2000.');
  });

  it('SEC-002: 2000-01-01 é aceita', () => {
    expect(cadastro.parse({ ...VALIDO, dataEntrada: '2000-01-01' }).dataEntrada).toBe('2000-01-01');
  });

  it.each(['2026-02-30', '2026-13-01', '05/11/2026', '2026-1-5', ''])('GEL-33: %j dá "Informe uma data válida."', (data) => {
    expect(mensagens(cadastro.safeParse({ ...VALIDO, dataEntrada: data }))).toEqual({
      dataEntrada: [MENSAGEM_DATA_INVALIDA],
    });
  });

  it('GEL-41: a edição recusa dataEntrada (só muda pela rota de início)', () => {
    expect(edicao.safeParse({ ...VALIDO, dataEntrada: HOJE }).success).toBe(false);
  });

  it('ehDataDoCalendario: 29/02 só em ano bissexto', () => {
    expect(ehDataDoCalendario('2024-02-29')).toBe(true);
    expect(ehDataDoCalendario('2025-02-29')).toBe(false);
    expect(ehDataDoCalendario('2000-02-29')).toBe(true);
    expect(ehDataDoCalendario('1900-02-29')).toBe(false);
  });
});

describe('corpos .strict() e respostas', () => {
  it('GEL-41: campo a mais é recusado no cadastro e na edição', () => {
    expect(cadastro.safeParse({ ...VALIDO, grupoId: 'outro' }).success).toBe(false);
    expect(edicao.safeParse({ ...VALIDO, inicioPontuacao: '2001-01-01' }).success).toBe(false);
  });

  it('GEL-46: item da lista com situação, desde, nível e semNota', () => {
    const item = { id: 'j1', apelido: 'Toninho', posicao: 'meia', situacao: 'ativo', desde: HOJE, nivel: 550, semNota: true };
    expect(jogadorItem.parse(item)).toEqual(item);
    expect(jogadorItem.safeParse({ ...item, situacao: 'suspenso' }).success).toBe(false);
  });
});
