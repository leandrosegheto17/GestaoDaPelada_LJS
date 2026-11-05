import { describe, expect, it } from 'vitest';
import { asaasMemoria } from '../../src/infraestrutura/asaas/memoria.ts';

/** Asaas em memória (T30; PLA-36, PLA-53). */

const CLIENTE = { name: 'Maria', cpfCnpj: '52998224725', email: 'maria@exemplo.com', externalReference: 'conta-1' };
const ASSINATURA = {
  customer: 'cus_1',
  valorCentavos: 990,
  nextDueDate: '2026-11-05',
  description: 'Pro',
  externalReference: 'grupo-1',
};

describe('asaasMemoria', () => {
  it('PLA-53: cria cliente e assinatura e devolve a fatura da primeira cobrança', async () => {
    const asaas = asaasMemoria();
    const cliente = await asaas.criarCliente(CLIENTE);
    expect(cliente).not.toBe('falhou');
    const assinatura = await asaas.criarAssinatura(ASSINATURA);
    if (assinatura === 'falhou') throw new Error('não devia falhar');
    const cobranca = await asaas.primeiraCobranca(assinatura.id);
    if (cobranca === 'falhou') throw new Error('não devia falhar');
    expect(cobranca.invoiceUrl).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\/pay_/);
    expect(asaas.chamadas.map((c) => c.operacao)).toEqual(['criarCliente', 'criarAssinatura', 'primeiraCobranca']);
  });

  it('PLA-36: programada para falhar na segunda chamada devolve falhou nela, e só nela', async () => {
    const asaas = asaasMemoria();
    asaas.falharNa(2);
    expect(await asaas.criarCliente(CLIENTE)).not.toBe('falhou');
    expect(await asaas.criarAssinatura(ASSINATURA)).toBe('falhou');
    expect(asaas.assinaturas.size).toBe(0);
    expect(await asaas.criarAssinatura(ASSINATURA)).not.toBe('falhou');
    expect(asaas.chamadas).toHaveLength(3);
  });

  it('PLA-36: falharSempre derruba a operação até limpar', async () => {
    const asaas = asaasMemoria();
    asaas.falharSempre('primeiraCobranca');
    const a = await asaas.criarAssinatura(ASSINATURA);
    if (a === 'falhou') throw new Error('não devia falhar');
    expect(await asaas.primeiraCobranca(a.id)).toBe('falhou');
    expect(await asaas.primeiraCobranca(a.id)).toBe('falhou');
    asaas.limpar();
    expect(asaas.chamadas).toHaveLength(0);
    const b = await asaas.criarAssinatura(ASSINATURA);
    if (b === 'falhou') throw new Error('não devia falhar');
    expect(await asaas.primeiraCobranca(b.id)).not.toBe('falhou');
  });

  it('removerAssinatura marca a assinatura e a fatura deixa de existir; id desconhecido falha', async () => {
    const asaas = asaasMemoria();
    const a = await asaas.criarAssinatura(ASSINATURA);
    if (a === 'falhou') throw new Error('não devia falhar');
    expect(await asaas.removerAssinatura(a.id)).toBe('removida');
    expect(asaas.assinaturas.get(a.id)?.removida).toBe(true);
    expect(await asaas.primeiraCobranca(a.id)).toBe('falhou');
    expect(await asaas.removerAssinatura('sub_inexistente')).toBe('falhou');
  });
});
