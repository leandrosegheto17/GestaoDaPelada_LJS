import { jogadorDetalhe, listaJogadores } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { relogioFixo } from '../../src/infraestrutura/relogio/index.ts';
import { cenarioDeAcesso, type Extras } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Rotas do elenco (T36, T37; GEL-31 a GEL-46, GEL-84, GEL-85, GEL-106). O Worker de teste conecta como pelada_app.

const { pedir } = cenarioDeAcesso();
// 22h de 31/12 em São Paulo: em UTC já é 01/01/2027. A rota precisa usar o "hoje" de São Paulo (AD-015).
const RELOGIO = relogioFixo('2026-12-31', '22:00');
const HOJE = '2026-12-31';
const unico = () => crypto.randomUUID().slice(0, 8);

const JOGADOR = { apelido: 'Toninho', anoNascimento: 1990, posicao: 'meia' } as const;

interface Grupo {
  s: SessaoDeTeste;
  id: string;
}

async function grupoNovo(): Promise<Grupo> {
  const s = await criarSessao();
  const r = await pedir(
    'POST',
    '/api/grupos',
    { nome: `Elenco ${unico()}`, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
    { cookie: s.cookie },
  );
  if (r.status !== 201) throw new Error(`criar grupo: ${r.status}`);
  return { s, id: (r.corpo as { id: string }).id };
}

const comRelogio = (g: Grupo, extras: Extras = {}): Extras => ({ cookie: g.s.cookie, relogio: RELOGIO, ...extras });

async function cadastrar(g: Grupo, corpo: object = JOGADOR): Promise<{ id: string }> {
  const r = await pedir('POST', `/api/grupos/${g.id}/jogadores`, corpo, comRelogio(g));
  if (r.status !== 201) throw new Error(`cadastrar: ${r.status} ${r.texto}`);
  return r.corpo as { id: string };
}

const jogadoresDoGrupo = (grupo: string) =>
  comoOwner<{ apelido: string }>('SELECT apelido FROM jogadores WHERE grupo_id = $1 ORDER BY apelido', [grupo]);

describe('POST /api/grupos/:grupoId/jogadores (GEL-31 a GEL-40)', () => {
  it('válido: 201 com a ficha; sem data de entrada, o hoje de São Paulo (às 22h de 31/12)', async () => {
    const g = await grupoNovo();
    const r = await pedir('POST', `/api/grupos/${g.id}/jogadores`, JOGADOR, comRelogio(g));
    expect(r.status).toBe(201);
    expect(jogadorDetalhe.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toMatchObject({
      apelido: 'Toninho',
      anoNascimento: 1990,
      posicao: 'meia',
      telefone: null,
      pontuacaoInicial: 0,
      situacao: 'ativo',
      desde: HOJE,
      inicioPontuacao: HOJE,
      nivel: 550,
      semNota: true,
      periodos: [{ inicio: HOJE, fim: null }],
    });
    expect((r.corpo as { notas: unknown[] }).notas).toHaveLength(6);
  });

  it('data de entrada informada, telefone com máscara (guardado só com os dígitos) e pontuação', async () => {
    const g = await grupoNovo();
    const corpo = { ...JOGADOR, telefone: '(11) 98765-4321', pontuacaoInicial: 9999, dataEntrada: '2026-03-02' };
    const r = await pedir('POST', `/api/grupos/${g.id}/jogadores`, corpo, comRelogio(g));
    expect(r.status).toBe(201);
    expect(r.corpo).toMatchObject({
      telefone: '11987654321',
      pontuacaoInicial: 9999,
      inicioPontuacao: '2026-03-02',
      periodos: [{ inicio: '2026-03-02', fim: null }],
    });
  });

  it('data de entrada no futuro de São Paulo (01/01/2027, que já é hoje em UTC): 422 no campo dataEntrada', async () => {
    const g = await grupoNovo();
    const r = await pedir(
      'POST',
      `/api/grupos/${g.id}/jogadores`,
      { ...JOGADOR, dataEntrada: '2027-01-01' },
      comRelogio(g),
    );
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({
      erro: { codigo: 'dados_invalidos', campos: { dataEntrada: 'A data não pode ser no futuro.' } },
    });
    expect(await jogadoresDoGrupo(g.id)).toEqual([]);
  });

  const APELIDO = 'O apelido precisa ter de 2 a 30 caracteres.';
  const ANO = 'O ano precisa estar entre 1940 e 2016.';
  const TELEFONE = 'Informe o telefone como (DD) 9XXXX-XXXX.';
  const PONTUACAO = 'Informe um número inteiro de 0 a 9999.';
  it.each([
    ['apelido com 1 caractere após o trim', { apelido: '  A  ' }, 'apelido', APELIDO],
    ['apelido com 31 caracteres', { apelido: 'x'.repeat(31) }, 'apelido', APELIDO],
    ['ano ausente', { anoNascimento: undefined }, 'anoNascimento', ANO],
    ['ano 1939', { anoNascimento: 1939 }, 'anoNascimento', ANO],
    ['ano 2017 (hoje − 9)', { anoNascimento: 2017 }, 'anoNascimento', ANO],
    ['ano não inteiro', { anoNascimento: 1990.5 }, 'anoNascimento', ANO],
    ['posição fora da lista', { posicao: 'defensor' }, 'posicao', 'Escolha a posição.'],
    ['telefone sem o 9', { telefone: '(11) 8765-4321' }, 'telefone', TELEFONE],
    ['telefone com DDD 0', { telefone: '01987654321' }, 'telefone', TELEFONE],
    ['pontuação −1', { pontuacaoInicial: -1 }, 'pontuacaoInicial', PONTUACAO],
    ['pontuação 10000', { pontuacaoInicial: 10000 }, 'pontuacaoInicial', PONTUACAO],
    ['pontuação 1,5', { pontuacaoInicial: 1.5 }, 'pontuacaoInicial', PONTUACAO],
    ['campo desconhecido', { apelidoAntigo: 'x' }, 'corpo', expect.any(String)],
  ])('%s: 422 com a mensagem no campo e nada criado', async (_caso, troca, campo, mensagem) => {
    const g = await grupoNovo();
    const corpo = JSON.parse(JSON.stringify({ ...JOGADOR, ...troca }));
    const r = await pedir('POST', `/api/grupos/${g.id}/jogadores`, corpo, comRelogio(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { [campo]: mensagem } } });
    expect(await jogadoresDoGrupo(g.id)).toEqual([]);
  });

  it('ano 2016 (hoje − 10) e 1940 são aceitos', async () => {
    const g = await grupoNovo();
    for (const [apelido, ano] of [
      ['Novo', 2016],
      ['Velho', 1940],
    ] as const) {
      const r = await pedir(
        'POST',
        `/api/grupos/${g.id}/jogadores`,
        { ...JOGADOR, apelido, anoNascimento: ano },
        comRelogio(g),
      );
      expect(r.status).toBe(201);
    }
  });

  it('apelido repetido em outra caixa: 422 no campo apelido (GEL-35)', async () => {
    const g = await grupoNovo();
    await cadastrar(g);
    const r = await pedir('POST', `/api/grupos/${g.id}/jogadores`, { ...JOGADOR, apelido: 'TONINHO' }, comRelogio(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({
      erro: { codigo: 'dados_invalidos', campos: { apelido: 'Já existe um jogador com esse apelido neste grupo.' } },
    });
    expect(await jogadoresDoGrupo(g.id)).toEqual([{ apelido: 'Toninho' }]);
  });
});

describe('GET /api/grupos/:grupoId/jogadores (GEL-46, GEL-50)', () => {
  it('devolve ativos e inativos com situação, desde e nível', async () => {
    const g = await grupoNovo();
    const beto = await cadastrar(g, { ...JOGADOR, apelido: 'Beto', posicao: 'goleiro', dataEntrada: '2026-01-10' });
    await cadastrar(g, { ...JOGADOR, apelido: 'álvaro', dataEntrada: '2026-02-01' });
    await comoOwner("UPDATE periodos_ativos SET fim = '2026-06-30' WHERE jogador_id = $1", [beto.id]);
    const habilidades = await comoOwner<{ id: string }>(
      'SELECT id FROM habilidades WHERE grupo_id = $1 ORDER BY ordem LIMIT 2',
      [g.id],
    );
    for (const [i, valor] of [8, 7].entries()) {
      await comoOwner('INSERT INTO notas (grupo_id, jogador_id, habilidade_id, valor) VALUES ($1, $2, $3, $4)', [
        g.id,
        beto.id,
        habilidades[i]?.id,
        valor,
      ]);
    }
    const r = await pedir('GET', `/api/grupos/${g.id}/jogadores`, undefined, comRelogio(g));
    expect(r.status).toBe(200);
    expect(listaJogadores.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toEqual({
      jogadores: [
        {
          id: expect.any(String),
          apelido: 'álvaro',
          posicao: 'meia',
          situacao: 'ativo',
          desde: '2026-02-01',
          nivel: 550,
          semNota: true,
        },
        {
          id: beto.id,
          apelido: 'Beto',
          posicao: 'goleiro',
          situacao: 'inativo',
          desde: '2026-06-30',
          nivel: 750,
          semNota: false,
        },
      ],
    });
  });
});

describe('jogadores: sessão, vínculo e grupo arquivado (GEL-08, GEL-21, GEL-26, GEL-107)', () => {
  it('sem sessão: 401 no GET e no POST, e nada criado', async () => {
    const g = await grupoNovo();
    const get = await pedir('GET', `/api/grupos/${g.id}/jogadores`);
    const post = await pedir('POST', `/api/grupos/${g.id}/jogadores`, JOGADOR);
    expect([get.status, post.status]).toEqual([401, 401]);
    expect(await jogadoresDoGrupo(g.id)).toEqual([]);
  });

  it('grupo de outra conta: 404 no GET e no POST, e nada criado', async () => {
    const g = await grupoNovo();
    await cadastrar(g);
    const estranho = await grupoNovo();
    const get = await pedir('GET', `/api/grupos/${g.id}/jogadores`, undefined, comRelogio(estranho));
    const post = await pedir(
      'POST',
      `/api/grupos/${g.id}/jogadores`,
      { ...JOGADOR, apelido: 'Intruso' },
      comRelogio(estranho),
    );
    expect([get.status, post.status]).toEqual([404, 404]);
    expect(get.corpo).toMatchObject({ erro: { codigo: 'nao_encontrado' } });
    expect(await jogadoresDoGrupo(g.id)).toEqual([{ apelido: 'Toninho' }]);
  });

  it('grupo arquivado: POST 409 grupo_arquivado e nada criado; GET continua 200', async () => {
    const g = await grupoNovo();
    await comoOwner('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [g.id]);
    const post = await pedir('POST', `/api/grupos/${g.id}/jogadores`, JOGADOR, comRelogio(g));
    expect(post.status).toBe(409);
    expect(post.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
    expect((await pedir('GET', `/api/grupos/${g.id}/jogadores`, undefined, comRelogio(g))).status).toBe(200);
    expect(await jogadoresDoGrupo(g.id)).toEqual([]);
  });
});
