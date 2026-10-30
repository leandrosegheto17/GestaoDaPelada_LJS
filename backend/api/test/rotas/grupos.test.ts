import { criarGrupoResposta, grupoDetalhe, gruposResposta } from '@pelada/contrato';
import { env } from 'cloudflare:test';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, noBanco } from '../apoio/sessao-worker.ts';

// POST e GET /api/grupos (T29; GEL-01 a GEL-10, GEL-17, GEL-27, GEL-112). O Worker de teste conecta como pelada_app.

const { pedir } = cenarioDeAcesso();
const unico = () => crypto.randomUUID().slice(0, 8);
const valido = (nome = `Pelada ${unico()}`) => ({ nome, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' });

type Criado = { id: string; slug: string; linkPublico: string };

describe('POST /api/grupos', () => {
  it('201 com id, slug e link público de URL_PUBLICA; grupo, vínculo com financeiro, 6 habilidades e auditoria (GEL-01, GEL-02, GEL-10, GEL-17)', async () => {
    const s = await criarSessao();
    const nome = `Pelada de Quinta ${unico()}`;
    const r = await pedir('POST', '/api/grupos', valido(nome), { cookie: s.cookie });
    expect(r.status).toBe(201);
    expect(criarGrupoResposta.safeParse(r.corpo).success).toBe(true);
    const corpo = r.corpo as Criado;
    expect(corpo.slug).toBe(`pelada-de-quinta-${nome.slice(-8).toLowerCase()}`);
    expect(corpo.linkPublico).toBe(`${env.URL_PUBLICA}/g/${corpo.slug}`);

    const grupo = await comoOwner('SELECT nome, criado_por FROM grupos WHERE id = $1', [corpo.id]);
    expect(grupo).toEqual([{ nome, criado_por: s.contaId }]);
    const vinculo = await comoOwner('SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1', [
      corpo.id,
    ]);
    expect(vinculo).toEqual([{ conta_id: s.contaId, acessa_financeiro: true }]);
    const habilidades = await comoOwner<{ nome: string }>(
      'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
      [corpo.id],
    );
    expect(habilidades.map((h) => h.nome)).toEqual([
      'Visão de Jogo',
      'Passe',
      'Preparo Físico',
      'Drible',
      'Chute',
      'Desarme',
    ]);
    const auditoria = await comoOwner(
      "SELECT autor_conta_id FROM auditoria WHERE grupo_id = $1 AND acao = 'grupo_criado'",
      [corpo.id],
    );
    expect(auditoria).toEqual([{ autor_conta_id: s.contaId }]);
  });
});

describe('POST /api/grupos: slug (GEL-14, GEL-16)', () => {
  it('"Pelada de Quinta" duas vezes → pelada-de-quinta e pelada-de-quinta-2; renomear depois não muda o slug', async () => {
    const [a, b] = [await criarSessao(), await criarSessao()];
    const r1 = await pedir('POST', '/api/grupos', valido('Pelada de Quinta'), { cookie: a.cookie });
    const r2 = await pedir('POST', '/api/grupos', valido('Pelada de Quinta'), { cookie: b.cookie });
    expect([(r1.corpo as Criado).slug, (r2.corpo as Criado).slug]).toEqual(['pelada-de-quinta', 'pelada-de-quinta-2']);

    const id = (r1.corpo as Criado).id;
    // Renomeia como a admin (pelada_app); a rota de edição tem o próprio teste (T30).
    await noBanco(a.contaId, (db) =>
      db.updateTable('grupos').set({ nome: 'Outro Nome Qualquer' }).where('id', '=', id).execute(),
    );
    expect(await comoOwner('SELECT nome, slug FROM grupos WHERE id = $1', [id])).toEqual([
      { nome: 'Outro Nome Qualquer', slug: 'pelada-de-quinta' },
    ]);
  });
});

describe('POST /api/grupos: recusas', () => {
  it('sem sessão: 401 e nada criado (GEL-08)', async () => {
    const nome = `Sem Sessao ${unico()}`;
    const r = await pedir('POST', '/api/grupos', valido(nome));
    expect(r.status).toBe(401);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'sessao_expirada' } });
    expect(await comoOwner('SELECT 1 FROM grupos WHERE nome = $1', [nome])).toEqual([]);
  });

  it.each([
    ['slug', { slug: 'meu-slug' }],
    ['urlPublica', { urlPublica: 'https://x.invalid' }],
  ])('corpo com %s: 422 e nada criado (GEL-07)', async (campo, extra) => {
    const s = await criarSessao();
    const nome = `Com Extra ${unico()}`;
    const r = await pedir('POST', '/api/grupos', { ...valido(nome), ...extra }, { cookie: s.cookie });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos' } });
    expect(Object.keys((r.corpo as { erro: { campos: object } }).erro.campos)).toEqual(['corpo']);
    expect(campo).toBeTruthy();
    expect(await comoOwner('SELECT 1 FROM grupos WHERE nome = $1', [nome])).toEqual([]);
  });

  it.each([
    ['nome curto (2 após o trim)', { nome: '  AB  ' }, 'nome', 'O nome precisa ter de 3 a 60 caracteres.'],
    ['nome longo (61)', { nome: 'x'.repeat(61) }, 'nome', 'O nome precisa ter de 3 a 60 caracteres.'],
    ['dia da semana inválido', { diaSemana: 'feriado' }, 'diaSemana', 'Escolha o dia da semana.'],
    ['frequência inválida', { frequencia: 'diaria' }, 'frequencia', 'Escolha a frequência.'],
    ['horário ausente', { horario: undefined }, 'horario', 'Informe o horário.'],
    ['horário 24:00', { horario: '24:00' }, 'horario', 'Horário inválido.'],
    ['horário 7:30', { horario: '7:30' }, 'horario', 'Horário inválido.'],
  ])('%s: 422 com a mensagem no campo (GEL-03 a GEL-06)', async (_caso, troca, campo, mensagem) => {
    const s = await criarSessao();
    const corpo = { ...valido(), ...troca };
    const r = await pedir('POST', '/api/grupos', JSON.parse(JSON.stringify(corpo)), { cookie: s.cookie });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { [campo]: mensagem } } });
  });
});

describe('GET /api/grupos (GEL-27)', () => {
  it('lista os ativos com dia, frequência e horário; sem sessão, 401', async () => {
    const s = await criarSessao();
    const nome = `Lista ${unico()}`;
    const criado = (await pedir('POST', '/api/grupos', valido(nome), { cookie: s.cookie })).corpo as Criado;
    const r = await pedir('GET', '/api/grupos', undefined, { cookie: s.cookie });
    expect(r.status).toBe(200);
    expect(gruposResposta.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toEqual({
      ativos: [
        { id: criado.id, nome, slug: criado.slug, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
      ],
      arquivados: [],
    });
    expect((await pedir('GET', '/api/grupos')).status).toBe(401);
  });

  it('conta sem grupo: listas vazias', async () => {
    const s = await criarSessao();
    expect((await pedir('GET', '/api/grupos', undefined, { cookie: s.cookie })).corpo).toEqual({
      ativos: [],
      arquivados: [],
    });
  });
});

describe('GET /api/grupos: arquivados (GEL-25, GEL-27)', () => {
  it('a criadora vê o arquivado em arquivados; a outra admin não o vê em lista nenhuma', async () => {
    const criadora = await criarSessao();
    const nome = `Arquivado ${unico()}`;
    const criado = (await pedir('POST', '/api/grupos', valido(nome), { cookie: criadora.cookie })).corpo as Criado;
    const outra = await criarSessao({
      conta: criadora.contaId,
      grupo: criado.id,
      slug: criado.slug,
      jogador: '',
      habilidade: '',
      partida: '',
      lancamento: '',
    });
    await noBanco(criadora.contaId, (db) =>
      db
        .updateTable('grupos')
        .set({ arquivado_em: sql<Date>`now()` })
        .where('id', '=', criado.id)
        .execute(),
    );
    const daCriadora = await pedir('GET', '/api/grupos', undefined, { cookie: criadora.cookie });
    expect(daCriadora.corpo).toEqual({
      ativos: [],
      arquivados: [
        { id: criado.id, nome, slug: criado.slug, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
      ],
    });
    const daOutra = await pedir('GET', '/api/grupos', undefined, { cookie: outra.cookie });
    expect(daOutra.corpo).toEqual({ ativos: [], arquivados: [] });
  });
});

describe('a API cria o grupo como pelada_app (GEL-112)', () => {
  it('a conexão do Worker é a role pelada_app, sem BYPASSRLS', async () => {
    const papel = await noBanco(undefined, async (db) => {
      const { rows } = await sql<{ usuario: string; ignora: boolean }>`
        SELECT current_user AS usuario, rolbypassrls AS ignora FROM pg_roles WHERE rolname = current_user
      `.execute(db);
      return rows;
    });
    expect(papel).toEqual([{ usuario: 'pelada_app', ignora: false }]);
  });
});

describe('GET /api/grupos/:grupoId (GEL-20, GEL-21)', () => {
  it('devolve dados, link público, contagens e souCriador (verdadeiro só para a criadora)', async () => {
    const criadora = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido('Detalhe do Grupo'), { cookie: criadora.cookie }))
      .corpo as Criado;
    const r = await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: criadora.cookie });
    expect(r.status).toBe(200);
    expect(grupoDetalhe.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toEqual({
      id: criado.id,
      nome: 'Detalhe do Grupo',
      slug: criado.slug,
      linkPublico: `${env.URL_PUBLICA}/g/${criado.slug}`,
      diaSemana: 'quinta',
      frequencia: 'semanal',
      horario: '20:30',
      jogadoresAtivos: 0,
      habilidades: 6,
      admins: 1,
      souCriador: true,
    });

    // Outra admin, por convite: souCriador falso e dois admins.
    const outra = await criarSessao({
      conta: criadora.contaId,
      grupo: criado.id,
      slug: criado.slug,
      jogador: '',
      habilidade: '',
      partida: '',
      lancamento: '',
    });
    const visto = await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: outra.cookie });
    expect(visto.corpo).toMatchObject({ souCriador: false, admins: 2 });
  });

  it('conta jogadores ativos (com período aberto) e não os inativos', async () => {
    const s = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido(), { cookie: s.cookie })).corpo as Criado;
    await noBanco(s.contaId, async (db) => {
      for (const [apelido, fim] of [
        ['Ativo Um', null],
        ['Ativo Dois', null],
        ['Saiu', '2026-02-01'],
      ] as const) {
        const j = await db
          .insertInto('jogadores')
          .values({
            grupo_id: criado.id,
            apelido,
            criado_por: s.contaId,
            criado_em: sql<Date>`now()`,
            alterado_por: s.contaId,
            alterado_em: sql<Date>`now()`,
          })
          .returning('id')
          .executeTakeFirstOrThrow();
        await db
          .insertInto('periodos_ativos')
          .values({ grupo_id: criado.id, jogador_id: j.id, inicio: '2026-01-01', fim })
          .execute();
      }
    });
    const r = await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: s.cookie });
    expect(r.corpo).toMatchObject({ jogadoresAtivos: 2 });
  });

  it('conta sem vínculo: 404 no GET e no PATCH, e nada muda (GEL-21)', async () => {
    const dona = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido('Grupo Alheio'), { cookie: dona.cookie }))
      .corpo as Criado;
    const estranha = await criarSessao();
    const get = await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: estranha.cookie });
    const patch = await pedir('PATCH', `/api/grupos/${criado.id}`, valido('Invadido'), { cookie: estranha.cookie });
    expect([get.status, patch.status]).toEqual([404, 404]);
    expect(await comoOwner('SELECT nome FROM grupos WHERE id = $1', [criado.id])).toEqual([{ nome: 'Grupo Alheio' }]);
  });
});

describe('PATCH /api/grupos/:grupoId (GEL-16, GEL-18, GEL-19)', () => {
  it('válido: 200 com os dados novos e slug e link público inalterados', async () => {
    const s = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido('Antes da Edicao'), { cookie: s.cookie }))
      .corpo as Criado;
    const r = await pedir(
      'PATCH',
      `/api/grupos/${criado.id}`,
      { nome: '  Depois da Edicao  ', diaSemana: 'sabado', frequencia: 'quinzenal', horario: '09:15' },
      { cookie: s.cookie },
    );
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({
      id: criado.id,
      nome: 'Depois da Edicao',
      diaSemana: 'sabado',
      frequencia: 'quinzenal',
      horario: '09:15',
      slug: criado.slug,
      linkPublico: criado.linkPublico,
    });
  });

  it('slug no corpo: 422 e o grupo não muda (GEL-07, GEL-16)', async () => {
    const s = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido('Slug Fixo'), { cookie: s.cookie })).corpo as Criado;
    const r = await pedir(
      'PATCH',
      `/api/grupos/${criado.id}`,
      { ...valido('Slug Fixo 2'), slug: 'novo' },
      {
        cookie: s.cookie,
      },
    );
    expect(r.status).toBe(422);
    expect(await comoOwner('SELECT nome, slug FROM grupos WHERE id = $1', [criado.id])).toEqual([
      { nome: 'Slug Fixo', slug: criado.slug },
    ]);
  });

  it('campo inválido: 422 com a mesma mensagem da criação (GEL-19)', async () => {
    const s = await criarSessao();
    const criado = (await pedir('POST', '/api/grupos', valido(), { cookie: s.cookie })).corpo as Criado;
    const r = await pedir('PATCH', `/api/grupos/${criado.id}`, { ...valido(), nome: 'AB' }, { cookie: s.cookie });
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { campos: { nome: 'O nome precisa ter de 3 a 60 caracteres.' } } });
  });
});

/** Grupo criado pela criadora pela rota, com uma segunda admin por convite. */
async function grupoComDuasAdmins(nome: string) {
  const criadora = await criarSessao();
  const criado = (await pedir('POST', '/api/grupos', valido(nome), { cookie: criadora.cookie })).corpo as Criado;
  const outra = await criarSessao({
    conta: criadora.contaId,
    grupo: criado.id,
    slug: criado.slug,
    jogador: '',
    habilidade: '',
    partida: '',
    lancamento: '',
  });
  return { criadora, outra, criado };
}

const auditoriaDoGrupo = (grupoId: string, acao: string) =>
  comoOwner('SELECT autor_conta_id FROM auditoria WHERE grupo_id = $1 AND acao = $2', [grupoId, acao]);

describe('POST /api/grupos/:grupoId/arquivar e /reativar (GEL-22 a GEL-26, GEL-29)', () => {
  it('a não criadora recebe 403 so_quem_criou e nada muda (GEL-24)', async () => {
    const nome = `Arquivar Alheio ${unico()}`;
    const { outra, criado } = await grupoComDuasAdmins(nome);
    const r = await pedir(
      'POST',
      `/api/grupos/${criado.id}/arquivar`,
      { nomeConfirmacao: nome },
      { cookie: outra.cookie },
    );
    expect(r.status).toBe(403);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'so_quem_criou' } });
    expect(await comoOwner('SELECT arquivado_em FROM grupos WHERE id = $1', [criado.id])).toEqual([
      { arquivado_em: null },
    ]);
    const reativar = await pedir('POST', `/api/grupos/${criado.id}/reativar`, undefined, { cookie: outra.cookie });
    expect(reativar.status).toBe(403);
    expect(reativar.corpo).toMatchObject({ erro: { codigo: 'so_quem_criou' } });
  });

  it('nome errado: 422 com a mensagem no campo nomeConfirmacao e nada muda (GEL-23)', async () => {
    const nome = `Nome Certo ${unico()}`;
    const { criadora, criado } = await grupoComDuasAdmins(nome);
    for (const errado of [nome.toLowerCase(), ` ${nome}`, 'Outro']) {
      const r = await pedir(
        'POST',
        `/api/grupos/${criado.id}/arquivar`,
        { nomeConfirmacao: errado },
        { cookie: criadora.cookie },
      );
      expect(r.status).toBe(422);
      expect(r.corpo).toMatchObject({
        erro: { campos: { nomeConfirmacao: 'O nome digitado não confere com o nome do grupo.' } },
      });
    }
    expect(await comoOwner('SELECT arquivado_em FROM grupos WHERE id = $1', [criado.id])).toEqual([
      { arquivado_em: null },
    ]);
  });

  it('ciclo: a criadora arquiva (200 grupoDetalhe e auditoria); a outra recebe 404; PATCH da criadora 409; reativa', async () => {
    const nome = `Ciclo ${unico()}`;
    const { criadora, outra, criado } = await grupoComDuasAdmins(nome);

    const arquivar = await pedir(
      'POST',
      `/api/grupos/${criado.id}/arquivar`,
      { nomeConfirmacao: nome },
      { cookie: criadora.cookie },
    );
    expect(arquivar.status).toBe(200);
    expect(grupoDetalhe.safeParse(arquivar.corpo).success).toBe(true);
    expect(arquivar.corpo).toMatchObject({ id: criado.id, souCriador: true });
    expect(await auditoriaDoGrupo(criado.id, 'grupo_arquivado')).toEqual([{ autor_conta_id: criadora.contaId }]);

    expect((await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: outra.cookie })).status).toBe(404);
    const patch = await pedir('PATCH', `/api/grupos/${criado.id}`, valido('Mudou'), { cookie: criadora.cookie });
    expect(patch.status).toBe(409);
    expect(patch.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });

    const reativar = await pedir('POST', `/api/grupos/${criado.id}/reativar`, undefined, { cookie: criadora.cookie });
    expect(reativar.status).toBe(200);
    expect(grupoDetalhe.safeParse(reativar.corpo).success).toBe(true);
    expect(await auditoriaDoGrupo(criado.id, 'grupo_reativado')).toEqual([{ autor_conta_id: criadora.contaId }]);
    expect((await pedir('GET', `/api/grupos/${criado.id}`, undefined, { cookie: outra.cookie })).status).toBe(200);
  });

  it('repetir arquivar ou reativar: 200 sem auditoria nova (GEL-29)', async () => {
    const nome = `Repetir ${unico()}`;
    const { criadora, criado } = await grupoComDuasAdmins(nome);
    const arquivar = () =>
      pedir('POST', `/api/grupos/${criado.id}/arquivar`, { nomeConfirmacao: nome }, { cookie: criadora.cookie });
    const reativar = () => pedir('POST', `/api/grupos/${criado.id}/reativar`, undefined, { cookie: criadora.cookie });

    expect((await reativar()).status).toBe(200);
    expect(await auditoriaDoGrupo(criado.id, 'grupo_reativado')).toEqual([]);
    expect((await arquivar()).status).toBe(200);
    expect((await arquivar()).status).toBe(200);
    expect(await auditoriaDoGrupo(criado.id, 'grupo_arquivado')).toHaveLength(1);
    expect((await reativar()).status).toBe(200);
    expect((await reativar()).status).toBe(200);
    expect(await auditoriaDoGrupo(criado.id, 'grupo_reativado')).toHaveLength(1);
  });

  it('sem vínculo: 404 em arquivar e reativar', async () => {
    const nome = `Sem Vinculo ${unico()}`;
    const { criado } = await grupoComDuasAdmins(nome);
    const estranha = await criarSessao();
    const a = await pedir(
      'POST',
      `/api/grupos/${criado.id}/arquivar`,
      { nomeConfirmacao: nome },
      { cookie: estranha.cookie },
    );
    const r = await pedir('POST', `/api/grupos/${criado.id}/reativar`, undefined, { cookie: estranha.cookie });
    expect([a.status, r.status]).toEqual([404, 404]);
  });
});
