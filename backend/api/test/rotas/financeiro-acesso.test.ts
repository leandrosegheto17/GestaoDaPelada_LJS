import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  abrirCenarioGrupos,
  arquivar,
  reativar,
  type CenarioGruposAberto,
} from '../isolamento/cenario-grupos.ts';
import { auditorias, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * `PATCH /api/grupos/:grupoId/admins/:contaId/financeiro` (financeiro T29; FIN-35, FIN-36), com o app real como
 * `pelada_app`. Cenário: C criadora de G com acesso, O admin de G sem acesso, B só do grupo H. O `afterEach` devolve O
 * sem acesso (`restaurarCaixa`) e reativa G.
 *
 * Casos limite: conceder, repetir (sem auditar de novo), retirar; O sem acesso (403); C na própria conta (409); B, que
 * não é admin de G (404); id malformado (404); corpo inválido (422); grupo arquivado (409).
 */

let aberto: CenarioGruposAberto;

interface Admin {
  id: string;
  acessaFinanceiro: boolean;
}

const alterar = (alvo: string, corpo: unknown, conta = aberto.cenario.contaC) =>
  pedir(aberto, {
    metodo: 'PATCH',
    caminho: `/grupos/${aberto.cenario.grupoG}/admins/${alvo}/financeiro`,
    conta,
    corpo,
  });

const concedidos = () => auditorias(aberto, aberto.cenario.grupoG, 'financeiro_concedido');
const retirados = () => auditorias(aberto, aberto.cenario.grupoG, 'financeiro_retirado');

async function acessoNoBanco(conta: string): Promise<boolean | undefined> {
  const r = await aberto.db.query<{ acessa_financeiro: boolean }>(
    'SELECT acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2',
    [aberto.cenario.grupoG, conta],
  );
  return r.rows[0]?.acessa_financeiro;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await reativar(aberto.db, aberto.cenario.grupoG);
  await restaurarCaixa(aberto);
});

describe('PATCH …/admins/:contaId/financeiro', () => {
  it('FIN-35: a criadora concede à convidada; a lista volta com acessaFinanceiro verdadeiro; repetir não audita de novo', async () => {
    const { contaO } = aberto.cenario;
    const antes = await concedidos();
    const r = await alterar(contaO, { acessaFinanceiro: true });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { admins: Admin[]; convites: unknown[] };
    expect(corpo.admins.find((a) => a.id === contaO)?.acessaFinanceiro).toBe(true);
    expect(Array.isArray(corpo.convites)).toBe(true);
    expect(await acessoNoBanco(contaO)).toBe(true);
    expect(await concedidos()).toBe(antes + 1);

    const repetido = await alterar(contaO, { acessaFinanceiro: true });
    expect(repetido.status).toBe(200);
    expect(
      ((await repetido.json()) as { admins: Admin[] }).admins.find((a) => a.id === contaO)
        ?.acessaFinanceiro,
    ).toBe(true);
    expect(await concedidos()).toBe(antes + 1);
  });

  it('FIN-35: retirar grava e audita financeiro_retirado', async () => {
    const { contaO } = aberto.cenario;
    expect((await alterar(contaO, { acessaFinanceiro: true })).status).toBe(200);
    const antes = await retirados();
    const r = await alterar(contaO, { acessaFinanceiro: false });
    expect(r.status).toBe(200);
    expect(
      ((await r.json()) as { admins: Admin[] }).admins.find((a) => a.id === contaO)
        ?.acessaFinanceiro,
    ).toBe(false);
    expect(await acessoNoBanco(contaO)).toBe(false);
    expect(await retirados()).toBe(antes + 1);
  });

  it('FIN-35: com acesso concedido, a convidada passa a ler o mês do caixa', async () => {
    const { contaO, grupoG } = aberto.cenario;
    const caminho = `/grupos/${grupoG}/financeiro/mes`;
    expect((await pedir(aberto, { metodo: 'GET', caminho, conta: contaO })).status).toBe(403);
    expect((await alterar(contaO, { acessaFinanceiro: true })).status).toBe(200);
    expect((await pedir(aberto, { metodo: 'GET', caminho, conta: contaO })).status).toBe(200);
  });

  it('FIN-36: convidada sem acesso recebe 403 e nada muda', async () => {
    const { contaO, contaC } = aberto.cenario;
    const r = await alterar(contaC, { acessaFinanceiro: false }, contaO);
    expect(r.status).toBe(403);
    expect(await r.json()).toMatchObject({ codigo: 'sem_permissao_financeiro' });
    expect(await acessoNoBanco(contaC)).toBe(true);
  });

  it('FIN-36: com acesso, na própria conta, 409 acao_na_propria_conta e nada muda', async () => {
    const { contaC } = aberto.cenario;
    const antes = await retirados();
    const r = await alterar(contaC, { acessaFinanceiro: false });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({
      erro: 'Você não pode alterar a sua própria permissão.',
      codigo: 'acao_na_propria_conta',
    });
    expect(await acessoNoBanco(contaC)).toBe(true);
    expect(await retirados()).toBe(antes);
  });

  it('FIN-36: alvo de outro grupo (não admin de G) dá 404', async () => {
    const r = await alterar(aberto.cenario.contaB, { acessaFinanceiro: true });
    expect(r.status).toBe(404);
    expect(await r.json()).toMatchObject({ codigo: 'nao_encontrado' });
  });

  it('FIN-36: conta inexistente e id malformado dão 404', async () => {
    expect((await alterar(crypto.randomUUID(), { acessaFinanceiro: true })).status).toBe(404);
    expect((await alterar('abc', { acessaFinanceiro: true })).status).toBe(404);
  });

  it.each([[{}], [{ acessaFinanceiro: 'sim' }], [{ acessaFinanceiro: true, extra: 1 }]])(
    'corpo inválido (%j) dá 422 e nada muda',
    async (corpo) => {
      const r = await alterar(aberto.cenario.contaO, corpo);
      expect(r.status).toBe(422);
      expect(await acessoNoBanco(aberto.cenario.contaO)).toBe(false);
    },
  );

  it('FIN-37: grupo arquivado dá 409 grupo_arquivado', async () => {
    await arquivar(aberto.db, aberto.cenario.grupoG);
    const r = await alterar(aberto.cenario.contaO, { acessaFinanceiro: true });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ codigo: 'grupo_arquivado' });
    expect(await acessoNoBanco(aberto.cenario.contaO)).toBe(false);
  });

  it('o GET de admins continua com o mesmo formato', async () => {
    const r = await pedir(aberto, {
      metodo: 'GET',
      caminho: `/grupos/${aberto.cenario.grupoG}/admins`,
      conta: aberto.cenario.contaC,
    });
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { admins: Admin[] };
    expect(corpo.admins.map((a) => [a.id, a.acessaFinanceiro]).sort()).toEqual(
      [
        [aberto.cenario.contaC, true],
        [aberto.cenario.contaO, false],
      ].sort(),
    );
  });
});
