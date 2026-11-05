import { describe, expect, it } from 'vitest';
import {
  acessoFinanceiroCorpo,
  CODIGOS_ERRO_FINANCEIRO,
  lancamentoCorpo,
  lancamentoResposta,
  MENSAGEM_DESCRICAO,
  MENSAGENS_ERRO_FINANCEIRO,
  mensagemLancamentoVinculado,
  pagamentoCorpo,
} from '../src/financeiro-lancamentos.ts';

/** Contrato de pagamentos, lançamentos e acesso (T8; FIN-25, FIN-26, FIN-35, FIN-36). */

type Resultado = {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string; code?: string }[] };
};

function campos(resultado: Resultado): string[] {
  return [...new Set((resultado.error?.issues ?? []).map((p) => String(p.path[0] ?? '')))];
}

function mensagens(resultado: Resultado, campo: string): string[] {
  return (resultado.error?.issues ?? [])
    .filter((p) => String(p.path[0] ?? '') === campo)
    .map((p) => p.message);
}

const lancamentoValido = {
  tipo: 'saida',
  data: '2026-10-10',
  descricao: 'Aluguel da quadra outubro',
  valorCentavos: 80_000,
};

describe('lancamentoCorpo', () => {
  it('FIN-25: corpo válido passa', () => {
    expect(lancamentoCorpo.parse(lancamentoValido)).toEqual(lancamentoValido);
  });

  it('FIN-25: descrição com espaços nas pontas sai sem eles', () => {
    expect(
      lancamentoCorpo.parse({ ...lancamentoValido, descricao: '  Bolas novas  ' }).descricao,
    ).toBe('Bolas novas');
  });

  it('FIN-25: descrição de 1 e de 80 caracteres e valores 1 e 99.999.999 aceitos', () => {
    expect(lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: 'a' }).success).toBe(true);
    expect(
      lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: 'a'.repeat(80) }).success,
    ).toBe(true);
    expect(lancamentoCorpo.safeParse({ ...lancamentoValido, valorCentavos: 1 }).success).toBe(true);
    expect(
      lancamentoCorpo.safeParse({ ...lancamentoValido, valorCentavos: 99_999_999 }).success,
    ).toBe(true);
  });

  it('FIN-26: descrição de 81 caracteres dá a mensagem da spec', () => {
    const r = lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: 'a'.repeat(81) });
    expect(r.success).toBe(false);
    expect(mensagens(r, 'descricao')).toContain(MENSAGEM_DESCRICAO);
    expect(MENSAGEM_DESCRICAO).toBe('A descrição precisa ter de 1 a 80 caracteres.');
  });

  it('FIN-26: descrição só com espaços dá a mensagem da spec', () => {
    const r = lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: '    ' });
    expect(r.success).toBe(false);
    expect(mensagens(r, 'descricao')).toContain(MENSAGEM_DESCRICAO);
  });

  it('FIN-26: descrição com 80 caracteres mais espaços nas pontas é aceita', () => {
    expect(
      lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: ` ${'a'.repeat(80)} ` }).success,
    ).toBe(true);
  });

  it('FIN-26: descrição ausente ou não texto dá a mensagem da spec', () => {
    const { descricao: _descricao, ...semDescricao } = lancamentoValido;
    expect(mensagens(lancamentoCorpo.safeParse(semDescricao), 'descricao')).toContain(
      MENSAGEM_DESCRICAO,
    );
    expect(
      mensagens(lancamentoCorpo.safeParse({ ...lancamentoValido, descricao: 12 }), 'descricao'),
    ).toContain(MENSAGEM_DESCRICAO);
  });

  it('FIN-26: `pagamentoId` ou `mensalidade` no corpo é campo extra', () => {
    for (const extra of [
      { pagamentoId: '0b6f2a52-4a51-4e7f-9d6e-1f1f1f1f1f1f' },
      { mensalidade: true },
      { lancamentoId: 'x' },
    ]) {
      const r = lancamentoCorpo.safeParse({ ...lancamentoValido, ...extra });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((p) => p.code === 'unrecognized_keys')).toBe(true);
    }
  });

  it('FIN-26: data 2026-02-30 recusada no campo `data`', () => {
    const r = lancamentoCorpo.safeParse({ ...lancamentoValido, data: '2026-02-30' });
    expect(r.success).toBe(false);
    expect(campos(r)).toEqual(['data']);
  });

  it('FIN-26: data malformada recusada', () => {
    for (const data of ['10/10/2026', '2026-10-1', '', null]) {
      expect(campos(lancamentoCorpo.safeParse({ ...lancamentoValido, data }))).toEqual(['data']);
    }
  });

  it('FIN-26: valor 0 recusado', () => {
    expect(campos(lancamentoCorpo.safeParse({ ...lancamentoValido, valorCentavos: 0 }))).toEqual([
      'valorCentavos',
    ]);
  });

  it('FIN-26: valor não inteiro, texto, negativo ou acima do teto recusado', () => {
    for (const valorCentavos of [1.5, '800', -1, 100_000_000, Number.NaN, null]) {
      expect(campos(lancamentoCorpo.safeParse({ ...lancamentoValido, valorCentavos }))).toEqual([
        'valorCentavos',
      ]);
    }
  });

  it('FIN-26: tipo fora de entrada e saída recusado', () => {
    for (const tipo of ['mensalidade', 'ENTRADA', '', undefined]) {
      expect(campos(lancamentoCorpo.safeParse({ ...lancamentoValido, tipo }))).toEqual(['tipo']);
    }
  });
});

describe('pagamentoCorpo', () => {
  const valido = { jogadorId: '0b6f2a52-4a51-4e7f-9d6e-1f1f1f1f1f1f', mes: '2026-10' };

  it('FIN-16: corpo válido passa', () => {
    expect(pagamentoCorpo.parse(valido)).toEqual(valido);
  });

  it('FIN-23: mês malformado recusado com "Mês inválido."', () => {
    for (const mes of ['2026-13', '2026-1', '10/2026', '']) {
      const r = pagamentoCorpo.safeParse({ ...valido, mes });
      expect(campos(r)).toEqual(['mes']);
      expect(mensagens(r, 'mes')).toContain('Mês inválido.');
    }
  });

  it('FIN-16: valor no corpo do pagamento é campo extra (o valor vem da configuração)', () => {
    const r = pagamentoCorpo.safeParse({ ...valido, valorCentavos: 7_500 });
    expect(r.success).toBe(false);
  });

  it('FIN-19: jogadorId que não é uuid recusado no campo `jogadorId`', () => {
    expect(campos(pagamentoCorpo.safeParse({ ...valido, jogadorId: 'toninho' }))).toEqual([
      'jogadorId',
    ]);
  });
});

describe('acessoFinanceiroCorpo', () => {
  it('FIN-35: booleano passa; texto, ausente ou campo extra recusado', () => {
    expect(acessoFinanceiroCorpo.parse({ acessaFinanceiro: true })).toEqual({
      acessaFinanceiro: true,
    });
    expect(acessoFinanceiroCorpo.parse({ acessaFinanceiro: false })).toEqual({
      acessaFinanceiro: false,
    });
    expect(acessoFinanceiroCorpo.safeParse({ acessaFinanceiro: 'true' }).success).toBe(false);
    expect(acessoFinanceiroCorpo.safeParse({}).success).toBe(false);
    expect(acessoFinanceiroCorpo.safeParse({ acessaFinanceiro: true, contaId: 'x' }).success).toBe(
      false,
    );
  });
});

describe('lancamentoResposta', () => {
  it('FIN-25: lançamento com `mensalidade`, `alteradoPor` e `alteradoEm` passa', () => {
    const resposta = {
      id: '0b6f2a52-4a51-4e7f-9d6e-1f1f1f1f1f1f',
      ...lancamentoValido,
      mensalidade: false,
      alteradoPor: 'Conta excluída',
      alteradoEm: '2026-10-10T21:30:00.000Z',
    };
    expect(lancamentoResposta.parse(resposta)).toEqual(resposta);
    expect(lancamentoResposta.safeParse({ ...resposta, mensalidade: undefined }).success).toBe(
      false,
    );
  });
});

describe('códigos e mensagens', () => {
  it('FIN-36: os códigos do financeiro com as mensagens da spec', () => {
    expect(CODIGOS_ERRO_FINANCEIRO).toEqual([
      'pagamento_ja_marcado',
      'lancamento_vinculado',
      'sem_permissao_financeiro',
      'acao_na_propria_conta',
      'plano_pro',
    ]);
    expect(MENSAGENS_ERRO_FINANCEIRO.pagamento_ja_marcado).toBe(
      'O pagamento deste mês já está marcado.',
    );
    expect(MENSAGENS_ERRO_FINANCEIRO.sem_permissao_financeiro).toBe(
      'Você não tem acesso ao financeiro deste grupo.',
    );
    expect(MENSAGENS_ERRO_FINANCEIRO.acao_na_propria_conta).toBe(
      'Você não pode alterar a sua própria permissão.',
    );
  });

  it('FIN-30: mensagem do lançamento vinculado com apelido e MM/AAAA', () => {
    expect(mensagemLancamentoVinculado('Toninho', '2026-10')).toBe(
      'Esta entrada é a mensalidade de Toninho 10/2026. Desmarque o pagamento no mês para removê-la.',
    );
  });
});
