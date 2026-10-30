// Critérios: GEL-33 (data de entrada futura), GEL-34 (apelido), GEL-36 (ano de nascimento), GEL-37 (posição), GEL-38
// (telefone vazio ou nulo), GEL-39 (formato do telefone), GEL-40 (pontuação inicial), GEL-41 (edição com as mesmas
// regras, sem data de entrada) e GEL-43 (pontuação omitida na edição mantém o valor).
import { describe, expect, it } from 'vitest';
import {
  editarJogadorCorpo,
  jogadorCorpo,
  jogadorDetalhe,
  jogadorItem,
  listaJogadores,
  POSICOES,
} from '../src/elenco.ts';
import { camposDe, sem } from './apoio.ts';

const HOJE = '2026-10-29';
const cadastro = jogadorCorpo(HOJE);
const edicao = editarJogadorCorpo(HOJE);
const valido = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia' };

const MSG_APELIDO = 'O apelido precisa ter de 2 a 30 caracteres.';
const MSG_ANO = 'O ano precisa estar entre 1940 e 2016.';
const MSG_TELEFONE = 'Informe o telefone como (DD) 9XXXX-XXXX.';
const MSG_PONTUACAO = 'Informe um número inteiro de 0 a 9999.';

describe.each([
  ['jogadorCorpo', cadastro],
  ['editarJogadorCorpo (GEL-41)', edicao],
])('%s: regras comuns', (_nome, schema) => {
  it('aceita o mínimo válido', () => {
    expect(schema.safeParse(valido).success).toBe(true);
  });

  it('apelido de 1 e 31 caracteres é recusado (GEL-34)', () => {
    expect(camposDe(schema, { ...valido, apelido: 'A' })).toEqual({ apelido: MSG_APELIDO });
    expect(camposDe(schema, { ...valido, apelido: 'a'.repeat(31) })).toEqual({ apelido: MSG_APELIDO });
    expect(camposDe(schema, { ...valido, apelido: '  A  ' })).toEqual({ apelido: MSG_APELIDO });
    expect(camposDe(schema, sem(valido, 'apelido'))).toEqual({ apelido: MSG_APELIDO });
  });

  it('apelido de 2 e 30 caracteres passa, sem os espaços das pontas', () => {
    expect(schema.parse({ ...valido, apelido: ' Zé ' }).apelido).toBe('Zé');
    expect(schema.safeParse({ ...valido, apelido: 'a'.repeat(30) }).success).toBe(true);
  });

  it('ano 1939 e ano de hoje − 9 são recusados; 1940 e hoje − 10 passam (GEL-36)', () => {
    expect(camposDe(schema, { ...valido, anoNascimento: 1939 })).toEqual({ anoNascimento: MSG_ANO });
    expect(camposDe(schema, { ...valido, anoNascimento: 2017 })).toEqual({ anoNascimento: MSG_ANO });
    expect(schema.safeParse({ ...valido, anoNascimento: 1940 }).success).toBe(true);
    expect(schema.safeParse({ ...valido, anoNascimento: 2016 }).success).toBe(true);
  });

  it('ano ausente, não inteiro ou texto cai na mesma mensagem (GEL-36)', () => {
    expect(camposDe(schema, sem(valido, 'anoNascimento'))).toEqual({ anoNascimento: MSG_ANO });
    expect(camposDe(schema, { ...valido, anoNascimento: 1990.5 })).toEqual({ anoNascimento: MSG_ANO });
    expect(camposDe(schema, { ...valido, anoNascimento: '1990' })).toEqual({ anoNascimento: MSG_ANO });
    expect(camposDe(schema, { ...valido, anoNascimento: null })).toEqual({ anoNascimento: MSG_ANO });
  });

  it('as 7 posições passam; outra é recusada no campo posicao (GEL-37)', () => {
    expect(POSICOES).toEqual(['goleiro', 'zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante']);
    for (const posicao of POSICOES) expect(schema.safeParse({ ...valido, posicao }).success).toBe(true);
    for (const posicao of ['ponta', 'Meia', '', undefined]) {
      expect(Object.keys(camposDe(schema, { ...valido, posicao }))).toEqual(['posicao']);
    }
  });

  it('telefone com máscara ou só dígitos vira 11 dígitos (GEL-39)', () => {
    expect(schema.parse({ ...valido, telefone: '(11) 98765-4321' }).telefone).toBe('11987654321');
    expect(schema.parse({ ...valido, telefone: '11987654321' }).telefone).toBe('11987654321');
    expect(schema.parse({ ...valido, telefone: ' (21)99876-5432 ' }).telefone).toBe('21998765432');
  });

  it('telefone vazio, só espaços, nulo ou ausente fica sem telefone (GEL-38)', () => {
    for (const telefone of ['', '   ', null]) {
      expect(schema.parse({ ...valido, telefone }).telefone).toBeNull();
    }
    expect(schema.parse(valido).telefone).toBeNull();
  });

  it.each([
    ['10 dígitos', '1198765432'],
    ['12 dígitos', '119876543210'],
    ['DDD com zero', '(01) 98765-4321'],
    ['DDD terminado em zero', '(10) 98765-4321'],
    ['sem o 9', '(11) 88765-4321'],
    ['letras', '(11) 9876A-4321'],
    ['outro símbolo', '+55 11 98765-4321'],
    ['número', 11987654321],
  ])('telefone com %s é recusado (GEL-39)', (_caso, telefone) => {
    expect(camposDe(schema, { ...valido, telefone })).toEqual({ telefone: MSG_TELEFONE });
  });

  it('pontuação -1, 10000, 1,5 e texto são recusadas; 0 e 9999 passam (GEL-40)', () => {
    for (const pontuacaoInicial of [-1, 10000, 1.5, '10', null]) {
      expect(camposDe(schema, { ...valido, pontuacaoInicial })).toEqual({ pontuacaoInicial: MSG_PONTUACAO });
    }
    expect(schema.parse({ ...valido, pontuacaoInicial: 0 }).pontuacaoInicial).toBe(0);
    expect(schema.parse({ ...valido, pontuacaoInicial: 9999 }).pontuacaoInicial).toBe(9999);
  });

  it('campo desconhecido é recusado', () => {
    expect(schema.safeParse({ ...valido, grupoId: 'g2' }).success).toBe(false);
    expect(schema.safeParse({ ...valido, inicioPontuacao: '2026-01-01' }).success).toBe(false);
  });
});

describe('jogadorCorpo: cadastro', () => {
  it('pontuação omitida vale 0 (GEL-40)', () => {
    expect(cadastro.parse(valido).pontuacaoInicial).toBe(0);
  });

  it('data de entrada é opcional; hoje e passado passam', () => {
    expect(cadastro.parse(valido).dataEntrada).toBeUndefined();
    expect(cadastro.parse({ ...valido, dataEntrada: HOJE }).dataEntrada).toBe(HOJE);
    expect(cadastro.parse({ ...valido, dataEntrada: '2026-02-05' }).dataEntrada).toBe('2026-02-05');
  });

  it('data de entrada futura → "A data não pode ser no futuro." (GEL-33)', () => {
    expect(camposDe(cadastro, { ...valido, dataEntrada: '2026-10-30' })).toEqual({
      dataEntrada: 'A data não pode ser no futuro.',
    });
  });

  it('data de entrada antes de 01/01/2000 → a mensagem do piso da GEL-78 (SEC-002)', () => {
    for (const dataEntrada of ['0000-01-01', '0001-01-01', '1899-12-31', '1999-12-31']) {
      expect(camposDe(cadastro, { ...valido, dataEntrada })).toEqual({
        dataEntrada: 'A data de início não pode ser anterior a 01/01/2000.',
      });
    }
  });

  it('01/01/2000, o próprio piso, passa (SEC-002, GEL-78)', () => {
    expect(cadastro.parse({ ...valido, dataEntrada: '2000-01-01' }).dataEntrada).toBe('2000-01-01');
  });

  it('data de entrada que não é data real → "Informe uma data válida."', () => {
    for (const dataEntrada of ['2026-02-30', '30/10/2026', '', null]) {
      expect(camposDe(cadastro, { ...valido, dataEntrada })).toEqual({ dataEntrada: 'Informe uma data válida.' });
    }
  });

  it('o limite do ano acompanha a virada do ano (GEL-36)', () => {
    expect(jogadorCorpo('2027-01-01').safeParse({ ...valido, anoNascimento: 2017 }).success).toBe(true);
    expect(camposDe(jogadorCorpo('2026-12-31'), { ...valido, anoNascimento: 2017 })).toEqual({
      anoNascimento: MSG_ANO,
    });
  });
});

describe('editarJogadorCorpo: edição', () => {
  it('pontuação omitida fica ausente do resultado, para manter o valor atual (GEL-43)', () => {
    const r = edicao.parse(valido);
    expect('pontuacaoInicial' in r).toBe(false);
  });

  it('data de entrada não existe na edição (strict)', () => {
    expect(edicao.safeParse({ ...valido, dataEntrada: '2026-02-05' }).success).toBe(false);
  });
});

describe('respostas', () => {
  const item = {
    id: 'j1',
    apelido: 'Toninho',
    posicao: 'meia',
    situacao: 'ativo',
    desde: '2026-02-05',
    nivel: 683,
    semNota: false,
  };

  it('jogadorItem tem id, apelido, posição, situação, desde, nível e semNota (GEL-46)', () => {
    expect(jogadorItem.parse(item)).toEqual(item);
    expect(jogadorItem.safeParse({ ...item, situacao: 'afastado' }).success).toBe(false);
    for (const campo of Object.keys(item)) expect(jogadorItem.safeParse(sem(item, campo)).success).toBe(false);
    expect(listaJogadores.parse({ jogadores: [item] })).toEqual({ jogadores: [item] });
  });

  it('jogadorDetalhe traz os dados do cadastro, os períodos e as notas', () => {
    const detalhe = {
      ...item,
      anoNascimento: 1990,
      telefone: '11987654321',
      pontuacaoInicial: 120,
      inicioPontuacao: '2026-02-05',
      periodos: [
        { id: 'p1', inicio: '2026-02-05', fim: '2026-10-05' },
        { id: 'p2', inicio: '2026-10-12', fim: null },
      ],
      notas: [
        { habilidadeId: 'h1', habilidade: 'Passe', nota: 8 },
        { habilidadeId: 'h2', habilidade: 'Chute', nota: null },
      ],
    };
    expect(jogadorDetalhe.parse(detalhe)).toEqual(detalhe);
    expect(jogadorDetalhe.safeParse({ ...detalhe, anoNascimento: null, telefone: null }).success).toBe(true);
    for (const campo of ['periodos', 'notas', 'inicioPontuacao', 'pontuacaoInicial']) {
      expect(jogadorDetalhe.safeParse(sem(detalhe, campo)).success).toBe(false);
    }
  });
});
