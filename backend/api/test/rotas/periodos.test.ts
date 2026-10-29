import { jogadorDetalhe } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { relogioFixo } from '../../src/infraestrutura/relogio/index.ts';
import { cenarioDeAcesso, type Extras } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Rotas de período (T42, T43; GEL-51 a GEL-58, GEL-71 a GEL-83, GEL-106). O Worker de teste conecta como pelada_app.

const { pedir } = cenarioDeAcesso();
// 22h de 31/12 em São Paulo: em UTC já é 01/01/2027. A rota precisa usar o "hoje" de São Paulo (AD-015).
const RELOGIO = relogioFixo('2026-12-31', '22:00');
const HOJE = '2026-12-31';
const unico = () => crypto.randomUUID().slice(0, 8);

interface Grupo {
  s: SessaoDeTeste;
  id: string;
}

async function grupoNovo(): Promise<Grupo> {
  const s = await criarSessao();
  const r = await pedir(
    'POST',
    '/api/grupos',
    { nome: `Periodos ${unico()}`, diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' },
    { cookie: s.cookie },
  );
  if (r.status !== 201) throw new Error(`criar grupo: ${r.status}`);
  return { s, id: (r.corpo as { id: string }).id };
}

const comRelogio = (g: Grupo): Extras => ({ cookie: g.s.cookie, relogio: RELOGIO });

/** Jogador cadastrado pela rota, com entrada em `dataEntrada`. */
async function jogador(g: Grupo, dataEntrada = '2026-09-01'): Promise<string> {
  const r = await pedir(
    'POST',
    `/api/grupos/${g.id}/jogadores`,
    { apelido: `J ${unico()}`, anoNascimento: 1990, posicao: 'meia', dataEntrada },
    comRelogio(g),
  );
  if (r.status !== 201) throw new Error(`cadastrar: ${r.status} ${r.texto}`);
  return (r.corpo as { id: string }).id;
}

const periodosDe = (id: string) =>
  comoOwner<{ inicio: string; fim: string | null }>(
    "SELECT to_char(inicio, 'YYYY-MM-DD') AS inicio, to_char(fim, 'YYYY-MM-DD') AS fim FROM periodos_ativos WHERE jogador_id = $1 ORDER BY inicio",
    [id],
  );

const rota = (g: Grupo, id: string, acao: string) => `/api/grupos/${g.id}/jogadores/${id}/${acao}`;

describe('POST …/jogadores/:id/inativar e …/reativar (GEL-51 a GEL-56)', () => {
  it('inativar → 200 com a ficha inativa; de novo → 409 "O jogador já está inativo."', async () => {
    const g = await grupoNovo();
    const id = await jogador(g);
    const r = await pedir('POST', rota(g, id, 'inativar'), { data: '2026-10-05' }, comRelogio(g));
    expect(r.status).toBe(200);
    expect(jogadorDetalhe.safeParse(r.corpo).success).toBe(true);
    expect(r.corpo).toMatchObject({ id, situacao: 'inativo', desde: '2026-10-05' });
    const denovo = await pedir('POST', rota(g, id, 'inativar'), { data: '2026-10-06' }, comRelogio(g));
    expect(denovo.status).toBe(409);
    expect(denovo.corpo).toEqual({ erro: { codigo: 'ja_inativo', mensagem: 'O jogador já está inativo.' } });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
  });

  it('reativar ativo → 409 "O jogador já está ativo."; reativar inativo → 200 com o novo período', async () => {
    const g = await grupoNovo();
    const id = await jogador(g);
    const ativo = await pedir('POST', rota(g, id, 'reativar'), { data: '2026-10-12' }, comRelogio(g));
    expect(ativo.status).toBe(409);
    expect(ativo.corpo).toEqual({ erro: { codigo: 'ja_ativo', mensagem: 'O jogador já está ativo.' } });
    await pedir('POST', rota(g, id, 'inativar'), { data: '2026-10-05' }, comRelogio(g));
    const r = await pedir('POST', rota(g, id, 'reativar'), { data: '2026-10-12' }, comRelogio(g));
    expect(r.status).toBe(200);
    expect(r.corpo).toMatchObject({
      situacao: 'ativo',
      desde: '2026-10-12',
      inicioPontuacao: '2026-09-01',
      periodos: [
        { inicio: '2026-09-01', fim: '2026-10-05' },
        { inicio: '2026-10-12', fim: null },
      ],
    });
  });

  it('sem data (corpo vazio ou {}): usa o hoje de São Paulo, às 22h de 31/12', async () => {
    const g = await grupoNovo();
    const id = await jogador(g);
    expect((await pedir('POST', rota(g, id, 'inativar'), undefined, comRelogio(g))).status).toBe(200);
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: HOJE }]);
    expect((await pedir('POST', rota(g, id, 'reativar'), {}, comRelogio(g))).status).toBe(200);
    expect(await periodosDe(id)).toEqual([
      { inicio: '2026-09-01', fim: HOJE },
      { inicio: HOJE, fim: null },
    ]);
  });

  it.each([
    ['data que não existe', '2026-02-30', 'Informe uma data válida.'],
    ['data fora do formato', '30/09/2026', 'Informe uma data válida.'],
    ['data futura em São Paulo (01/01/2027, já hoje em UTC)', '2027-01-01', 'A data não pode ser no futuro.'],
    [
      'saída antes do início do período',
      '2026-08-31',
      'A saída não pode ser antes do início deste período (01/09/2026).',
    ],
  ])('inativar com %s: 422 com a mensagem do domínio no campo data e nada muda', async (_caso, data, mensagem) => {
    const g = await grupoNovo();
    const id = await jogador(g);
    const r = await pedir('POST', rota(g, id, 'inativar'), { data }, comRelogio(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { data: mensagem } } });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('reativar com retorno antes da saída anterior: 422 no campo data e nada muda (GEL-58, GEL-66)', async () => {
    const g = await grupoNovo();
    const id = await jogador(g);
    await pedir('POST', rota(g, id, 'inativar'), { data: '2026-10-05' }, comRelogio(g));
    const r = await pedir('POST', rota(g, id, 'reativar'), { data: '2026-10-04' }, comRelogio(g));
    expect(r.status).toBe(422);
    expect(r.corpo).toMatchObject({
      erro: { campos: { data: 'O retorno não pode ser antes da saída anterior (05/10/2026).' } },
    });
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: '2026-10-05' }]);
  });

  it('campo desconhecido no corpo: 422', async () => {
    const g = await grupoNovo();
    const id = await jogador(g);
    const r = await pedir('POST', rota(g, id, 'inativar'), { dataSaida: '2026-10-05' }, comRelogio(g));
    expect(r.status).toBe(422);
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });

  it('jogador de outro grupo: 404 nas duas, nada muda; grupo arquivado: 409 grupo_arquivado', async () => {
    const g = await grupoNovo();
    const outro = await grupoNovo();
    const alheio = await jogador(outro);
    for (const acao of ['inativar', 'reativar']) {
      const r = await pedir('POST', rota(g, alheio, acao), { data: '2026-10-05' }, comRelogio(g));
      expect(r.status).toBe(404);
    }
    expect(await periodosDe(alheio)).toEqual([{ inicio: '2026-09-01', fim: null }]);

    const id = await jogador(g);
    await comoOwner('UPDATE grupos SET arquivado_em = now() WHERE id = $1', [g.id]);
    for (const acao of ['inativar', 'reativar']) {
      const r = await pedir('POST', rota(g, id, acao), { data: '2026-10-05' }, comRelogio(g));
      expect(r.status).toBe(409);
      expect(r.corpo).toMatchObject({ erro: { codigo: 'grupo_arquivado' } });
    }
    expect(await periodosDe(id)).toEqual([{ inicio: '2026-09-01', fim: null }]);
  });
});
