import { vi } from 'vitest';

/** Captura tudo o que o código manda para o console enquanto `acao` roda (ACE-21, G-08). */
export async function capturarLog<T>(acao: () => Promise<T>): Promise<{ resultado: T; log: string }> {
  const linhas: string[] = [];
  const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((nivel) =>
    vi.spyOn(console, nivel).mockImplementation((...args: unknown[]) => {
      linhas.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    }),
  );
  try {
    const resultado = await acao();
    return { resultado, log: linhas.join('\n') };
  } finally {
    for (const espiao of espioes) espiao.mockRestore();
  }
}
