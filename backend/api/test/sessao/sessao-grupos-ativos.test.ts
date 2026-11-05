import { Buffer } from 'node:buffer';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { gerarToken } from '../../src/infraestrutura/sessao/token.ts';
import { cliente } from '../acesso/apoio.ts';
import { abrirCenarioGrupos, arquivar, reativar, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';

/**
 * `GET /api/sessao` lista só os grupos ativos (T24; GEL-25, GEL-27), contra o cenário de grupos: C é a criadora de
 * G, O a outra admin. O grupo arquivado só aparece em `GET /api/grupos` (seção "Arquivados", T26 e T28).
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

async function gruposDaSessao(conta: string): Promise<string[]> {
  const pedir = cliente(aberto.url);
  const r = await pedir('/sessao', { sessao: await sessao(conta) });
  expect(r.status).toBe(200);
  const corpo = (await r.json()) as { grupos: Array<{ id: string }> };
  return corpo.grupos.map((g) => g.id);
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

describe('GET /api/sessao com grupo arquivado', () => {
  it('GEL-25: com G arquivado, a sessão da outra admin não traz G', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    expect(await gruposDaSessao(cenario.contaO)).not.toContain(cenario.grupoG);
  });

  it('GEL-27: com G arquivado, a sessão da criadora também não traz G', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    expect(await gruposDaSessao(cenario.contaC)).not.toContain(cenario.grupoG);
  });

  it('GEL-27: reativado, G volta à sessão da criadora e da outra admin', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    await reativar(aberto.db, cenario.grupoG);
    expect(await gruposDaSessao(cenario.contaC)).toContain(cenario.grupoG);
    expect(await gruposDaSessao(cenario.contaO)).toContain(cenario.grupoG);
  });

  it('GEL-25: arquivar G não tira da sessão os outros grupos ativos', async () => {
    const { cenario } = aberto;
    await arquivar(aberto.db, cenario.grupoG);
    expect(await gruposDaSessao(cenario.contaB)).toContain(cenario.grupoH);
  });
});
