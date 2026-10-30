import type { Hono } from 'hono';
import { inspectRoutes } from 'hono/dev';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrar } from '../../src/infraestrutura/db/migracoes/migrar.ts';
import { criarBancoTemporario, type BancoTemporario } from '../apoio/banco.ts';
import { criarApp, type AppEnv } from '../../src/entrada/app.ts';
import { CASOS, CASOS_ROTAS, type CasoRota } from './casos.ts';

let banco: BancoTemporario;
let cliente: pg.Client;

beforeAll(async () => {
  banco = await criarBancoTemporario();
  await migrar(banco.url);
  cliente = new pg.Client({ connectionString: banco.url });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
  await banco?.remover();
});

/** `grupos` e toda tabela de `public` com a coluna grupo_id. */
async function tabelasIsolaveis(): Promise<string[]> {
  const { rows } = await cliente.query<{ t: string }>(
    `SELECT c.relname AS t
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
        AND (c.relname = 'grupos' OR EXISTS (
              SELECT 1 FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attname = 'grupo_id' AND NOT a.attisdropped))
      ORDER BY 1`,
  );
  return rows.map((r) => r.t);
}

const semCaso = (tabelas: string[]) => tabelas.filter((t) => !(t in CASOS));

describe('a suíte de isolamento cobre toda tabela com grupo_id (FUN-17)', () => {
  it('toda tabela com grupo_id do schema migrado tem caso, e todo caso é de uma tabela que existe', async () => {
    const tabelas = await tabelasIsolaveis();
    expect(semCaso(tabelas)).toEqual([]);
    expect(Object.keys(CASOS).sort()).toEqual(tabelas);
  });

  it('uma tabela nova com grupo_id e sem caso é apontada', async () => {
    await cliente.query('BEGIN');
    try {
      await cliente.query('CREATE TABLE tabela_sem_caso (id int, grupo_id uuid)');
      expect(semCaso(await tabelasIsolaveis())).toEqual(['tabela_sem_caso']);
    } finally {
      await cliente.query('ROLLBACK');
    }
  });
});

const PREFIXO_GRUPO = '/api/grupos/:grupoId/';
// Motivo da mudança (grupos-e-elenco, T30): a rota do próprio grupo (`GET` e `PATCH /api/grupos/:grupoId`) também é
// de grupo e passa pelo mesmo `exigirVinculo` (o middleware de `/api/grupos/:grupoId/*` casa com ela). O conceito de
// "rota de grupo" passa a incluí-la; o caso novo do último teste prova que ela não pode ser marcada "não se aplica".
const ROTA_DO_GRUPO = '/api/grupos/:grupoId';
const ehDeGrupo = (caminho: string) => caminho === ROTA_DO_GRUPO || caminho.startsWith(PREFIXO_GRUPO);

/** Rotas registradas no app (sem os middlewares), como `MÉTODO /caminho`. */
function rotasDoApp(app: Hono<AppEnv>): string[] {
  return [
    ...new Set(
      inspectRoutes(app)
        .filter((r) => !r.isMiddleware)
        .map((r) => `${r.method} ${r.path}`),
    ),
  ].sort();
}

/** O que falta ou está errado entre as rotas do app e os casos de `CASOS_ROTAS`. */
function problemasDasRotas(rotas: string[], casos: Record<string, CasoRota>): string[] {
  const problemas: string[] = [];
  for (const rota of rotas) if (!(rota in casos)) problemas.push(`${rota}: sem caso`);
  for (const [rota, caso] of Object.entries(casos)) {
    const caminho = rota.slice(rota.indexOf(' ') + 1);
    if (!rotas.includes(rota)) problemas.push(`${rota}: caso sem rota`);
    if (caso.tipo === 'grupo' && !ehDeGrupo(caminho)) problemas.push(`${rota}: grupo fora de ${PREFIXO_GRUPO}`);
    if (caso.tipo === 'nao_se_aplica' && ehDeGrupo(caminho)) problemas.push(`${rota}: rota de grupo sem caso de grupo`);
    if (caso.tipo === 'nao_se_aplica' && !caso.motivo.trim()) problemas.push(`${rota}: "não se aplica" sem motivo`);
  }
  return problemas;
}

describe('a suíte de isolamento cobre toda rota registrada no Hono (G-04, ACE-48)', () => {
  it('toda rota do app tem caso, e todo caso é de uma rota que existe', () => {
    const rotas = rotasDoApp(criarApp());
    expect(rotas).toContain('GET /api/health');
    expect(problemasDasRotas(rotas, CASOS_ROTAS)).toEqual([]);
  });

  it('uma rota nova sem caso é apontada', () => {
    const app = criarApp();
    app.post('/api/teste/sem-caso', (c) => c.json({ ok: true }));
    expect(problemasDasRotas(rotasDoApp(app), CASOS_ROTAS)).toEqual(['POST /api/teste/sem-caso: sem caso']);
  });

  it('rota de grupo marcada como "não se aplica", caso de grupo fora do prefixo e caso sem motivo são apontados', () => {
    const app = criarApp();
    app.get('/api/grupos/:grupoId/coisa', (c) => c.json({ ok: true }));
    app.get('/api/fora', (c) => c.json({ ok: true }));
    app.get('/api/sem-motivo', (c) => c.json({ ok: true }));
    app.delete('/api/grupos/:grupoId', (c) => c.json({ ok: true }));
    app.get('/api/grupos/:grupoIdx', (c) => c.json({ ok: true }));
    const casos: Record<string, CasoRota> = {
      ...CASOS_ROTAS,
      'GET /api/grupos/:grupoId/coisa': { tipo: 'nao_se_aplica', motivo: 'errado' },
      'DELETE /api/grupos/:grupoId': { tipo: 'nao_se_aplica', motivo: 'errado' },
      'GET /api/grupos/:grupoIdx': { tipo: 'grupo' },
      'GET /api/fora': { tipo: 'grupo' },
      'GET /api/sem-motivo': { tipo: 'nao_se_aplica', motivo: ' ' },
    };
    expect(problemasDasRotas(rotasDoApp(app), casos)).toEqual([
      'GET /api/grupos/:grupoId/coisa: rota de grupo sem caso de grupo',
      'DELETE /api/grupos/:grupoId: rota de grupo sem caso de grupo',
      'GET /api/grupos/:grupoIdx: grupo fora de /api/grupos/:grupoId/',
      'GET /api/fora: grupo fora de /api/grupos/:grupoId/',
      'GET /api/sem-motivo: "não se aplica" sem motivo',
    ]);
  });
});
