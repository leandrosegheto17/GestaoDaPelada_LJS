import { TERMOS_VERSAO } from '@pelada/contrato/acesso';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { abrirTela } from '../apoio/tela.tsx';

/** Privacidade com o push e os e-mails de cobrança (notificacoes T39; NOT-59; AD-116). */

afterEach(() => {
  cleanup();
});

async function privacidade(): Promise<string> {
  const { container } = abrirTela('/privacidade');
  await screen.findByRole('heading', { level: 1, name: 'Privacidade' });
  return container.textContent ?? '';
}

describe('privacidade com os avisos', () => {
  it('NOT-59: cita os 4 pontos do push: endereço técnico do aparelho por grupo, sem nome, como cancelar e os 180 dias', async () => {
    const texto = await privacidade();
    expect(texto).toMatch(/endereço técnico do aparelho/);
    expect(texto).toMatch(/separado por grupo/);
    expect(texto).toMatch(/sem nome/);
    expect(texto).toContain('Parar de receber avisos');
    expect(texto).toMatch(/180 dias sem nenhum aviso entregue/);
  });

  it('NOT-59: a frase dos e-mails inclui os avisos de cobrança a quem criou o grupo, e a antiga não aparece', async () => {
    const texto = await privacidade();
    expect(texto).toMatch(/avisar quem criou o grupo sobre a cobrança do Pro/);
    expect(texto).not.toContain(
      'Enviamos e-mails só para confirmar a conta, recuperar a senha e entregar convites de admin.',
    );
  });

  it('NOT-59: a versão mostrada é a TERMOS_VERSAO, sem novo aceite (AD-116)', async () => {
    await privacidade();
    expect(screen.getByText(`Versão ${TERMOS_VERSAO}`)).toBeTruthy();
  });
});
