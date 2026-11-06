import { afterEach } from 'vitest';

/**
 * Armazenamento em memória no lugar do `localStorage` ausente. No Node 26, o `localStorage` experimental do Node
 * (sem `--localstorage-file`) encobre o do jsdom e devolve `undefined`; os testes que o usam (FUN-36 e o ranking
 * guardado) precisam de um objeto com a interface de `Storage`. Só entra quando o ambiente não traz o seu.
 */
function criarArmazenamentoEmMemoria(): Storage {
  const dados = new Map<string, string>();
  return {
    get length() {
      return dados.size;
    },
    clear: () => dados.clear(),
    getItem: (chave) => dados.get(String(chave)) ?? null,
    key: (indice) => [...dados.keys()][indice] ?? null,
    removeItem: (chave) => void dados.delete(String(chave)),
    setItem: (chave, valor) => void dados.set(String(chave), String(valor)),
  };
}

if (typeof window !== 'undefined' && typeof window.localStorage === 'undefined') {
  const armazenamento = criarArmazenamentoEmMemoria();
  Object.defineProperty(window, 'localStorage', { value: armazenamento, configurable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: armazenamento, configurable: true });
}

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
