import { describe, expect, it } from 'vitest';
import {
  CAMPOS_PESO,
  MENSAGEM_PESO,
  MENSAGEM_REFLETIR,
  pesosCorpo,
  pesosPainel,
} from '../src/pesos.ts';

/** Contrato dos pesos (T17; PAR-01, PAR-06, PAR-07, PAR-08). */

function mensagens(resultado: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = problema.path.map(String).join('.');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

const PADRAO = {
  presencaSemChuva: 1,
  presencaComChuva: 1,
  lesionadoSemChuva: 1,
  lesionadoComChuva: 1,
  expulsoSemChuva: -1,
  expulsoComChuva: -1,
};

const CORPO = { ...PADRAO, refletirNoPassado: false };

describe('pesosCorpo', () => {
  it('PAR-06: a mensagem é a da spec', () => {
    expect(MENSAGEM_PESO).toBe('Use um número inteiro de -10 a 10.');
  });

  it.each([10.5, 11, -11, '2', null])(
    'PAR-06: peso %j é recusado no campo do peso, com a mensagem',
    (valor) => {
      for (const campo of CAMPOS_PESO) {
        const r = pesosCorpo.safeParse({ ...CORPO, [campo]: valor });
        expect(r.success).toBe(false);
        expect(mensagens(r)).toEqual({ [campo]: [MENSAGEM_PESO] });
      }
    },
  );

  it.each([-10, 0, 10])('PAR-06: peso %s é aceito em todos os campos', (valor) => {
    const corpo = {
      ...Object.fromEntries(CAMPOS_PESO.map((c) => [c, valor])),
      refletirNoPassado: false,
    };
    expect(pesosCorpo.parse(corpo)).toEqual(corpo);
  });

  it('PAR-07: peso ausente é recusado no campo', () => {
    for (const campo of CAMPOS_PESO) {
      const corpo: Record<string, number | boolean> = { ...CORPO };
      delete corpo[campo];
      expect(mensagens(pesosCorpo.safeParse(corpo))).toEqual({ [campo]: [MENSAGEM_PESO] });
    }
  });

  it('PAR-08: vigenteDesde no corpo é recusado', () => {
    expect(pesosCorpo.safeParse({ ...CORPO, vigenteDesde: '2026-10-01' }).success).toBe(false);
  });

  it('PAR-08: qualquer outro campo é recusado', () => {
    expect(pesosCorpo.safeParse({ ...CORPO, registradoPor: 'x' }).success).toBe(false);
    expect(pesosCorpo.safeParse({ ...CORPO, expulso: -1 }).success).toBe(false);
  });

  it('PAR-03: os 6 campos são os da spec', () => {
    expect([...CAMPOS_PESO]).toEqual(Object.keys(PADRAO));
  });

  it('PAR-162: refletirNoPassado true e false são aceitos', () => {
    expect(pesosCorpo.parse({ ...PADRAO, refletirNoPassado: true }).refletirNoPassado).toBe(true);
    expect(pesosCorpo.parse({ ...PADRAO, refletirNoPassado: false }).refletirNoPassado).toBe(false);
  });

  it('PAR-162: refletirNoPassado ausente é recusado no campo, com a mensagem do contrato', () => {
    const r = pesosCorpo.safeParse(PADRAO);
    expect(r.success).toBe(false);
    expect(mensagens(r)).toEqual({ refletirNoPassado: [MENSAGEM_REFLETIR] });
  });

  it.each(['sim', 'true', 1, 0, null, undefined])(
    'PAR-162: refletirNoPassado %j é recusado no campo',
    (valor) => {
      const r = pesosCorpo.safeParse({ ...PADRAO, refletirNoPassado: valor });
      expect(r.success).toBe(false);
      expect(mensagens(r)).toEqual({ refletirNoPassado: [MENSAGEM_REFLETIR] });
    },
  );
});

describe('pesosPainel', () => {
  const vigente = {
    ...PADRAO,
    presencaComChuva: 2,
    vigenteDesde: '2026-10-15',
    registradoPor: 'Lia',
  };
  const anterior = {
    ...PADRAO,
    vigenteDesde: '2026-02-05',
    vigenteAte: '2026-10-14',
    registradoPor: 'Rui',
  };

  it('PAR-01: aceita hoje, vigente e histórico com vigenteAte', () => {
    const painel = { hoje: '2026-10-20', vigente, historico: [anterior] };
    expect(pesosPainel.parse(painel)).toEqual(painel);
  });

  it('PAR-01: a configuração anterior exige vigenteAte e registradoPor', () => {
    const semAte = { ...PADRAO, vigenteDesde: '2026-02-05', registradoPor: 'Rui' };
    expect(
      pesosPainel.safeParse({ hoje: '2026-10-20', vigente, historico: [semAte] }).success,
    ).toBe(false);
    const semAutor = { ...PADRAO, vigenteDesde: '2026-10-15' };
    expect(
      pesosPainel.safeParse({ hoje: '2026-10-20', vigente: semAutor, historico: [] }).success,
    ).toBe(false);
  });

  it('PAR-01: campo a mais no painel é recusado', () => {
    expect(
      pesosPainel.safeParse({ hoje: '2026-10-20', vigente: { ...vigente, id: 'x' }, historico: [] })
        .success,
    ).toBe(false);
  });
});
