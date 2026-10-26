import { describe, expect, it } from 'vitest';
import { responderNavegacao } from './regras-sw';

// FUN-34
describe('responderNavegacao', () => {
  const pagina = (texto: string) => new Response(texto);

  it('devolve o shell quando ele responde', async () => {
    const resposta = await responderNavegacao(
      () => Promise.resolve(pagina('shell')),
      () => Promise.resolve(pagina('offline')),
    );
    expect(await resposta.text()).toBe('shell');
  });

  it('sem cache e sem rede, devolve a página offline', async () => {
    const resposta = await responderNavegacao(
      () => Promise.reject(new Error('sem cache e sem rede')),
      () => Promise.resolve(pagina('offline')),
    );
    expect(await resposta.text()).toBe('offline');
  });

  it('sem a página offline no cache, devolve erro de rede em vez de lançar', async () => {
    const resposta = await responderNavegacao(
      () => Promise.reject(new Error('sem rede')),
      () => Promise.resolve(undefined),
    );
    expect(resposta.type).toBe('error');
  });
});
