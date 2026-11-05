import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { passaComGrupoArquivado } from '../../src/entrada/middlewares/grupo-ativo.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, arquivar, NOME_G, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * Isolamento do grupo arquivado nas rotas (T31; GEL-25, GEL-26). As rotas vêm do `app.routes` (como a suíte da conta
 * e acesso, `test/isolamento/rotas.test.ts:143`): toda rota com handler sob `/api/grupos/:grupoId` entra, também as
 * que as tarefas seguintes registrarem (jogadores, períodos, habilidades, notas). Com G arquivado:
 * - O (outra admin) recebe 404 em todas, inclusive arquivar e reativar, e G some das listas dela (GEL-25);
 * - C (criadora) recebe 409 `grupo_arquivado` em toda escrita, salvo reativar, arquivar e cancelar convite (GEL-26);
 * - C removida do grupo recebe 404 em arquivar e reativar (`GS:392`).
 *
 * Os parâmetros de caminho que não são o `grupoId` levam um uuid qualquer: o 404 da O e o 409 da C vêm da cadeia do
 * grupo, antes do handler, e não dependem deles.
 *
 * SPEC_DEVIATION: o `Where` da T31 é `test/rotas/`, que roda no `workerd`, sem o Postgres; o teste fica no Node, como
 * os das rotas de acesso (`test/acesso/apoio.ts:13`).
 */

let aberto: CenarioGruposAberto;

const UUID_QUALQUER = '00000000-0000-4000-8000-000000000000';

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

interface RotaDeGrupo {
  metodo: string;
  padrao: string;
}

/** As rotas com handler sob `/api/grupos/:grupoId`, sem os middlewares (`ALL`) e sem repetição. */
function rotasDeGrupo(): RotaDeGrupo[] {
  const vistas = new Set<string>();
  const rotas: RotaDeGrupo[] = [];
  for (const r of criarApp().routes) {
    if (r.method === 'ALL') continue;
    if (r.path !== '/api/grupos/:grupoId' && !r.path.startsWith('/api/grupos/:grupoId/')) continue;
    const chave = `${r.method} ${r.path}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    rotas.push({ metodo: r.method, padrao: r.path });
  }
  return rotas.sort((a, b) => `${a.metodo} ${a.padrao}`.localeCompare(`${b.metodo} ${b.padrao}`));
}

/** O caminho concreto, relativo a /api: `:grupoId` = G, os outros parâmetros = um uuid qualquer. */
function caminho(padrao: string, grupo: string): string {
  return padrao
    .replace(/^\/api/, '')
    .replace(':grupoId', grupo)
    .replace(/:[A-Za-z]+/g, UUID_QUALQUER);
}

const ESCRITA = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const ROTAS = rotasDeGrupo();
const ESCRITAS = ROTAS.filter((r) => ESCRITA.has(r.metodo));

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

beforeEach(async () => {
  await arquivar(aberto.db, aberto.cenario.grupoG);
});

describe('rotas de grupo registradas', () => {
  it('GEL-25: a lista do app.routes tem as rotas de grupo já registradas (não está vazia)', () => {
    const chaves = ROTAS.map((r) => `${r.metodo} ${r.padrao}`);
    expect(chaves).toEqual(
      expect.arrayContaining([
        'GET /api/grupos/:grupoId',
        'PATCH /api/grupos/:grupoId',
        'POST /api/grupos/:grupoId/arquivar',
        'POST /api/grupos/:grupoId/reativar',
        'GET /api/grupos/:grupoId/admins',
        'POST /api/grupos/:grupoId/admins/convites',
        'DELETE /api/grupos/:grupoId/admins/convites/:id',
        'DELETE /api/grupos/:grupoId/admins/:contaId',
      ]),
    );
  });
});

describe('G arquivado, para a outra admin', () => {
  it.each(ROTAS.map((r) => [`${r.metodo} ${r.padrao}`, r] as const))('GEL-25: %s responde 404 à O', async (_nome, rota) => {
    const { cenario } = aberto;
    const r = await cliente(aberto.url)(caminho(rota.padrao, cenario.grupoG), {
      metodo: rota.metodo,
      sessao: await sessao(cenario.contaO),
      ...(ESCRITA.has(rota.metodo) ? { corpo: rota.padrao.endsWith('/arquivar') ? { nomeConfirmacao: NOME_G } : {} } : {}),
    });
    expect(r.status).toBe(404);
    expect(await r.text()).not.toContain(NOME_G);
  });

  it('GEL-25: G some de GET /api/grupos e de GET /api/sessao da O', async () => {
    const { cenario } = aberto;
    const token = await sessao(cenario.contaO);
    const lista = (await (await cliente(aberto.url)('/grupos', { sessao: token })).json()) as {
      ativos: Array<{ id: string }>;
      arquivados: Array<{ id: string }>;
    };
    expect([...lista.ativos, ...lista.arquivados].map((g) => g.id)).not.toContain(cenario.grupoG);
    const eu = (await (await cliente(aberto.url)('/sessao', { sessao: token })).json()) as { grupos: Array<{ id: string }> };
    expect(eu.grupos.map((g) => g.id)).not.toContain(cenario.grupoG);
  });

  it('GEL-25: O não reativa: 404 e G continua arquivado', async () => {
    const { cenario } = aberto;
    await cliente(aberto.url)(`/grupos/${cenario.grupoG}/reativar`, { metodo: 'POST', sessao: await sessao(cenario.contaO) });
    const g = await aberto.db.query('SELECT arquivado_em FROM grupos WHERE id = $1', [cenario.grupoG]);
    expect(g.rows[0]?.arquivado_em).not.toBeNull();
  });
});

describe('G arquivado, para a criadora', () => {
  const bloqueadas = ESCRITAS.filter((r) => !passaComGrupoArquivado(r.metodo, `/api${caminho(r.padrao, 'g')}`));

  it('GEL-26: as exceções são só reativar, arquivar e cancelar convite', () => {
    const excecoes = ESCRITAS.filter((r) => passaComGrupoArquivado(r.metodo, `/api${caminho(r.padrao, 'g')}`)).map(
      (r) => `${r.metodo} ${r.padrao}`,
    );
    expect(excecoes.sort()).toEqual(
      [
        'DELETE /api/grupos/:grupoId/admins/convites/:id',
        'POST /api/grupos/:grupoId/arquivar',
        'POST /api/grupos/:grupoId/reativar',
      ].sort(),
    );
  });

  it.each(bloqueadas.map((r) => [`${r.metodo} ${r.padrao}`, r] as const))(
    'GEL-26: %s responde 409 grupo_arquivado à criadora',
    async (_nome, rota) => {
      const { cenario } = aberto;
      const r = await cliente(aberto.url)(caminho(rota.padrao, cenario.grupoG), {
        metodo: rota.metodo,
        sessao: await sessao(cenario.contaC),
        corpo: {},
      });
      expect(r.status).toBe(409);
      expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    },
  );

  it.each(ROTAS.filter((r) => r.metodo === 'GET').map((r) => [`${r.metodo} ${r.padrao}`, r] as const))(
    'GEL-26: %s (leitura) não responde 409 à criadora',
    async (_nome, rota) => {
      const { cenario } = aberto;
      const r = await cliente(aberto.url)(caminho(rota.padrao, cenario.grupoG), { sessao: await sessao(cenario.contaC) });
      expect(r.status).not.toBe(409);
    },
  );

  it('GEL-26: arquivar de novo responde 200 e reativar responde 200 (as exceções passam)', async () => {
    const { cenario } = aberto;
    const token = await sessao(cenario.contaC);
    const arquivarDeNovo = await cliente(aberto.url)(`/grupos/${cenario.grupoG}/arquivar`, {
      sessao: token,
      corpo: { nomeConfirmacao: NOME_G },
    });
    expect(arquivarDeNovo.status).toBe(200);
    const reativado = await cliente(aberto.url)(`/grupos/${cenario.grupoG}/reativar`, { metodo: 'POST', sessao: token });
    expect(reativado.status).toBe(200);
  });
});

describe('criadora removida do grupo', () => {
  it.each([
    ['arquivar', { nomeConfirmacao: NOME_G }],
    ['reativar', undefined],
  ] as const)('GEL-25: a criadora sem vínculo recebe 404 em %s', async (acao, corpo) => {
    const { cenario, db } = aberto;
    await db.query('DELETE FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2', [cenario.grupoG, cenario.contaC]);
    try {
      for (const estado of ['arquivado', 'ativo'] as const) {
        if (estado === 'ativo') await reativar(db, cenario.grupoG);
        const antes = await db.query('SELECT arquivado_em FROM grupos WHERE id = $1', [cenario.grupoG]);
        const r = await cliente(aberto.url)(`/grupos/${cenario.grupoG}/${acao}`, {
          metodo: 'POST',
          sessao: await sessao(cenario.contaC),
          ...(corpo ? { corpo } : {}),
        });
        expect(r.status, `${acao} com G ${estado}`).toBe(404);
        const depois = await db.query('SELECT arquivado_em FROM grupos WHERE id = $1', [cenario.grupoG]);
        expect(depois.rows[0]?.arquivado_em).toEqual(antes.rows[0]?.arquivado_em);
      }
    } finally {
      await db.query(
        `INSERT INTO vinculos_admin (conta_id, grupo_id, acessa_financeiro, criado_por, criado_em)
         VALUES ($1, $2, true, $1, now()) ON CONFLICT DO NOTHING`,
        [cenario.contaC, cenario.grupoG],
      );
    }
  });
});
