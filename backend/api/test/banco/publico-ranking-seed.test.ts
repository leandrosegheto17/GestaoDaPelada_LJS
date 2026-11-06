import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rankingPublico } from '@pelada/contrato';
import {
  comandoSeed,
  GRUPO_CAIXA,
  PARTIDAS_EXEMPLO,
  type ResultadoSeed,
} from '@pelada/scripts/seed';
import { criarApp } from '../../src/entrada/app.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { envAcesso } from '../acesso/apoio.ts';
import { bancoDeTeste, comCliente, URL_TESTE_PADRAO } from '../apoio/banco.ts';
import { contextoFalso, fabricaComoApp } from '../db/requisicao.ts';

/**
 * Seed com as partidas do exemplo da t01 (partidas-e-ranking T74; PAR-62, PAR-79; P25 de `BC:37`): depois do
 * `pnpm seed`, `GET /api/publico/pelada-de-quinta/ranking?mes=2026-10`, com o app real como `pelada_app` e o relógio no
 * "agora" do mockup, dá as linhas e os pontos de `.specs/mockup/respostas/publico-ranking-2026-10.json`. A resposta é
 * lida do arquivo: mudar o mockup sem mudar o seed deixa o teste vermelho.
 *
 * O seed troca LOGIN e senha de `pelada_app` e `pelada_backup_ro` (do cluster); os de antes voltam no `finally`, como
 * em `test/repositorios/financeiro-seed.test.ts`, e o banco `teste_*` some no `bancoDeTeste`.
 */

interface RespostaMockup {
  mes: string;
  hoje: string;
  geradoEm: string;
  navegacao: { mesAnterior: string | null; mesSeguinte: string | null };
  resumoMes: { partidas: number; comChuva: number };
  partidas: Array<{ data: string; choveu: boolean }>;
  linhas: Array<{
    posicao: number;
    apelido: string;
    ptsInicial: number;
    ptsFinal: number;
    rodadas: Array<{ situacao: string; pontos: number | null }>;
  }>;
}

const RESPOSTA = JSON.parse(
  readFileSync(
    new URL('../../../../.specs/mockup/respostas/publico-ranking-2026-10.json', import.meta.url),
    'utf8',
  ),
) as RespostaMockup;

const ROLES = ['pelada_app', 'pelada_backup_ro'] as const;

async function comSeed(
  fn: (url: string, r: ResultadoSeed) => Promise<void>,
  vezes = 1,
): Promise<void> {
  const base = process.env.DATABASE_URL_TESTE ?? URL_TESTE_PADRAO;
  const antes = await comCliente(
    base,
    async (c) =>
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
        await c.query(
          `ALTER ROLE ${c.escapeIdentifier(r.rolname)} ${r.rolcanlogin ? 'LOGIN' : 'NOLOGIN'} PASSWORD ${senha}`,
        );
      }
    });
  }
}

async function rankingDoSeed(url: string, consulta: string): Promise<Response> {
  const app = criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    relogio: relogioFixo(RESPOSTA.geradoEm),
  });
  const ctx = contextoFalso();
  const r = await app.request(
    `/api/publico/${GRUPO_CAIXA.slug}/ranking${consulta}`,
    { method: 'GET' },
    envAcesso(url),
    ctx,
  );
  await ctx.esperar();
  return r;
}

describe('seed: ranking do exemplo da t01', () => {
  it('PAR-79: depois do seed, o ranking de 2026-10 dá as linhas e os pontos do mockup', async () => {
    await comSeed(async (url) => {
      const r = await rankingDoSeed(url, `?mes=${RESPOSTA.mes}`);
      expect(r.status).toBe(200);
      const corpo = rankingPublico.parse(await r.json());

      expect(corpo.mes).toBe(RESPOSTA.mes);
      expect(corpo.hoje).toBe(RESPOSTA.hoje);
      expect(corpo.navegacao.mesSeguinte).toBe(RESPOSTA.navegacao.mesSeguinte);
      expect(corpo.resumoMes).toEqual(RESPOSTA.resumoMes);
      expect(corpo.partidas).toEqual(RESPOSTA.partidas);
      // Mesmas linhas, na mesma ordem, com os mesmos pontos (a ordem das chaves do arquivo não importa).
      expect(corpo.linhas).toEqual(
        RESPOSTA.linhas.map(({ posicao, apelido, ptsInicial, rodadas, ptsFinal }) => ({
          posicao,
          apelido,
          ptsInicial,
          rodadas,
          ptsFinal,
        })),
      );
    });
  });

  it('PAR-62: o Pts final de cada linha é o Pts inicial mais os pontos das rodadas (pesos com chuva 2 desde 01/09)', async () => {
    await comSeed(async (url) => {
      const corpo = rankingPublico.parse(
        await (await rankingDoSeed(url, `?mes=${RESPOSTA.mes}`)).json(),
      );
      for (const l of corpo.linhas) {
        const soma = l.rodadas.reduce((s, rd) => s + (rd.pontos ?? 0), 0);
        expect({ apelido: l.apelido, final: l.ptsFinal }).toEqual({
          apelido: l.apelido,
          final: l.ptsInicial + soma,
        });
      }
      const toninho = corpo.linhas.find((l) => l.apelido === 'Toninho');
      expect(toninho?.rodadas.map((rd) => rd.pontos)).toEqual([1, 2, 1]);
    });
  });

  it('PAR-62: o seed grava 3 partidas, e rodar de novo não duplica partidas, presenças nem pesos', async () => {
    await comSeed(async (url, r) => {
      const contagens = await comCliente(url, async (c) => {
        const n = async (sql: string) =>
          (await c.query<{ n: number }>(sql, [r.grupoCaixaId])).rows[0]?.n;
        return {
          partidas: await n('SELECT count(*)::int AS n FROM partidas WHERE grupo_id = $1'),
          presencas: await n('SELECT count(*)::int AS n FROM presencas WHERE grupo_id = $1'),
          pesos: await n(
            `SELECT count(*)::int AS n FROM config_pesos WHERE grupo_id = $1 AND vigente_desde < '2026-10-01'`,
          ),
        };
      });
      const presencas = RESPOSTA.linhas
        .flatMap((l) => l.rodadas)
        .filter((rd) => !['falta', 'fora'].includes(rd.situacao)).length;
      expect(contagens).toEqual({ partidas: PARTIDAS_EXEMPLO.length, presencas, pesos: 2 });
      expect(PARTIDAS_EXEMPLO.length).toBe(3);
    }, 2);
  });
});
