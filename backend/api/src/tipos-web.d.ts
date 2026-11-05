// Tipos da Web Crypto e do fetch que o runtime do Worker tem como globais, mas que o `lib: ES2024` com
// `types: ["node"]` não declara. Os aliases apontam para as mesmas definições do `@types/node`; o import é só de tipo.
import type { webcrypto } from 'node:crypto';

declare global {
  type CryptoKeyPair = webcrypto.CryptoKeyPair;
  type JsonWebKey = webcrypto.JsonWebKey;
  type RequestInfo = Request | string;
}

export {};
