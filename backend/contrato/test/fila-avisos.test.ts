import { describe, expect, it } from 'vitest';
import { mensagemAviso, mensagemCobranca, mensagemRanking, TENTATIVA_MAXIMA } from '../src/fila-avisos.ts';

/** Mensagens da fila `avisos` (notificacoes T16; NOT-22, NOT-43). */

const GRUPO = '6f1c2a54-2b1e-4c7a-9a43-0d8f3b1e5c21';

const RANKING = {
  tipo: 'ranking',
  grupoId: GRUPO,
  dataPartida: '2026-11-05',
  criadoEm: '2026-11-05T12:00:00.000Z',
  aposId: '0',
  tentativa: 1,
} as const;

const COBRANCA = {
  tipo: 'cobranca',
  idExterno: 'pay_080225913252',
  aviso: 'cobranca_gerada',
  grupoId: GRUPO,
  valorCentavos: 990,
  vencimento: '2026-11-10',
  tentativa: 1,
} as const;

describe('mensagem ranking', () => {
  it('NOT-22: aceita a mensagem mínima e a de nova tentativa com ids pendentes', () => {
    expect(mensagemRanking.parse(RANKING)).toEqual(RANKING);
    const retentativa = { ...RANKING, aposId: '41', ids: ['3', '17'], tentativa: 2 };
    expect(mensagemAviso.parse(retentativa)).toEqual(retentativa);
  });

  it('NOT-22: recusa data que não existe, grupo que não é uuid, instante sem formato ISO e tentativa fora de 1 a 3', () => {
    for (const ruim of [
      { ...RANKING, dataPartida: '2026-02-30' },
      { ...RANKING, grupoId: 'grupo-a' },
      { ...RANKING, criadoEm: '05/11/2026' },
      { ...RANKING, tentativa: 0 },
      { ...RANKING, tentativa: TENTATIVA_MAXIMA + 1 },
      { ...RANKING, tentativa: 1.5 },
      { ...RANKING, aposId: '-1' },
      { ...RANKING, aposId: '01' },
      { ...RANKING, ids: [] },
      { ...RANKING, ids: ['0'] },
      { ...RANKING, ids: Array.from({ length: 41 }, (_, i) => String(i + 1)) },
    ]) {
      expect(mensagemAviso.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false);
    }
  });

  it('NOT-43: recusa endpoint, chave ou qualquer campo a mais', () => {
    for (const extra of [{ endpoint: 'https://fcm.googleapis.com/x' }, { p256dh: 'x' }, { apelidos: ['Caco'] }]) {
      expect(mensagemRanking.safeParse({ ...RANKING, ...extra }).success).toBe(false);
    }
  });
});

describe('mensagem cobranca', () => {
  it('NOT-38: aceita os 3 tipos de aviso com valor em centavos inteiros', () => {
    for (const aviso of ['cobranca_gerada', 'pagamento_confirmado', 'pagamento_atrasado'] as const) {
      expect(mensagemCobranca.parse({ ...COBRANCA, aviso })).toEqual({ ...COBRANCA, aviso });
    }
  });

  it('NOT-48: a nova tentativa do push de cobrança leva só os ids das assinaturas, de 1 a 40', () => {
    const nova = { ...COBRANCA, pushIds: ['7', '12'], tentativa: 2 };
    expect(mensagemAviso.parse(nova)).toEqual(nova);
    expect(mensagemAviso.safeParse({ ...COBRANCA, pushIds: [] }).success).toBe(false);
    expect(mensagemAviso.safeParse({ ...COBRANCA, pushIds: ['abc'] }).success).toBe(false);
  });

  it('NOT-43: a mensagem de cobrança recusa campo de e-mail ou de nome', () => {
    for (const extra of [
      { email: 'criadora@exemplo.com' },
      { nome: 'Criadora' },
      { nomeGrupo: 'Pelada' },
      { customer: 'cus_1' },
    ]) {
      const r = mensagemAviso.safeParse({ ...COBRANCA, ...extra });
      expect(r.success, JSON.stringify(extra)).toBe(false);
    }
  });

  it('NOT-40: recusa valor em reais (fracionário), negativo, tipo desconhecido e id externo com outros caracteres', () => {
    for (const ruim of [
      { ...COBRANCA, valorCentavos: 9.9 },
      { ...COBRANCA, valorCentavos: -1 },
      { ...COBRANCA, aviso: 'pagamento_estornado' },
      { ...COBRANCA, idExterno: 'pay 1' },
      { ...COBRANCA, idExterno: '' },
      { ...COBRANCA, vencimento: '2026-13-01' },
    ]) {
      expect(mensagemAviso.safeParse(ruim).success, JSON.stringify(ruim)).toBe(false);
    }
  });

  it('recusa tipo de mensagem desconhecido e corpo que não é objeto', () => {
    for (const ruim of [{ ...COBRANCA, tipo: 'sms' }, null, 'ranking', 42, []]) {
      expect(mensagemAviso.safeParse(ruim).success).toBe(false);
    }
  });
});
