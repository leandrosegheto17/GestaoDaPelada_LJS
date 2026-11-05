import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { criarApp } from '../../src/entrada/app.ts';
import { MENSAGEM_PLANO_PRO, type RecursoLiberado } from '../../src/entrada/middlewares/recurso.ts';
import { relogioFixo } from '../../src/infraestrutura/relogio.ts';
import { fabricaComoApp } from '../db/requisicao.ts';
import { abrirCenarioGrupos, type CenarioGruposAberto } from '../isolamento/cenario-grupos.ts';
import { AGORA_FINANCEIRO, pedir, restaurarCaixa } from './apoio-financeiro.ts';

/**
 * Trava de plano em todas as rotas do financeiro (financeiro T32; FIN-45, FIN-50; AD-049, AD-074), com o app real como
 * `pelada_app`, o relógio fixo em 2026-10-15 e a criadora C de G (com acesso). O ponto único é forçado em "somente
 * leitura" pela injeção `criarApp({ recursoLiberado })`.
 *
 * - forçado: as 8 escritas (configurar, marcar, desmarcar, criar, editar e excluir lançamento, conceder e retirar
 *   acesso) respondem 403 `plano_pro` com o recurso `financeiro`, e as contagens de `config_financeira`, `lancamentos`,
 *   `pagamentos_mes`, `auditoria` e o acesso de O ficam iguais (FIN-50);
 * - forçado: as 3 leituras (mês, lançamento, saldo no início do grupo) respondem 200 (FIN-50);
 * - sem forçar (padrão): as mesmas escritas passam (FIN-45).
 */

let aberto: CenarioGruposAberto;

const somenteLeitura: RecursoLiberado = async (_db, _grupoId, recurso) => recurso !== 'financeiro';

function app(recursoLiberado?: RecursoLiberado) {
  return criarApp({
    fabricaBanco: fabricaComoApp().fabrica,
    relogio: relogioFixo(AGORA_FINANCEIRO),
    ...(recursoLiberado ? { recursoLiberado } : {}),
  });
}

interface Escrita {
  nome: string;
  metodo: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  caminho: () => string;
  corpo?: unknown;
}

const g = () => `/grupos/${aberto.cenario.grupoG}`;
const LANCAMENTO = {
  tipo: 'saida',
  data: '2026-10-10',
  descricao: 'Bola nova',
  valorCentavos: 12000,
};

/** As 8 escritas com ids que existem no cenário (o lançamento do cenário, Bira em 2026-01, O sem acesso). */
const ESCRITAS: Escrita[] = [
  {
    nome: 'configurar',
    metodo: 'PUT',
    caminho: () => `${g()}/financeiro/config`,
    corpo: { mensalidadeCentavos: 6000, saldoInicialCentavos: 0, dataSaldoInicial: '2026-01-01' },
  },
  // O corpo do marcar leva o id de Toninho, que só existe depois do cenário: vem do `corpoDe`.
  { nome: 'marcar', metodo: 'POST', caminho: () => `${g()}/financeiro/pagamentos` },
  {
    nome: 'desmarcar',
    metodo: 'DELETE',
    caminho: () => `${g()}/financeiro/pagamentos/${aberto.cenario.idsG.jogadorHistorico}/2026-01`,
  },
  {
    nome: 'criar lançamento',
    metodo: 'POST',
    caminho: () => `${g()}/financeiro/lancamentos`,
    corpo: LANCAMENTO,
  },
  {
    nome: 'editar lançamento',
    metodo: 'PUT',
    caminho: () => `${g()}/financeiro/lancamentos/${aberto.cenario.idsG.lancamento}`,
    corpo: { tipo: 'entrada', data: '2026-01-05', descricao: 'Mensalidade', valorCentavos: 4000 },
  },
  {
    nome: 'excluir lançamento',
    metodo: 'DELETE',
    caminho: () => `${g()}/financeiro/lancamentos/${aberto.cenario.idsG.lancamento}`,
  },
  {
    nome: 'conceder acesso',
    metodo: 'PATCH',
    caminho: () => `${g()}/admins/${aberto.cenario.contaO}/financeiro`,
    corpo: { acessaFinanceiro: true },
  },
  {
    nome: 'retirar acesso',
    metodo: 'PATCH',
    caminho: () => `${g()}/admins/${aberto.cenario.contaO}/financeiro`,
    corpo: { acessaFinanceiro: false },
  },
];

const LEITURAS = [
  { nome: 'mês', caminho: () => `${g()}/financeiro/mes` },
  {
    nome: 'lançamento',
    caminho: () => `${g()}/financeiro/lancamentos/${aberto.cenario.idsG.lancamento}`,
  },
  { nome: 'saldo no início do grupo', caminho: () => g() },
];

/** Contagens das tabelas do caixa e da auditoria de G, mais o acesso de O. */
async function retrato(): Promise<string> {
  const { db, cenario } = aberto;
  const r = await db.query(
    `SELECT (SELECT count(*) FROM config_financeira WHERE grupo_id = $1)::int AS config,
            (SELECT row_to_json(c) FROM (SELECT mensalidade_centavos, saldo_inicial_centavos FROM config_financeira WHERE grupo_id = $1) c) AS valores,
            (SELECT count(*) FROM lancamentos WHERE grupo_id = $1)::int AS lancamentos,
            (SELECT sum(valor_centavos) FROM lancamentos WHERE grupo_id = $1)::int AS soma,
            (SELECT count(*) FROM pagamentos_mes WHERE grupo_id = $1)::int AS pagamentos,
            (SELECT count(*) FROM auditoria WHERE grupo_id = $1)::int AS auditoria,
            (SELECT acessa_financeiro FROM vinculos_admin WHERE grupo_id = $1 AND conta_id = $2) AS acesso_o`,
    [cenario.grupoG, cenario.contaO],
  );
  return JSON.stringify(r.rows[0]);
}

function corpoDe(e: Escrita): unknown {
  if (e.nome === 'marcar') return { jogadorId: aberto.cenario.idsG.jogadorAtivo, mes: '2026-10' };
  return e.corpo;
}

beforeAll(async () => {
  aberto = await abrirCenarioGrupos();
});

afterAll(async () => {
  await aberto?.fechar();
});

afterEach(async () => {
  await restaurarCaixa(aberto);
});

describe('ponto único em "somente leitura" nas rotas do financeiro (FIN-50)', () => {
  it.each(ESCRITAS.map((e) => [e.nome, e] as const))(
    'FIN-50: %s responde 403 plano_pro e nada é gravado nem auditado',
    async (_nome, e) => {
      const antes = await retrato();
      const r = await pedir(aberto, {
        metodo: e.metodo,
        caminho: e.caminho(),
        conta: aberto.cenario.contaC,
        corpo: corpoDe(e),
        app: app(somenteLeitura),
      });
      expect(r.status).toBe(403);
      expect(await r.json()).toEqual({
        erro: 'plano_pro',
        recurso: 'financeiro',
        mensagem: MENSAGEM_PLANO_PRO,
      });
      expect(await retrato()).toBe(antes);
    },
  );

  it('FIN-50: são 8 escritas, uma por rota de escrita do financeiro', () => {
    expect(ESCRITAS).toHaveLength(8);
  });

  it.each(LEITURAS.map((l) => [l.nome, l] as const))(
    'FIN-50: leitura do %s responde 200',
    async (_nome, l) => {
      const r = await pedir(aberto, {
        metodo: 'GET',
        caminho: l.caminho(),
        conta: aberto.cenario.contaC,
        app: app(somenteLeitura),
      });
      expect(r.status).toBe(200);
    },
  );
});

describe('ponto único liberado (FIN-45)', () => {
  it('FIN-45: sem forçar, as mesmas escritas passam', async () => {
    const conta = aberto.cenario.contaC;
    const liberado = app();
    const enviar = (metodo: Escrita['metodo'], caminho: string, corpo?: unknown) =>
      pedir(aberto, { metodo, caminho, conta, corpo, app: liberado });
    const [configurar, marcar, desmarcar, criar, , , conceder, retirar] = ESCRITAS as [
      Escrita,
      Escrita,
      Escrita,
      Escrita,
      Escrita,
      Escrita,
      Escrita,
      Escrita,
    ];

    expect((await enviar('PUT', configurar.caminho(), configurar.corpo)).status).toBe(200);
    expect((await enviar('POST', marcar.caminho(), corpoDe(marcar))).status).toBe(204);
    expect((await enviar('DELETE', desmarcar.caminho())).status).toBe(204);

    const criado = await enviar('POST', criar.caminho(), criar.corpo);
    expect(criado.status).toBe(201);
    const { id } = (await criado.json()) as { id: string };
    expect(
      (
        await enviar('PUT', `${g()}/financeiro/lancamentos/${id}`, {
          ...LANCAMENTO,
          valorCentavos: 13000,
        })
      ).status,
    ).toBe(200);
    expect((await enviar('DELETE', `${g()}/financeiro/lancamentos/${id}`)).status).toBe(204);

    expect((await enviar('PATCH', conceder.caminho(), conceder.corpo)).status).toBe(200);
    expect((await enviar('PATCH', retirar.caminho(), retirar.corpo)).status).toBe(200);
  });
});
