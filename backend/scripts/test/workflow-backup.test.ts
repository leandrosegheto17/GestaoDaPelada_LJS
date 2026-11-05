import { describe, expect, it } from 'vitest';
import { lerWorkflow, passos, SHA_40, textoDo, usesExternos } from './apoio/workflow.ts';

const wf = lerWorkflow('backup.yml');
const texto = textoDo('.github/workflows/backup.yml');
const job = Object.values(wf.jobs)[0];

describe('backup.yml', () => {
  it('FUN-47: roda todo dia às 07:00 UTC e manualmente', () => {
    expect(wf.on.schedule).toEqual([{ cron: '0 7 * * *' }]);
    expect('workflow_dispatch' in wf.on).toBe(true);
  });

  it('FUN-47: usa o environment backup (AD-013) e permissão só de leitura', () => {
    expect(Object.keys(wf.jobs)).toHaveLength(1);
    expect(job?.environment).toBe('backup');
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('FUN-47: dump com NEON_URL_BACKUP e BACKUP_CHAVE pela ação dump-cifrado', () => {
    const dump = passos(wf).find((p) => p.uses === './.github/actions/dump-cifrado');
    expect(dump?.with?.url).toBe('${{ secrets.NEON_URL_BACKUP }}');
    expect(dump?.with?.['chave-publica']).toBe('${{ secrets.BACKUP_CHAVE }}');
  });

  it('FUN-47: instala o cliente 18 e o age', () => {
    expect(texto).toMatch(/postgresql-client-18/);
    expect(texto).toMatch(/\bage\b/);
  });

  it('FUN-47: o artefato fica 30 dias', () => {
    const up = passos(wf).find((p) => p.uses?.startsWith('actions/upload-artifact@'));
    expect(up?.with?.['retention-days']).toBe(30);
  });

  it('FUN-49: o upload falha quando não há arquivo', () => {
    const up = passos(wf).find((p) => p.uses?.startsWith('actions/upload-artifact@'));
    expect(up?.with?.['if-no-files-found']).toBe('error');
    expect(up?.if).toBeUndefined();
  });

  it('FUN-49: nenhum passo engole erro (continue-on-error ou || true)', () => {
    expect(job?.['continue-on-error']).toBeUndefined();
    for (const p of passos(wf)) {
      expect(p['continue-on-error'], p.name).toBeUndefined();
      expect(p.run ?? '', p.name).not.toMatch(/\|\|\s*true/);
    }
    expect(texto).not.toMatch(/\|\|\s*true/);
  });

  it('todo uses: externo está fixado por SHA de 40 caracteres', () => {
    const externos = usesExternos(texto);
    expect(externos.length).toBeGreaterThan(0);
    for (const u of externos) expect(u).toMatch(SHA_40);
  });

  it('nenhum segredo literal: só referências a secrets', () => {
    expect(texto).not.toMatch(/postgres(ql)?:\/\/[^$\s]+@/);
    expect(texto).not.toMatch(/age1[0-9a-z]{20,}/);
    expect(texto).not.toMatch(/AGE-SECRET-KEY-/);
  });
});
