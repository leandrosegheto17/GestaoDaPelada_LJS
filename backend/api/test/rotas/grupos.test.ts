import { criarGrupoResposta, gruposResposta } from '@pelada/contrato';
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
