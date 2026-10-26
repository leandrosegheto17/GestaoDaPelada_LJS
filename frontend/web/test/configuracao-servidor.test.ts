import { describe, expect, it } from 'vitest';
import { configuracaoServidor, PORTA_DO_WORKER } from '../configuracao-servidor.ts';
import configuracao from '../vite.config.ts';

describe('servidor de desenvolvimento do Vite (FUN-04)', () => {
  it('sem variáveis: proxy de /api para o wrangler dev local, na mesma origem', () => {
    expect(PORTA_DO_WORKER).toBe(8787);
    expect(configuracaoServidor({})).toEqual({
      port: 5173,
      strictPort: true,
      proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } },
    });
  });

  it('ALVO_API_DEV troca o destino do proxy; valor em branco é ignorado', () => {
    expect(configuracaoServidor({ ALVO_API_DEV: 'http://127.0.0.1:9999' }).proxy).toEqual({
      '/api': { target: 'http://127.0.0.1:9999', changeOrigin: false },
    });
    expect(configuracaoServidor({ ALVO_API_DEV: '  ' }).proxy).toEqual({
      '/api': { target: 'http://localhost:8787', changeOrigin: false },
    });
  });

  it('polling só com CHOKIDAR_USEPOLLING=true', () => {
    expect(configuracaoServidor({ CHOKIDAR_USEPOLLING: 'true' }).watch).toEqual({ usePolling: true });
    expect(configuracaoServidor({ CHOKIDAR_USEPOLLING: 'false' }).watch).toBeUndefined();
  });

  it('o vite.config usa essa configuração e gera o build em dist (servido pelo Worker)', () => {
    expect(configuracao.server?.proxy).toEqual(configuracaoServidor(process.env).proxy);
    expect(configuracao.build?.outDir).toBe('dist');
  });
});
