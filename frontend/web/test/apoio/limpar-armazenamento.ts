import { afterEach } from 'vitest';

/**
 * Limpa o `localStorage` do jsdom depois de cada teste (partidas-e-ranking T73; P24 de `BC:36`): o ranking agora fica
 * guardado no aparelho (T72), e o jsdom o mantém entre os testes do mesmo arquivo; sem isto, um teste herdaria o
 * guardado de outro (ex.: o carregando da t01 viraria o guardado com "atualizando…"). Nenhuma asserção muda. Nos
 * testes de ambiente `node` não há `window`, e nada é feito.
 */
afterEach(() => {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined')
    window.localStorage.clear();
});
