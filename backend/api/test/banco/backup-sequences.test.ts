import { describe, expect, it } from 'vitest';
import { comCenario } from '../isolamento/apoio.ts';

/**
 * Backup completo (fundacao FUN-11, FUN-48; AD-010, AD-016; achado A-09 do /validar). O `pg_dump` completo lê o valor
 * de toda sequence; sem SELECT para a role de backup ele sai com exit 1 ("failed to get data for sequence") e o
 * `deploy.yml` para no passo do dump. O `pg_dump` do NOT-58 só pega 3 tabelas, então esta checagem olha o catálogo:
 * toda sequence do schema `public` é legível por `pelada_backup_ro`, e a role de backup continua sem escrever nelas.
 */
describe('A-09: a role de backup lê todas as sequences', () => {
  it('FUN-11: toda sequence de public dá SELECT a pelada_backup_ro e nenhum USAGE nem UPDATE', async () => {
    await comCenario(async (db) => {
      const r = await db.query<{ nome: string; le: boolean; usa: boolean; escreve: boolean }>(
        `SELECT c.relname AS nome,
                has_sequence_privilege('pelada_backup_ro', c.oid, 'SELECT') AS le,
                has_sequence_privilege('pelada_backup_ro', c.oid, 'USAGE') AS usa,
                has_sequence_privilege('pelada_backup_ro', c.oid, 'UPDATE') AS escreve
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind = 'S' AND n.nspname = 'public' ORDER BY c.relname`,
      );
      expect(r.rows.length).toBeGreaterThan(0);
      expect(r.rows.filter((s) => !s.le).map((s) => s.nome)).toEqual([]);
      expect(r.rows.filter((s) => s.usa || s.escreve).map((s) => s.nome)).toEqual([]);
    });
  });

  it('FUN-11: as duas sequences que faltavam estão entre as legíveis', async () => {
    await comCenario(async (db) => {
      const r = await db.query<{ le: boolean }>(
        `SELECT has_sequence_privilege('pelada_backup_ro', s, 'SELECT') AS le
           FROM unnest(ARRAY['public.falhas_senha_atual_id_seq', 'public.pedidos_email_origem_id_seq']) AS s`,
      );
      expect(r.rows.map((x) => x.le)).toEqual([true, true]);
    });
  });
});
