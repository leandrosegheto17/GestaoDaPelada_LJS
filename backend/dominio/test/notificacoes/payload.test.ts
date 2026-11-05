import { describe, expect, it } from 'vitest';
import {
  diaEMes,
  NOME_DO_TIPO,
  payloadCobranca,
  payloadRanking,
  serializarPayload,
  TITULO_RANKING,
  type TipoAvisoCobranca,
} from '../../src/notificacoes/payload.ts';

/** Payloads dos avisos por push (T5; NOT-25, NOT-43). */

/** 120 caracteres (pontos de código), com emoji; cortado por ponto de código para não partir um par substituto. */
const NOME_LONGO = [...'Pelada dos Amigos ⚽🏆 '.repeat(7)].slice(0, 120).join('');

/**
 * Campos proibidos de PAR-76 (`PR:931`): id de jogador, telefone, ano, idade, posição, notas, nível, períodos,
 * pontuação inicial, financeiro. A prova forte é a lista exata de chaves; esta lista pega um campo a mais com nome
 * conhecido.
 */
const PROIBIDOS = ['jogadorId', 'apelido', 'pontos', 'posicao', 'telefone', 'ano', 'idade', 'notas', 'nivel', 'periodos', 'pontuacaoInicial', 'financeiro', 'valor', 'email', 'nome'];

describe('payloadRanking', () => {
  it('NOT-25: título, texto com dd/mm e caminho com o mês, e só essas três chaves', () => {
    const p = payloadRanking({ nomeGrupo: 'Pelada de Quinta', slug: 'pelada-de-quinta', dataPartida: '2026-11-05' });
    expect(p).toEqual({
      titulo: 'Ranking atualizado',
      texto: 'Pelada de Quinta: partida de 05/11',
      caminho: '/g/pelada-de-quinta?mes=2026-11',
    });
    expect(Object.keys(p).sort()).toEqual(['caminho', 'texto', 'titulo']);
    expect(TITULO_RANKING).toBe('Ranking atualizado');
  });

  it('NOT-25: nenhum campo de PAR-76 no JSON que vai para a cifra', () => {
    const json = JSON.parse(
      serializarPayload(payloadRanking({ nomeGrupo: 'X', slug: 'x', dataPartida: '2026-01-01' })),
    ) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['caminho', 'texto', 'titulo']);
    for (const campo of PROIBIDOS) expect(json).not.toHaveProperty(campo);
  });

  it.each([
    ['2026-03-01', '01/03', '2026-03'],
    ['2026-01-31', '31/01', '2026-01'],
    ['2026-12-31', '31/12', '2026-12'],
    ['2027-01-01', '01/01', '2027-01'],
  ])('NOT-25: %s dá %s e mês %s', (data, ddmm, mes) => {
    const p = payloadRanking({ nomeGrupo: 'G', slug: 'g', dataPartida: data });
    expect(p.texto).toBe(`G: partida de ${ddmm}`);
    expect(p.caminho).toBe(`/g/g?mes=${mes}`);
    expect(diaEMes(data)).toBe(ddmm);
  });

  it('NOT-25: nome de 120 caracteres com emoji entra inteiro', () => {
    expect([...NOME_LONGO].length).toBeLessThanOrEqual(120);
    const p = payloadRanking({ nomeGrupo: NOME_LONGO, slug: 'g', dataPartida: '2026-11-05' });
    expect(p.texto).toBe(`${NOME_LONGO}: partida de 05/11`);
  });

  it.each(['2026-02-30', '2026-13-01', '05/11/2026', ''])('NOT-25: data %j que não existe é recusada', (data) => {
    expect(() => payloadRanking({ nomeGrupo: 'G', slug: 'g', dataPartida: data })).toThrow(RangeError);
  });
});

describe('payloadCobranca', () => {
  it.each(Object.entries(NOME_DO_TIPO) as [TipoAvisoCobranca, string][])(
    'NOT-43: %s tem só o título com o tipo e o grupo, e o caminho de Meu plano',
    (tipo, nomeTipo) => {
      const p = payloadCobranca({ tipo, nomeGrupo: 'Pelada de Quinta', grupoId: 'g-123' });
      expect(p).toEqual({ titulo: `${nomeTipo}: Pelada de Quinta`, caminho: '/app/grupos/g-123/plano' });
    },
  );

  it('NOT-43: o JSON da cobrança não tem valor, e-mail nem nome de pessoa', () => {
    const texto = serializarPayload(
      payloadCobranca({ tipo: 'pagamento_atrasado', nomeGrupo: 'Pelada', grupoId: 'g-1' }),
    );
    const json = JSON.parse(texto) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['caminho', 'titulo']);
    for (const campo of PROIBIDOS) expect(json).not.toHaveProperty(campo);
    expect(texto).not.toMatch(/R\$|@|\d+,\d{2}/);
  });

  it('NOT-43: os três tipos em texto claro', () => {
    expect(NOME_DO_TIPO).toEqual({
      cobranca_gerada: 'Cobrança gerada',
      pagamento_confirmado: 'Pagamento confirmado',
      pagamento_atrasado: 'Pagamento atrasado',
    });
  });
});
