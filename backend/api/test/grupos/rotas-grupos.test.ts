import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MENSAGEM_CORRIJA_CAMPOS,
  MENSAGEM_DIA_SEMANA,
  MENSAGEM_FREQUENCIA,
  MENSAGEM_HORARIO_AUSENTE,
  MENSAGEM_HORARIO_INVALIDO,
  MENSAGEM_NOME_GRUPO,
} from '@pelada/contrato';
import { linkPublico } from '../../src/entrada/rotas/grupos.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';

/**
 * `POST` e `GET /api/grupos` (T28; GEL-01, GEL-03 a GEL-10, GEL-17, GEL-27), com o app real como `pelada_app` contra o
 * cenário de grupos (C criadora de G, O outra admin, B só de H).
 */

let aberto: CenarioGruposAberto;

const VALIDO = {
  nome: 'Pelada das Rotas',
  diaSemana: 'terca',
  frequencia: 'semanal',
  horario: '19:00',
} as const;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function gruposComNome(nome: string): Promise<number> {
  const r = await aberto.db.query('SELECT 1 FROM grupos WHERE nome = $1', [nome]);
  return r.rowCount ?? 0;
}

async function auditoriaDe(grupo: string): Promise<Array<{ acao: string; autor: string }>> {
  const r = await aberto.db.query<{ acao: string; autor: string }>(
    'SELECT acao, autor_conta_id AS autor FROM auditoria WHERE grupo_id = $1 ORDER BY momento, id',
    [grupo],
  );
  return r.rows;
}

interface Corpo422 {
  erro: string;
  codigo: string;
  campos: string[];
  mensagens: Record<string, string>;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
});

describe('POST /api/grupos', () => {
  it.each(['https://pelada.exemplo.test', 'https://outra.exemplo.test/'])(
    'GEL-01, GEL-17: 201 com id, slug e o link montado de URL_PUBLICA = %s',
    async (url) => {
      const { cenario } = aberto;
      const nome = `Pelada do Link ${url.length}`;
      const pedir = cliente(aberto.url, { URL_PUBLICA: url });
      const r = await pedir('/grupos', {
        sessao: await sessao(cenario.contaB),
        corpo: { ...VALIDO, nome },
      });
      expect(r.status).toBe(201);
      const corpo = (await r.json()) as { id: string; slug: string; linkPublico: string };
      expect(Object.keys(corpo).sort()).toEqual(['id', 'linkPublico', 'slug']);
      expect(corpo.linkPublico).toBe(`${url.replace(/\/$/, '')}/g/${corpo.slug}`);
      expect(corpo.linkPublico).not.toContain('//g/');
    },
  );

  it('GEL-01: o grupo nasce com criado_por, vínculo com financeiro e as 6 habilidades', async () => {
    const { cenario } = aberto;
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', {
      sessao: await sessao(cenario.contaB),
      corpo: { ...VALIDO, nome: 'Pelada Completa' },
    });
    expect(r.status).toBe(201);
    const { id } = (await r.json()) as { id: string };
    const g = await aberto.db.query('SELECT criado_por FROM grupos WHERE id = $1', [id]);
    expect(g.rows[0]?.criado_por).toBe(cenario.contaB);
    const v = await aberto.db.query(
      'SELECT conta_id, acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1',
      [id],
    );
    expect(v.rows).toEqual([{ conta_id: cenario.contaB, acessa_financeiro: true }]);
    const h = await aberto.db.query(
      'SELECT nome FROM habilidades WHERE grupo_id = $1 ORDER BY ordem',
      [id],
    );
    expect(h.rows.map((l) => l.nome)).toEqual([
      'Visão de Jogo',
      'Passe',
      'Preparo Físico',
      'Drible',
      'Chute',
      'Desarme',
    ]);
  });

  it('GEL-10: no sucesso há grupo_criado com a conta autora', async () => {
    const { cenario } = aberto;
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', {
      sessao: await sessao(cenario.contaB),
      corpo: { ...VALIDO, nome: 'Pelada Auditada' },
    });
    const { id } = (await r.json()) as { id: string };
    // planos-e-cobranca T13 (PLA-14): a criação grava também a entrada no trial, com a mesma conta autora.
    expect(await auditoriaDe(id)).toEqual([
      { acao: 'grupo_criado', autor: cenario.contaB },
      { acao: 'plano_trial_iniciado', autor: cenario.contaB },
    ]);
  });

  it.each([
    ['nome curto', { nome: 'ab' }, 'nome', MENSAGEM_NOME_GRUPO],
    ['nome só com espaços em volta de 2 letras', { nome: '  ab  ' }, 'nome', MENSAGEM_NOME_GRUPO],
    ['nome longo', { nome: 'x'.repeat(61) }, 'nome', MENSAGEM_NOME_GRUPO],
    ['nome ausente', { nome: undefined }, 'nome', MENSAGEM_NOME_GRUPO],
    ['dia fora da lista', { diaSemana: 'sábado' }, 'diaSemana', MENSAGEM_DIA_SEMANA],
    ['frequência fora da lista', { frequencia: 'diaria' }, 'frequencia', MENSAGEM_FREQUENCIA],
    ['horário ausente', { horario: undefined }, 'horario', MENSAGEM_HORARIO_AUSENTE],
    ['horário vazio', { horario: '' }, 'horario', MENSAGEM_HORARIO_AUSENTE],
    ['horário fora de HH:MM', { horario: '7:30' }, 'horario', MENSAGEM_HORARIO_INVALIDO],
    ['horário 24:00', { horario: '24:00' }, 'horario', MENSAGEM_HORARIO_INVALIDO],
  ] as const)(
    'GEL-03 a GEL-06: %s dá 422 no campo e nada é criado',
    async (_caso, mudanca, campo, mensagem) => {
      const { cenario } = aberto;
      const nomeBase = 'Pelada Inválida';
      const corpo: Record<string, unknown> = { ...VALIDO, nome: nomeBase, ...mudanca };
      for (const [k, v] of Object.entries(corpo)) if (v === undefined) delete corpo[k];
      const pedir = cliente(aberto.url);
      const r = await pedir('/grupos', { sessao: await sessao(cenario.contaB), corpo });
      expect(r.status).toBe(422);
      const erro = (await r.json()) as Corpo422;
      expect(erro.erro).toBe(MENSAGEM_CORRIJA_CAMPOS);
      expect(erro.codigo).toBe('dados_invalidos');
      expect(erro.campos).toContain(campo);
      expect(erro.mensagens[campo]).toBe(mensagem);
      expect(await gruposComNome(nomeBase)).toBe(0);
    },
  );

  it.each([
    ['slug', { slug: 'meu-slug' }],
    ['urlPublica', { urlPublica: 'https://golpe.exemplo.test' }],
  ] as const)('GEL-07: corpo com %s dá 422 e nada é criado', async (_campo, extra) => {
    const { cenario } = aberto;
    const nome = `Pelada com Campo Extra ${_campo}`;
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', {
      sessao: await sessao(cenario.contaB),
      corpo: { ...VALIDO, nome, ...extra },
    });
    expect(r.status).toBe(422);
    expect(((await r.json()) as Corpo422).codigo).toBe('dados_invalidos');
    expect(await gruposComNome(nome)).toBe(0);
  });

  it('GEL-08: sem sessão, 401 e nada criado', async () => {
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', { corpo: { ...VALIDO, nome: 'Pelada Sem Sessão' } });
    expect(r.status).toBe(401);
    expect(await gruposComNome('Pelada Sem Sessão')).toBe(0);
  });

  it('GEL-08: com cookie de sessão inválida, 401 e nada criado', async () => {
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', {
      sessao: 'token-que-nao-existe',
      corpo: { ...VALIDO, nome: 'Pelada Cookie Ruim' },
    });
    expect(r.status).toBe(401);
    expect(await gruposComNome('Pelada Cookie Ruim')).toBe(0);
  });

  it('GEL-09: erro forçado no meio da criação (na última habilidade) desfaz grupo, vínculo, habilidades e auditoria', async () => {
    const { cenario, db } = aberto;
    const nome = 'Pelada da Falha';
    await db.query(
      `CREATE FUNCTION falha_teste_gel09() RETURNS trigger LANGUAGE plpgsql AS $$
       BEGIN
         IF NEW.nome = 'Desarme' AND (SELECT g.nome FROM grupos g WHERE g.id = NEW.grupo_id) = '${nome}' THEN
           RAISE EXCEPTION 'falha forçada (GEL-09)';
         END IF;
         RETURN NEW;
       END $$`,
    );
    await db.query(
      'CREATE TRIGGER falha_teste_gel09 AFTER INSERT ON habilidades FOR EACH ROW EXECUTE FUNCTION falha_teste_gel09()',
    );
    try {
      const pedir = cliente(aberto.url);
      const r = await pedir('/grupos', {
        sessao: await sessao(cenario.contaB),
        corpo: { ...VALIDO, nome },
      });
      expect(r.status).toBe(500);
      expect(JSON.stringify(await r.json())).not.toContain('falha forçada');
    } finally {
      await db.query('DROP TRIGGER IF EXISTS falha_teste_gel09 ON habilidades');
      await db.query('DROP FUNCTION IF EXISTS falha_teste_gel09()');
    }
    expect(await gruposComNome(nome)).toBe(0);
    const orfas = await db.query(
      `SELECT 1 FROM habilidades h WHERE NOT EXISTS (SELECT 1 FROM grupos g WHERE g.id = h.grupo_id)`,
    );
    expect(orfas.rowCount).toBe(0);
    const vinculos = await db.query(
      `SELECT 1 FROM vinculos_admin v WHERE NOT EXISTS (SELECT 1 FROM grupos g WHERE g.id = v.grupo_id)`,
    );
    expect(vinculos.rowCount).toBe(0);
    const eventos = await db.query(
      `SELECT 1 FROM auditoria a WHERE a.acao = 'grupo_criado' AND NOT EXISTS (SELECT 1 FROM grupos g WHERE g.id = a.grupo_id)`,
    );
    expect(eventos.rowCount).toBe(0);
  });
});

describe('GET /api/grupos', () => {
  it('GEL-27: a criadora vê G arquivado em arquivados, separado dos ativos', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', { sessao: await sessao(cenario.contaC) });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as {
      ativos: Array<{ id: string }>;
      arquivados: Array<{ id: string }>;
    };
    expect(Object.keys(corpo).sort()).toEqual(['arquivados', 'ativos']);
    expect(corpo.arquivados.map((g) => g.id)).toEqual([cenario.grupoG]);
    expect(corpo.ativos.map((g) => g.id)).not.toContain(cenario.grupoG);
  });

  it('GEL-27: com G ativo, a criadora o vê em ativos, com dia, frequência e horário', async () => {
    const { cenario } = aberto;
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', { sessao: await sessao(cenario.contaC) });
    const corpo = (await r.json()) as {
      ativos: Array<Record<string, unknown>>;
      arquivados: unknown[];
    };
    const g = corpo.ativos.find((item) => item.id === cenario.grupoG);
    expect(g).toMatchObject({ slug: cenario.slugG, nome: 'Pelada de Quinta' });
    expect(g?.horario).toMatch(/^\d{2}:\d{2}$/);
    expect(corpo.arquivados).toEqual([]);
  });

  it('GEL-25: com G arquivado, a outra admin não o vê em nenhuma das listas', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const pedir = cliente(aberto.url);
    const r = await pedir('/grupos', { sessao: await sessao(cenario.contaO) });
    const corpo = (await r.json()) as {
      ativos: Array<{ id: string }>;
      arquivados: Array<{ id: string }>;
    };
    expect(corpo.ativos.map((g) => g.id)).not.toContain(cenario.grupoG);
    expect(corpo.arquivados).toEqual([]);
  });

  it('GEL-08: sem sessão, 401', async () => {
    const pedir = cliente(aberto.url);
    expect((await pedir('/grupos')).status).toBe(401);
  });
});

describe('linkPublico', () => {
  it.each([
    ['https://a.test', 'x', 'https://a.test/g/x'],
    ['https://a.test/', 'x', 'https://a.test/g/x'],
    ['http://127.0.0.1:8787', 'pelada-2', 'http://127.0.0.1:8787/g/pelada-2'],
  ])('GEL-17: %s + %s = %s', (url, slug, esperado) => {
    expect(linkPublico(url, slug)).toBe(esperado);
  });
});
