import { createContext, useContext, type ReactNode } from 'react';
import type { ClienteApi } from './cliente.ts';

/** O cliente HTTP do app (T36) para as telas e os hooks de dados; o App cria um por montagem. */
const Contexto = createContext<ClienteApi | null>(null);

export function ProvedorCliente({ cliente, children }: { cliente: ClienteApi; children: ReactNode }) {
  return <Contexto.Provider value={cliente}>{children}</Contexto.Provider>;
}

export function useCliente(): ClienteApi {
  const cliente = useContext(Contexto);
  if (!cliente) throw new Error('useCliente fora do ProvedorCliente.');
  return cliente;
}
