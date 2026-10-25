interface Ambiente {
  producao: boolean;
  navegador: { serviceWorker?: { register: (url: string, opcoes: { scope: string }) => Promise<unknown> } };
}

/**
 * Registra o service worker do build (FUN-33). Só em produção (em desenvolvimento não há `sw.js`) e só onde o
 * navegador suporta. Falha no registro não derruba o app: ele continua funcionando, sem offline.
 */
export async function registrarServiceWorker(
  ambiente: Ambiente = { producao: import.meta.env.PROD, navegador: navigator },
): Promise<void> {
  const { producao, navegador } = ambiente;
  if (!producao || !navegador.serviceWorker) return;
  try {
    await navegador.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    // Sem service worker o app segue online.
  }
}
