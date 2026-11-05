import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela } from '../apoio/tela.tsx';

/** Termos e privacidade com a cobrança (planos-e-cobranca T54; PLA-66, PLA-67). */

afterEach(() => {
  cleanup();
});

async function textoDa(caminho: string, titulo: string): Promise<string> {
  const { container } = abrirTela(caminho);
  await screen.findByRole('heading', { level: 1, name: titulo });
  return container.textContent ?? '';
}

describe('privacidade com a cobrança', () => {
  it('PLA-66: /privacidade cita o Asaas, o CPF e o id do cliente', async () => {
    const texto = await textoDa('/privacidade', 'Privacidade');
    expect(texto).toContain('Asaas');
    expect(texto).toContain('CPF');
    expect(texto).toContain('id do cliente');
  });

  it('PLA-66: /privacidade diz que o CPF e o cartão não são guardados', async () => {
    const texto = await textoDa('/privacidade', 'Privacidade');
    expect(texto).toMatch(/não guarda o CPF nem dado de cartão/);
  });
});

describe('termos com os planos', () => {
  it('PLA-67: /termos mostra "14 dias", "R$ 9,90" e "20 jogadores"', async () => {
    const texto = await textoDa('/termos', 'Termos de uso');
    expect(texto).toContain('14 dias');
    expect(texto).toContain('R$ 9,90');
    expect(texto).toContain('20 jogadores');
  });

  it('PLA-67: /termos fala da queda para o Free sem apagar dados e do cancelamento', async () => {
    const texto = await textoDa('/termos', 'Termos de uso');
    expect(texto).toMatch(/volta ao Free/);
    expect(texto).toMatch(/nada é apagado/);
    expect(texto).toMatch(/cancelada em Meu plano/);
    expect(texto).toMatch(/até o fim do período já pago/);
  });
});
