import { describe, expect, it } from 'vitest';
import {
  assinaturaCorpo,
  assinaturaCriada,
  cpfValido,
  erroPagamentoIndisponivel,
  erroPlanoPro,
  erroSomenteLeitura,
  MENSAGEM_CPF,
  MENSAGEM_PAGAMENTO_INDISPONIVEL,
  planoResposta,
} from '../src/plano.ts';

/** Contrato do plano e da assinatura (T6; PLA-08, PLA-35, AD-091). */

const CPF_VALIDO = '52998224725';

function mensagensDo(campo: string, r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return (r.error?.issues ?? []).filter((i) => String(i.path[0]) === campo).map((i) => i.message);
}

describe('assinaturaCorpo', () => {
  it('PLA-35: CPF válido sem máscara passa com os 11 dígitos', () => {
    expect(assinaturaCorpo.parse({ nome: 'Maria Silva', cpf: CPF_VALIDO })).toEqual({
      nome: 'Maria Silva',
      cpf: CPF_VALIDO,
    });
  });

  it('PLA-35: CPF com máscara é normalizado para só dígitos', () => {
    expect(assinaturaCorpo.parse({ nome: 'Maria Silva', cpf: '529.982.247-25' }).cpf).toBe(CPF_VALIDO);
  });

  it.each([
    ['dígito verificador errado', '52998224724'],
    ['primeiro dígito verificador errado', '52998224735'],
    ['todos iguais', '111.111.111-11'],
    ['todos zero', '00000000000'],
    ['10 dígitos', '5299822472'],
    ['12 dígitos', '529982247250'],
    ['letras', '529.982.247-2a'],
    ['vazio', ''],
  ])('PLA-35: CPF com %s é recusado no campo cpf', (_caso, valor) => {
    const r = assinaturaCorpo.safeParse({ nome: 'Maria Silva', cpf: valor });
    expect(r.success).toBe(false);
    expect(mensagensDo('cpf', r)).toEqual([MENSAGEM_CPF]);
  });

  it('PLA-35: CPF que não é texto é recusado no campo cpf', () => {
    const r = assinaturaCorpo.safeParse({ nome: 'Maria Silva', cpf: 52998224725 });
    expect(mensagensDo('cpf', r)).toEqual([MENSAGEM_CPF]);
  });

  it('PLA-35: cpfValido confere os dois dígitos', () => {
    expect(cpfValido(CPF_VALIDO)).toBe(true);
    expect(cpfValido('52998224726')).toBe(false);
    expect(cpfValido('99999999999')).toBe(false);
  });

  it('nome de 2 caracteres ou de 101 é recusado; de 3 e de 100 passa', () => {
    expect(assinaturaCorpo.safeParse({ nome: 'Ab', cpf: CPF_VALIDO }).success).toBe(false);
    expect(assinaturaCorpo.safeParse({ nome: 'a'.repeat(101), cpf: CPF_VALIDO }).success).toBe(false);
    expect(assinaturaCorpo.safeParse({ nome: 'Ana', cpf: CPF_VALIDO }).success).toBe(true);
    expect(assinaturaCorpo.safeParse({ nome: 'a'.repeat(100), cpf: CPF_VALIDO }).success).toBe(true);
  });

  it('PLA-34: campo de cartão no corpo é recusado (strictObject)', () => {
    expect(assinaturaCorpo.safeParse({ nome: 'Maria Silva', cpf: CPF_VALIDO, creditCard: { number: '4111' } }).success).toBe(
      false,
    );
  });
});

describe('planoResposta', () => {
  const BASE = {
    trialFimEm: null,
    pagoAte: null,
    jogadoresAtivos: 12,
    limiteJogadores: null,
    somenteLeitura: null,
    recursos: ['partidas', 'ranking', 'simulador', 'financeiro', 'pdf', 'push'],
    podeAssinar: true,
    assinatura: null,
  };

  it('PLA-08: aceita o exemplo de cada plano', () => {
    const exemplos = [
      { ...BASE, plano: 'cortesia', situacao: 'uso_proprio', podeAssinar: false },
      { ...BASE, plano: 'trial', situacao: 'trial', trialFimEm: '2026-11-15' },
      {
        ...BASE,
        plano: 'pro',
        situacao: 'ativo',
        pagoAte: '2026-12-04',
        assinatura: { situacao: 'ativa', faturaUrl: null },
      },
      {
        ...BASE,
        plano: 'free',
        situacao: 'inadimplente',
        jogadoresAtivos: 21,
        limiteJogadores: 20,
        somenteLeitura: { motivo: 'limite_jogadores' },
        recursos: ['partidas', 'ranking'],
        assinatura: { situacao: 'ativa', faturaUrl: 'https://sandbox.asaas.com/i/abc' },
      },
    ];
    for (const exemplo of exemplos) expect(planoResposta.safeParse(exemplo).success).toBe(true);
  });

  it('PLA-08: recusa campo extra', () => {
    expect(planoResposta.safeParse({ ...BASE, plano: 'trial', situacao: 'trial', cpf: CPF_VALIDO }).success).toBe(false);
  });

  it('PLA-08: limiteJogadores só 20 ou nulo; plano fora da lista é recusado', () => {
    expect(planoResposta.safeParse({ ...BASE, plano: 'free', situacao: 'cancelado', limiteJogadores: 25 }).success).toBe(
      false,
    );
    expect(planoResposta.safeParse({ ...BASE, plano: 'premium', situacao: 'ativo' }).success).toBe(false);
  });
});

describe('erros do plano (AD-091)', () => {
  it('403 plano_pro tem o recurso', () => {
    expect(erroPlanoPro.safeParse({ erro: 'plano_pro', recurso: 'simulador' }).success).toBe(true);
    expect(erroPlanoPro.safeParse({ erro: 'plano_pro', recurso: 'ranking' }).success).toBe(false);
  });

  it('403 somente_leitura tem o motivo', () => {
    expect(erroSomenteLeitura.safeParse({ erro: 'somente_leitura', motivo: 'limite_grupos' }).success).toBe(true);
    expect(erroSomenteLeitura.safeParse({ erro: 'somente_leitura' }).success).toBe(false);
  });

  it('502 pagamento_indisponivel tem a mensagem da spec (PLA-36)', () => {
    expect(MENSAGEM_PAGAMENTO_INDISPONIVEL).toBe(
      'Não foi possível falar com o sistema de pagamento. Tente de novo em instantes.',
    );
    expect(
      erroPagamentoIndisponivel.safeParse({ erro: 'pagamento_indisponivel', mensagem: MENSAGEM_PAGAMENTO_INDISPONIVEL })
        .success,
    ).toBe(true);
  });

  it('201 da assinatura tem só a fatura', () => {
    expect(assinaturaCriada.safeParse({ faturaUrl: 'https://sandbox.asaas.com/i/abc' }).success).toBe(true);
    expect(assinaturaCriada.safeParse({ faturaUrl: 'x', id: 'sub_1' }).success).toBe(false);
  });
});
