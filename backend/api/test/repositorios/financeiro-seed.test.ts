import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { comandoSeed, CONTA_CONVIDADA, MES_CAIXA, type ResultadoSeed } from '@pelada/scripts/seed';
import { financeiroMes } from '../../src/infraestrutura/db/repositorios/financeiro/mes.ts';
import { bancoDeTeste, comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';
import { comDb } from './apoio.ts';

/**
 * Seed com o caixa do exemplo (financeiro T47, FIN-07): depois do `pnpm seed`, a leitura do mês que o
 * `GET /api/grupos/:grupoId/financeiro/mes?mes=2026-10` usa, com o relógio fixo no "hoje" do mockup, dá os totais, a
 * lista de pagamentos e os lançamentos de `.specs/mockup/respostas/financeiro-2026-10.json`. A resposta do mockup é
 * lida do arquivo, não copiada: mudar o mockup sem mudar o seed deixa este teste vermelho.
 *
 * O seed troca o LOGIN e a senha de `pelada_app` e `pelada_backup_ro`, que são do cluster: os de antes voltam no
 * `finally` (mesmo cuidado de `backend/scripts/test/seed.test.ts`), e o banco `teste_*` some no `bancoDeTeste`.
 */

interface RespostaMockup {
  mes: string;
  hoje: string;
  navegacao: { mesAnterior: string | null; mesSeguinte: string | null };
  config: { mensalidadeCentavos: number | null; saldoInicialCentavos: number; dataSaldoInicial: string };
  saldoAtualCentavos: number;
  resumoMes: { entradasCentavos: number; saidasCentavos: number; resultadoCentavos: number; naoPagaram: number };
  pagamentos: Array<{ jogadorId: string; apelido: string; pagou: boolean }>;
  lancamentos: Array<{ id: string; tipo: string; data: string; descricao: string; valorCentavos: number; mensalidade: boolean }>;
}

const RESPOSTA = JSON.parse(
  readFileSync(new URL('../../../../.specs/mockup/respostas/financeiro-2026-10.json', import.meta.url), 'utf8'),
) as RespostaMockup;

const ROLES = ['pelada_app', 'pelada_backup_ro'] as const;

async function comSeed(fn: (url: string, r: ResultadoSeed) => Promise<void>, vezes = 1): Promise<void> {
  const base = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;
  const antes = await comCliente(base, async (c) =>
    (
      await c.query<{ rolname: string; rolcanlogin: boolean; rolpassword: string | null }>(
        'SELECT rolname, rolcanlogin, rolpassword FROM pg_authid WHERE rolname = ANY ($1::text[])',
        [ROLES],
      )
    ).rows,
  );
  try {
    await bancoDeTeste(
      async (url) => {
        const env = {
          DATABASE_URL_MIGRACAO: url,
          PELADA_APP_SENHA: `app-${randomBytes(8).toString('hex')}`,
          PELADA_BACKUP_RO_SENHA: `backup-${randomBytes(8).toString('hex')}`,
          SEED_SENHA_ADMIN: `admin-${randomBytes(8).toString('hex')}`,
        };
        let r = await comandoSeed(env);
        for (let i = 1; i < vezes; i++) r = await comandoSeed(env);
        await fn(url, r);
      },
      { migrado: true },
    );
  } finally {
    await comCliente(base, async (c) => {
      for (const r of antes) {
        const senha = r.rolpassword === null ? 'NULL' : c.escapeLiteral(r.rolpassword);
        await c.query(`ALTER ROLE ${c.escapeIdentifier(r.rolname)} ${r.rolcanlogin ? 'LOGIN' : 'NOLOGIN'} PASSWORD ${senha}`);
      }
    });
  }
}

const semId = <T extends { id: string }>({ id: _id, ...resto }: T) => resto;

describe('seed: caixa do exemplo', () => {
  it('FIN-07: o mês 2026-10 do grupo do caixa, lido pela criadora com hoje = 2026-10-22, dá os totais do mockup', async () => {
    await comSeed(async (url, r) => {
      expect(MES_CAIXA).toBe(RESPOSTA.mes);
      const mes = await comDb(url, r.contaId, (db) => financeiroMes.lerMes(db, r.grupoCaixaId, RESPOSTA.mes, RESPOSTA.hoje));

      expect(mes.mes).toBe(RESPOSTA.mes);
      expect(mes.hoje).toBe(RESPOSTA.hoje);
      expect(mes.navegacao).toEqual(RESPOSTA.navegacao);
      expect(mes.config).toEqual(RESPOSTA.config);
      expect(mes.saldoAtualCentavos).toBe(RESPOSTA.saldoAtualCentavos);
      expect(mes.resumoMes).toEqual(RESPOSTA.resumoMes);
      // Os ids do mockup (`j-alemao`, `l-bolas`) não são os do banco: a comparação é pelo resto, na mesma ordem.
      expect(mes.pagamentos.map(({ apelido, pagou }) => ({ apelido, pagou }))).toEqual(
        RESPOSTA.pagamentos.map(({ apelido, pagou }) => ({ apelido, pagou })),
      );
      expect(mes.lancamentos.map(semId)).toEqual(RESPOSTA.lancamentos.map(semId));
    });
  });

  it('FIN-07: o admin convidado do grupo do caixa não tem acesso ao financeiro e não lê o caixa', async () => {
    await comSeed(async (url, r) => {
      const vinculo = await comCliente(url, async (c) =>
        (
          await c.query<{ email: string; acessa_financeiro: boolean }>(
            `SELECT c.email, v.acessa_financeiro
               FROM vinculos_admin v JOIN contas c ON c.id = v.conta_id
              WHERE v.grupo_id = $1 AND v.conta_id = $2`,
            [r.grupoCaixaId, r.contaConvidadaId],
          )
        ).rows,
      );
      expect(vinculo).toEqual([{ email: CONTA_CONVIDADA.email, acessa_financeiro: false }]);

      // Pela RLS das 3 tabelas (FIN-39), a configuração não aparece e a leitura sai como "caixa não configurado".
      const mes = await comDb(url, r.contaConvidadaId, (db) =>
        financeiroMes.lerMes(db, r.grupoCaixaId, RESPOSTA.mes, RESPOSTA.hoje),
      );
      expect(mes.config).toBeNull();
      expect(mes.saldoAtualCentavos).toBeNull();
    });
  });

  it('FIN-07: rodar o seed duas vezes não duplica configuração, lançamentos nem pagamentos', async () => {
    await comSeed(async (url, r) => {
      const contagens = await comCliente(url, async (c) => {
        const n = async (sql: string) => (await c.query<{ n: number }>(sql, [r.grupoCaixaId])).rows[0]?.n;
        return {
          config: await n('SELECT count(*)::int AS n FROM config_financeira WHERE grupo_id = $1'),
          lancamentos: await n('SELECT count(*)::int AS n FROM lancamentos WHERE grupo_id = $1'),
          pagamentos: await n('SELECT count(*)::int AS n FROM pagamentos_mes WHERE grupo_id = $1'),
          vinculos: await n('SELECT count(*)::int AS n FROM vinculos_admin WHERE grupo_id = $1'),
        };
      });
      // 18 lançamentos de outubro e o que fecha o saldo antes dele; 16 pagaram; criadora e convidado.
      expect(contagens).toEqual({
        config: 1,
        lancamentos: RESPOSTA.lancamentos.length + 1,
        pagamentos: RESPOSTA.pagamentos.filter((p) => p.pagou).length,
        vinculos: 2,
      });
    }, 2);
  });
});
