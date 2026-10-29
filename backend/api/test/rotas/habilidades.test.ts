import { habilidadeItem, listaHabilidades } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Rotas de habilidades (T47; GEL-88 a GEL-93, GEL-96, GEL-106). O Worker de teste conecta como pelada_app.

const { pedir } = cenarioDeAcesso();
const unico = () => crypto.randomUUID().slice(0, 8);
const INICIAIS = ['Visão de Jogo', 'Passe', 'Preparo Físico', 'Drible', 'Chute', 'Desarme'];
const MENSAGEM_TAMANHO = 'O nome precisa ter de 2 a 30 caracteres.';
const MENSAGEM_REPETIDO = 'Já existe uma habilidade com esse nome.';

interface Grupo {
  s: SessaoDeTeste;
  id: string;
}

async function grupoNovo(): Promise<Grupo> {
  const s = await criarSessao();
  const r = await pedir(
    'POST',
    '/api/grupos',
    { nome: `Habilidades ${unico()}`, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
    { cookie: s.cookie },
  );
  if (r.status !== 201) throw new Error(`criar grupo: ${r.status}`);
  return { s, id: (r.corpo as { id: string }).id };
}

const daConta = (g: Grupo) => ({ cookie: g.s.cookie });

const habilidadesNoBanco = (grupo: string) =>
  comoOwner<{ id: string; nome: string }>('SELECT id, nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem', [
    grupo,
  ]);

async function idDe(grupo: string, nome: string): Promise<string> {
  const h = (await habilidadesNoBanco(grupo)).find((x) => x.nome === nome);
  if (!h) throw new Error(`sem a habilidade ${nome}`);
  return h.id;
}

async function jogadorComNota(grupo: string, conta: string, habilidade: string, valor: number): Promise<string> {
  const [j] = await comoOwner<{ id: string }>(
    `INSERT INTO jogadores (grupo_id, apelido, criado_por, criado_em, alterado_por, alterado_em)
     VALUES ($1, $2, $3, now(), $3, now()) RETURNING id`,
    [grupo, `J${unico()}`, conta],
  );
  await comoOwner('INSERT INTO notas (grupo_id, jogador_id, habilidade_id, valor) VALUES ($1, $2, $3, $4)', [
    grupo,
    j!.id,
    habilidade,
    valor,
  ]);
  return j!.id;
}

const notasDaHabilidade = (habilidade: string) =>
  comoOwner<{ valor: number }>('SELECT valor FROM notas WHERE habilidade_id = $1 ORDER BY valor', [habilidade]);

describe('GET /api/grupos/:grupoId/habilidades (GEL-88)', () => {
  it('200 com as habilidades na ordem de cadastro, no formato do contrato', async () => {
    const g = await grupoNovo();
    const r = await pedir('GET', `/api/grupos/${g.id}/habilidades`, undefined, daConta(g));
    expect(r.status).toBe(200);
    expect(listaHabilidades.safeParse(r.corpo).success).toBe(true);
    expect((r.corpo as { habilidades: Array<{ nome: string }> }).habilidades.map((h) => h.nome)).toEqual(INICIAIS);
  });
});

describe('POST /api/grupos/:grupoId/habilidades (GEL-89 a GEL-91)', () => {
  it('válido: 201 com id e nome (sem os espaços das pontas); vai ao fim da ordem', async () => {
    const g = await grupoNovo();
    const r = await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: '  Cabeceio  ' }, daConta(g));
    expect(r.status).toBe(201);
    expect(habilidadeItem.safeParse(r.corpo).success).toBe(true);
    const banco = await habilidadesNoBanco(g.id);
    expect(r.corpo).toEqual({ id: banco.at(-1)!.id, nome: 'Cabeceio' });
    expect(banco.map((h) => h.nome)).toEqual([...INICIAIS, 'Cabeceio']);
  });

  it.each([
    ['1 caractere depois do trim', '  A  '],
    ['31 caracteres', 'x'.repeat(31)],
  ])('nome com %s: 422 do GEL-90 no campo nome e nada criado', async (_caso, nome) => {
    const g = await grupoNovo();
    const r = await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome }, daConta(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { nome: MENSAGEM_TAMANHO } } });
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });

  it('nome de 2 e de 30 caracteres: 201 (limites aceitos)', async () => {
    const g = await grupoNovo();
    for (const nome of ['Ab', 'y'.repeat(30)]) {
      expect((await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome }, daConta(g))).status).toBe(201);
    }
  });

  it('"drible" com "Drible" já cadastrada: 422 do GEL-91 no campo nome e nada criado', async () => {
    const g = await grupoNovo();
    const r = await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'drible' }, daConta(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { nome: MENSAGEM_REPETIDO } } });
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });

  it('campo desconhecido: 422', async () => {
    const g = await grupoNovo();
    const r = await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'Cabeceio', ordem: 1 }, daConta(g));
    expect(r.status).toBe(422);
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });
});

describe('PATCH /api/grupos/:grupoId/habilidades/:id (GEL-92, GEL-96)', () => {
  it('válido: 200 com o nome novo; notas e posição na ordem continuam', async () => {
    const g = await grupoNovo();
    const drible = await idDe(g.id, 'Drible');
    await jogadorComNota(g.id, g.s.contaId, drible, 8);
    const r = await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${drible}`, { nome: 'Drible curto' }, daConta(g));
    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({ id: drible, nome: 'Drible curto' });
    const banco = await habilidadesNoBanco(g.id);
    expect(banco[3]).toEqual({ id: drible, nome: 'Drible curto' });
    expect(await notasDaHabilidade(drible)).toEqual([{ valor: 8 }]);
  });

  it('nome de outra habilidade: 422 do GEL-91; nome com 1 caractere: 422 do GEL-90; nada muda', async () => {
    const g = await grupoNovo();
    const drible = await idDe(g.id, 'Drible');
    const repetido = await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${drible}`, { nome: 'CHUTE' }, daConta(g));
    const curto = await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${drible}`, { nome: 'x' }, daConta(g));
    expect(repetido.status).toBe(422);
    expect(repetido.corpo).toMatchObject({ erro: { campos: { nome: MENSAGEM_REPETIDO } } });
    expect(curto.status).toBe(422);
    expect(curto.corpo).toMatchObject({ erro: { campos: { nome: MENSAGEM_TAMANHO } } });
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });

  it('habilidade de outro grupo, inexistente ou id inválido: 404 e a de lá não muda', async () => {
    const g = await grupoNovo();
    const outro = await grupoNovo();
    const alheia = await idDe(outro.id, 'Passe');
    for (const id of [alheia, crypto.randomUUID(), 'nao-e-uuid']) {
      const r = await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${id}`, { nome: 'Invasão' }, daConta(g));
      expect(r.status).toBe(404);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
    }
    expect((await habilidadesNoBanco(outro.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });
});

describe('DELETE /api/grupos/:grupoId/habilidades/:id (GEL-93, GEL-96)', () => {
  it('204: apaga a habilidade e as notas dela, e audita habilidade_excluida', async () => {
    const g = await grupoNovo();
    const chute = await idDe(g.id, 'Chute');
    await jogadorComNota(g.id, g.s.contaId, chute, 7);
    await jogadorComNota(g.id, g.s.contaId, chute, 9);
    const r = await pedir('DELETE', `/api/grupos/${g.id}/habilidades/${chute}`, undefined, daConta(g));
    expect(r.status).toBe(204);
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS.filter((n) => n !== 'Chute'));
    expect(await notasDaHabilidade(chute)).toEqual([]);
    expect(
      await comoOwner("SELECT entidade_id FROM auditoria WHERE grupo_id = $1 AND acao = 'habilidade_excluida'", [g.id]),
    ).toEqual([{ entidade_id: chute }]);
  });

  it('habilidade de outro grupo, inexistente ou id inválido: 404 e nada apagado', async () => {
    const g = await grupoNovo();
    const outro = await grupoNovo();
    const alheia = await idDe(outro.id, 'Chute');
    await jogadorComNota(outro.id, outro.s.contaId, alheia, 6);
    for (const id of [alheia, crypto.randomUUID(), 'nao-e-uuid']) {
      const r = await pedir('DELETE', `/api/grupos/${g.id}/habilidades/${id}`, undefined, daConta(g));
      expect(r.status).toBe(404);
    }
    expect((await habilidadesNoBanco(outro.id)).map((h) => h.nome)).toEqual(INICIAIS);
    expect(await notasDaHabilidade(alheia)).toEqual([{ valor: 6 }]);
  });
});

describe('habilidades: sessão, vínculo e grupo arquivado (GEL-21, GEL-26, GEL-107)', () => {
  it('sem sessão: 401 nos quatro métodos e nada muda', async () => {
    const g = await grupoNovo();
    const passe = await idDe(g.id, 'Passe');
    const rs = [
      await pedir('GET', `/api/grupos/${g.id}/habilidades`),
      await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'Cabeceio' }),
      await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${passe}`, { nome: 'Lançamento' }),
      await pedir('DELETE', `/api/grupos/${g.id}/habilidades/${passe}`),
    ];
    expect(rs.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });

  it('conta sem vínculo com o grupo: 404 nos quatro métodos e nada muda', async () => {
    const g = await grupoNovo();
    const estranho = await grupoNovo();
    const passe = await idDe(g.id, 'Passe');
    const rs = [
      await pedir('GET', `/api/grupos/${g.id}/habilidades`, undefined, daConta(estranho)),
      await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'Cabeceio' }, daConta(estranho)),
      await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${passe}`, { nome: 'Lançamento' }, daConta(estranho)),
      await pedir('DELETE', `/api/grupos/${g.id}/habilidades/${passe}`, undefined, daConta(estranho)),
    ];
    expect(rs.map((r) => r.status)).toEqual([404, 404, 404, 404]);
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });

  it('grupo arquivado: POST, PATCH e DELETE 409 grupo_arquivado e nada muda; GET continua 200', async () => {
    const g = await grupoNovo();
    const passe = await idDe(g.id, 'Passe');
    await comoOwner('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [g.id]);
    const escritas = [
      await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'Cabeceio' }, daConta(g)),
      await pedir('PATCH', `/api/grupos/${g.id}/habilidades/${passe}`, { nome: 'Lançamento' }, daConta(g)),
      await pedir('DELETE', `/api/grupos/${g.id}/habilidades/${passe}`, undefined, daConta(g)),
    ];
    for (const r of escritas) {
      expect(r.status).toBe(409);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
    }
    expect((await pedir('GET', `/api/grupos/${g.id}/habilidades`, undefined, daConta(g))).status).toBe(200);
    expect((await habilidadesNoBanco(g.id)).map((h) => h.nome)).toEqual(INICIAIS);
  });
});
