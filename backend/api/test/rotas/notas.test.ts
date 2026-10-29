import { notaResposta } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Rota de notas (T49; GEL-97 a GEL-100, GEL-105, GEL-106). O Worker de teste conecta como pelada_app.

const { pedir } = cenarioDeAcesso();
const unico = () => crypto.randomUUID().slice(0, 8);

interface Grupo {
  s: SessaoDeTeste;
  id: string;
  habilidades: string[];
  /** Jogador ativo. */
  jogador: string;
}

async function novoJogador(grupo: string, conta: string, fim: string | null): Promise<string> {
  const [j] = await comoOwner<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, inicio_pontuacao, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, '2026-01-01', $3, now(), $3, now()) RETURNING id`,
    [grupo, `J${unico()}`, conta],
  );
  await comoOwner("INSERT INTO periodos_ativos (grupo_id, jogador_id, inicio, fim) VALUES ($1, $2, '2026-01-01', $3)", [
    grupo,
    j!.id,
    fim,
  ]);
  return j!.id;
}

async function grupoNovo(): Promise<Grupo> {
  const s = await criarSessao();
  const r = await pedir(
    'POST',
    '/api/grupos',
    { nome: `Notas ${unico()}`, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
    { cookie: s.cookie },
  );
  if (r.status !== 201) throw new Error(`criar grupo: ${r.status}`);
  const id = (r.corpo as { id: string }).id;
  const hs = await comoOwner<{ id: string }>('SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem', [id]);
  return { s, id, habilidades: hs.map((h) => h.id), jogador: await novoJogador(id, s.contaId, null) };
}

const daConta = (g: Grupo) => ({ cookie: g.s.cookie });
const url = (grupo: string, jogador: string, habilidade: string) =>
  `/api/grupos/${grupo}/jogadores/${jogador}/notas/${habilidade}`;

const notasDe = (jogador: string) =>
  comoOwner<{ habilidade_id: string; valor: number }>(
    'SELECT habilidade_id, valor FROM notas WHERE jogador_id = $1 ORDER BY habilidade_id',
    [jogador],
  );

describe('PUT /api/grupos/:grupoId/jogadores/:id/notas/:habilidadeId (GEL-97 a GEL-99)', () => {
  it('nota 8: 200 com { nivel, semNota } no formato do contrato; a nota fica gravada', async () => {
    const g = await grupoNovo();
    const h = g.habilidades[0]!;
    const r = await pedir('PUT', url(g.id, g.jogador, h), { nota: 8 }, daConta(g));
    expect(r.status).toBe(200);
    expect(notaResposta.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toEqual({ nivel: 800, semNota: false });
    expect(await notasDe(g.jogador)).toEqual([{ habilidade_id: h, valor: 8 }]);
  });

  it('salvar de novo substitui; 8, 7, 6, 7, 8, 5 nas 6 habilidades → nível 683', async () => {
    const g = await grupoNovo();
    await pedir('PUT', url(g.id, g.jogador, g.habilidades[0]!), { nota: 1 }, daConta(g));
    let ultima: unknown;
    for (const [i, nota] of [8, 7, 6, 7, 8, 5].entries()) {
      ultima = (await pedir('PUT', url(g.id, g.jogador, g.habilidades[i]!), { nota }, daConta(g))).corpo;
    }
    expect(ultima).toEqual({ nivel: 683, semNota: false });
    expect(await notasDe(g.jogador)).toHaveLength(6);
  });

  it('null: 200 e apaga; null sem nota gravada: 200 com 550 e semNota (GEL-98)', async () => {
    const g = await grupoNovo();
    const h = g.habilidades[1]!;
    await pedir('PUT', url(g.id, g.jogador, h), { nota: 9 }, daConta(g));
    const apagar = await pedir('PUT', url(g.id, g.jogador, h), { nota: null }, daConta(g));
    expect(apagar.status).toBe(200);
    expect(apagar.corpo).toEqual({ nivel: 550, semNota: true });
    expect(await notasDe(g.jogador)).toEqual([]);
    const deNovo = await pedir('PUT', url(g.id, g.jogador, h), { nota: null }, daConta(g));
    expect(deNovo.status).toBe(200);
    expect(deNovo.corpo).toEqual({ nivel: 550, semNota: true });
  });

  it.each([
    ['0', { nota: 0 }],
    ['11', { nota: 11 }],
    ['5,5', { nota: 5.5 }],
    ['texto', { nota: '8' }],
    ['ausente', {}],
    ['campo desconhecido', { nota: 8, peso: 1 }],
  ])('nota %s: 422 no campo nota (ou corpo) e nada gravado (GEL-99)', async (caso, corpo) => {
    const g = await grupoNovo();
    const r = await pedir('PUT', url(g.id, g.jogador, g.habilidades[0]!), corpo, daConta(g));
    expect(r.status).toBe(422);
    const campo = caso === 'campo desconhecido' ? 'corpo' : 'nota';
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { [campo]: expect.any(String) } } });
    expect(await notasDe(g.jogador)).toEqual([]);
  });

  it('jogador inativo: 200 e a nota fica gravada (GEL-105)', async () => {
    const g = await grupoNovo();
    const inativo = await novoJogador(g.id, g.s.contaId, '2026-03-01');
    const r = await pedir('PUT', url(g.id, inativo, g.habilidades[2]!), { nota: 4 }, daConta(g));
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ nivel: 400, semNota: false });
    expect(await notasDe(inativo)).toEqual([{ habilidade_id: g.habilidades[2], valor: 4 }]);
  });
});

describe('notas: ids de outro grupo, sessão, vínculo e grupo arquivado (GEL-100, GEL-21, GEL-26)', () => {
  it('jogador de outro grupo: 404 e nada gravado', async () => {
    const g = await grupoNovo();
    const outro = await grupoNovo();
    const r = await pedir('PUT', url(g.id, outro.jogador, g.habilidades[0]!), { nota: 8 }, daConta(g));
    expect(r.status).toBe(404);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
    expect(await notasDe(outro.jogador)).toEqual([]);
  });

  it('habilidade de outro grupo: 404 e nada gravado', async () => {
    const g = await grupoNovo();
    const outro = await grupoNovo();
    const r = await pedir('PUT', url(g.id, g.jogador, outro.habilidades[0]!), { nota: 8 }, daConta(g));
    expect(r.status).toBe(404);
    expect(await notasDe(g.jogador)).toEqual([]);
  });

  it('ids inexistentes ou inválidos: 404', async () => {
    const g = await grupoNovo();
    const casos = [
      url(g.id, crypto.randomUUID(), g.habilidades[0]!),
      url(g.id, g.jogador, crypto.randomUUID()),
      url(g.id, 'nao-e-uuid', g.habilidades[0]!),
      url(g.id, g.jogador, 'nao-e-uuid'),
    ];
    for (const caminho of casos) {
      expect((await pedir('PUT', caminho, { nota: 8 }, daConta(g))).status).toBe(404);
    }
    expect(await notasDe(g.jogador)).toEqual([]);
  });

  it('sem sessão: 401; conta sem vínculo: 404; nada gravado', async () => {
    const g = await grupoNovo();
    const estranho = await grupoNovo();
    const semSessao = await pedir('PUT', url(g.id, g.jogador, g.habilidades[0]!), { nota: 8 });
    const semVinculo = await pedir('PUT', url(g.id, g.jogador, g.habilidades[0]!), { nota: 8 }, daConta(estranho));
    expect([semSessao.status, semVinculo.status]).toEqual([401, 404]);
    expect(await notasDe(g.jogador)).toEqual([]);
  });

  it('grupo arquivado: 409 grupo_arquivado e nada gravado', async () => {
    const g = await grupoNovo();
    await comoOwner('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [g.id]);
    const r = await pedir('PUT', url(g.id, g.jogador, g.habilidades[0]!), { nota: 8 }, daConta(g));
    expect(r.status).toBe(409);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
    expect(await notasDe(g.jogador)).toEqual([]);
  });
});
