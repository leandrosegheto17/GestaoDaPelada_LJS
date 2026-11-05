import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MENSAGEM_NOME_CONFIRMACAO } from '@pelada/contrato';
import { MENSAGEM_NOME_NAO_CONFERE } from '../../src/entrada/rotas/grupo-estado.ts';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, arquivar, NOME_G, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `POST /api/grupos/:grupoId/arquivar` e `…/reativar` (T30; GEL-22 a GEL-24, GEL-28, GEL-29), com o app real como
 * `pelada_app` contra o cenário de grupos (C criadora de G, O outra admin).
 */

let aberto: CenarioGruposAberto;

async function sessao(conta: string): Promise<string> {
  const { token, hash } = await gerarToken();
  await aberto.db.query(
    `INSERT INTO sessoes (token_hash, conta_id, escopo, criada_em, ultimo_uso_em, expira_em)
     VALUES ($1, $2, 'completo', now(), now(), now() + interval '12 hours')`,
    [Buffer.from(hash), conta],
  );
  return token;
}

async function arquivadoEm(): Promise<Date | null> {
  const r = await aberto.db.query<{ arquivado_em: Date | null }>('SELECT arquivado_em FROM grupos WHERE id = $1', [
    aberto.cenario.grupoG,
  ]);
  return r.rows[0]?.arquivado_em ?? null;
}

async function eventos(acao: string): Promise<string[]> {
  const r = await aberto.db.query<{ autor: string }>(
    'SELECT autor_conta_id AS autor FROM auditoria WHERE grupo_id = $1 AND acao = $2 ORDER BY momento, id',
    [aberto.cenario.grupoG, acao],
  );
  return r.rows.map((l) => l.autor);
}

function arquivarComo(token: string, nomeConfirmacao: unknown) {
  return cliente(aberto.url)(`/grupos/${aberto.cenario.grupoG}/arquivar`, {
    sessao: token,
    corpo: nomeConfirmacao === undefined ? {} : { nomeConfirmacao },
  });
}

function reativarComo(token: string) {
  return cliente(aberto.url)(`/grupos/${aberto.cenario.grupoG}/reativar`, { metodo: 'POST', sessao: token });
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

describe('POST /api/grupos/:grupoId/arquivar', () => {
  it('GEL-22: a criadora arquiva com o nome certo: 200, arquivado_em gravado e grupo_arquivado por ela', async () => {
    const { cenario } = aberto;
    const antes = (await eventos('grupo_arquivado')).length;
    const r = await arquivarComo(await sessao(cenario.contaC), NOME_G);
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: cenario.grupoG, nome: NOME_G, souCriador: true });
    expect(await arquivadoEm()).not.toBeNull();
    const depois = await eventos('grupo_arquivado');
    expect(depois).toHaveLength(antes + 1);
    expect(depois.at(-1)).toBe(cenario.contaC);
  });

  it.each(['pelada de quinta', 'PELADA DE QUINTA', ' Pelada de Quinta', 'Outro Grupo'])(
    'GEL-23: nome "%s" dá 422 com a mensagem no campo nomeConfirmacao e não arquiva',
    async (nome) => {
      const { cenario } = aberto;
      const antes = (await eventos('grupo_arquivado')).length;
      const r = await arquivarComo(await sessao(cenario.contaC), nome);
      expect(r.status).toBe(422);
      const erro = (await r.json()) as { codigo: string; campos: string[]; mensagens: Record<string, string> };
      expect(erro.codigo).toBe('dados_invalidos');
      expect(erro.campos).toEqual(['nomeConfirmacao']);
      expect(erro.mensagens.nomeConfirmacao).toBe(MENSAGEM_NOME_NAO_CONFERE);
      expect(await arquivadoEm()).toBeNull();
      expect(await eventos('grupo_arquivado')).toHaveLength(antes);
    },
  );

  it('GEL-23: sem nomeConfirmacao, 422 pedindo o nome, e não arquiva', async () => {
    const { cenario } = aberto;
    const r = await arquivarComo(await sessao(cenario.contaC), undefined);
    expect(r.status).toBe(422);
    const erro = (await r.json()) as { mensagens: Record<string, string> };
    expect(erro.mensagens.nomeConfirmacao).toBe(MENSAGEM_NOME_CONFIRMACAO);
    expect(await arquivadoEm()).toBeNull();
  });

  it('GEL-24: O recebe 403 so_quem_criou com G ativo, e G fica igual', async () => {
    const { cenario } = aberto;
    const antes = (await eventos('grupo_arquivado')).length;
    const r = await arquivarComo(await sessao(cenario.contaO), NOME_G);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'so_quem_criou' });
    expect(await arquivadoEm()).toBeNull();
    expect(await eventos('grupo_arquivado')).toHaveLength(antes);
  });

  it('GEL-29: arquivar o já arquivado dá 200 sem gravar nem auditar', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const quando = await arquivadoEm();
    const antes = (await eventos('grupo_arquivado')).length;
    const r = await arquivarComo(await sessao(cenario.contaC), NOME_G);
    expect(r.status).toBe(200);
    expect(await arquivadoEm()).toEqual(quando);
    expect(await eventos('grupo_arquivado')).toHaveLength(antes);
  });

  it('GEL-21: B, sem vínculo, recebe 404', async () => {
    const { cenario } = aberto;
    const r = await arquivarComo(await sessao(cenario.contaB), NOME_G);
    expect(r.status).toBe(404);
    expect(await arquivadoEm()).toBeNull();
  });
});

describe('POST /api/grupos/:grupoId/reativar', () => {
  it('GEL-28: a criadora reativa o arquivado: 200, arquivado_em apagado e grupo_reativado por ela', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const antes = (await eventos('grupo_reativado')).length;
    const r = await reativarComo(await sessao(cenario.contaC));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ id: cenario.grupoG, slug: cenario.slugG, jogadoresAtivos: 2, habilidades: 6, admins: 2 });
    expect(await arquivadoEm()).toBeNull();
    const depois = await eventos('grupo_reativado');
    expect(depois).toHaveLength(antes + 1);
    expect(depois.at(-1)).toBe(cenario.contaC);
  });

  it('GEL-29: reativar de novo (grupo já ativo) dá 200 sem auditoria', async () => {
    const { cenario } = aberto;
    const antes = (await eventos('grupo_reativado')).length;
    const r = await reativarComo(await sessao(cenario.contaC));
    expect(r.status).toBe(200);
    expect(await eventos('grupo_reativado')).toHaveLength(antes);
  });

  it('GEL-24: O recebe 403 so_quem_criou ao reativar G ativo, sem auditoria', async () => {
    const { cenario } = aberto;
    const antes = (await eventos('grupo_reativado')).length;
    const r = await reativarComo(await sessao(cenario.contaO));
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'so_quem_criou' });
    expect(await eventos('grupo_reativado')).toHaveLength(antes);
  });

  it('GEL-25: com G arquivado, O recebe 404 ao reativar e G continua arquivado', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    const r = await reativarComo(await sessao(cenario.contaO));
    expect(r.status).toBe(404);
    expect(await arquivadoEm()).not.toBeNull();
  });
});
