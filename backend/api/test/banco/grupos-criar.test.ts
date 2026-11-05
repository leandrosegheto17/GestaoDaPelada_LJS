import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comoApp } from '../isolamento/apoio.ts';
import {
  abrirCenarioGrupos,
  HABILIDADES_INICIAIS,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * Caracterização da `grupo_criar` (T2; GEL-01, GEL-02, GEL-09, GEL-10, GEL-14), versão de
 * `1792844340000_grupo-criar.sql:10-75`. Cada caso roda numa transação como `pelada_app` com a conta C, desfeita ao
 * fim; a leitura do resultado é feita na mesma transação, depois de `RESET ROLE` (superusuário, sem RLS).
 *
 * Evidência da rede (registrar na T2): a função sem o `WHILE EXISTS` (sufixo fixo na base) deixa o teste de sufixo
 * vermelho.
 */

let aberto: CenarioGruposAberto;

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

interface Criado {
  id: string;
  slug: string;
}

async function criar(
  d: pg.Client,
  nome: string,
  base: string,
  habilidades: readonly string[] = HABILIDADES_INICIAIS,
): Promise<Criado> {
  const r = await d.query<Criado>(
    // De 7 parâmetros desde a T25 do simulador (AD-037), com a data que a de 6 usava.
    `SELECT id, slug FROM grupo_criar($1, 'sabado', 'semanal', '09:00', $2, $3::text[],
       (now() AT TIME ZONE 'America/Sao_Paulo')::date)`,
    [nome, base, habilidades],
  );
  const linha = r.rows[0];
  if (!linha) throw new Error('grupo_criar sem linha');
  return linha;
}

/** Roda `fn` como `pelada_app` com a conta C, numa transação desfeita ao fim. */
function comoC<T>(fn: (d: pg.Client) => Promise<T>): Promise<T> {
  return comoApp(aberto.db, { conta: aberto.cenario.contaC }, fn);
}

async function contar(d: pg.Client, sql: string, valores: unknown[] = []): Promise<number> {
  const r = await d.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${sql}) q`, valores);
  return r.rows[0]?.n ?? -1;
}

describe('grupo_criar', () => {
  it('GEL-01: cria o grupo com criado_por = conta do contexto e o vínculo com acessa_financeiro', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      const g = await criar(d, 'Racha do Sábado', 'racha-do-sabado');
      expect(g.slug).toBe('racha-do-sabado');
      await d.query('RESET ROLE');
      const grupo = await d.query<{ criado_por: string; nome: string }>(
        'SELECT criado_por, nome FROM grupos WHERE id = $1',
        [g.id],
      );
      expect(grupo.rows[0]).toEqual({ criado_por: cenario.contaC, nome: 'Racha do Sábado' });
      const vinculo = await d.query<{
        conta_id: string;
        acessa_financeiro: boolean;
        criado_por: string;
      }>('SELECT conta_id, acessa_financeiro, criado_por FROM vinculos_admin WHERE grupo_id = $1', [
        g.id,
      ]);
      expect(vinculo.rows).toEqual([
        { conta_id: cenario.contaC, acessa_financeiro: true, criado_por: cenario.contaC },
      ]);
    });
  });

  it('GEL-02: as habilidades saem na ordem do array recebido', async () => {
    await comoC(async (d) => {
      const ordem = ['Desarme', 'Chute', 'Passe'];
      const g = await criar(d, 'Racha da Ordem', 'racha-da-ordem', ordem);
      const r = await d.query<{ nome: string }>(
        'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
        [g.id],
      );
      expect(r.rows.map((l) => l.nome)).toEqual(ordem);
    });
  });

  it('GEL-02: com as 6 iniciais, a ordem é Visão de Jogo, Passe, Preparo Físico, Drible, Chute, Desarme', async () => {
    await comoC(async (d) => {
      const g = await criar(d, 'Racha Inicial', 'racha-inicial');
      const r = await d.query<{ nome: string }>(
        'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
        [g.id],
      );
      expect(r.rows.map((l) => l.nome)).toEqual([...HABILIDADES_INICIAIS]);
    });
  });

  it('GEL-14: com pelada-de-quinta (arquivado) e pelada-de-quinta-2 ocupados, o novo é pelada-de-quinta-3', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      const segundo = await criar(d, 'Pelada de Quinta', 'pelada-de-quinta');
      expect(segundo.slug).toBe('pelada-de-quinta-2');
      // G (pelada-de-quinta) arquivado como superusuário, na mesma transação; a RLS o esconde da pelada_app.
      await d.query('RESET ROLE');
      await d.query('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [cenario.grupoG]);
      await d.query('SET LOCAL ROLE pelada_app');
      const terceiro = await criar(d, 'Pelada de Quinta', 'pelada-de-quinta');
      expect(terceiro.slug).toBe('pelada-de-quinta-3');
    });
  });

  it('GEL-09: habilidade de 1 caractere faz a função falhar sem grupo, vínculo, habilidade nem auditoria', async () => {
    const totais = async (d: pg.Client): Promise<Record<string, number>> => ({
      grupos: await contar(d, 'SELECT 1 FROM grupos'),
      vinculos: await contar(d, 'SELECT 1 FROM vinculos_admin'),
      habilidades: await contar(d, 'SELECT 1 FROM habilidades'),
      auditoria: await contar(d, 'SELECT 1 FROM auditoria'),
    });
    const antes = await totais(aberto.db);
    await comoC(async (d) => {
      await d.query('SAVEPOINT antes');
      await expect(criar(d, 'Racha Falho', 'racha-falho', ['Passe', 'X'])).rejects.toMatchObject({
        code: '23514',
      });
      await d.query('ROLLBACK TO SAVEPOINT antes');
      await d.query('RESET ROLE');
      expect(await totais(d)).toEqual(antes);
    });
  });

  it('GEL-10: no sucesso, uma linha grupo_criado com a conta autora e o id do grupo', async () => {
    const { cenario } = aberto;
    await comoC(async (d) => {
      const g = await criar(d, 'Racha Auditado', 'racha-auditado');
      await d.query('RESET ROLE');
      const r = await d.query<{
        autor_tipo: string;
        autor_conta_id: string;
        entidade: string;
        entidade_id: string;
      }>(
        `SELECT autor_tipo, autor_conta_id, entidade, entidade_id FROM auditoria WHERE acao = 'grupo_criado' AND grupo_id = $1`,
        [g.id],
      );
      expect(r.rows).toEqual([
        {
          autor_tipo: 'conta',
          autor_conta_id: cenario.contaC,
          entidade: 'grupo',
          entidade_id: g.id,
        },
      ]);
    });
  });

  it('GEL-01: sem app.conta_id, a grupo_criar recusa com 42501', async () => {
    await expect(
      comoApp(aberto.db, {}, (d) => criar(d, 'Racha Sem Conta', 'racha-sem-conta')),
    ).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('GEL-01: INSERT direto em grupos como pelada_app é recusado', async () => {
    const { cenario } = aberto;
    await expect(
      comoC((d) =>
        d.query(
          `INSERT INTO grupos (nome, slug, dia_semana, frequencia, horario, criado_por, criado_em)
           VALUES ('Racha Direto', 'racha-direto', 'sabado', 'semanal', '09:00', $1, now())`,
          [cenario.contaC],
        ),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });
});
