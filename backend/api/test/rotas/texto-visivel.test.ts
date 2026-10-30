import { MENSAGEM_TEXTO_INVISIVEL } from '@pelada/contrato';
import { describe, expect, it } from 'vitest';
import { cenarioDeAcesso } from '../apoio/acesso.ts';
import { comoOwner } from '../apoio/owner-worker.ts';
import { criarSessao, type SessaoDeTeste } from '../apoio/sessao-worker.ts';

// Caracteres de controle e invisíveis nos nomes (T77; SEC-005), de ponta a ponta no Worker: NUL dava 500 (o Postgres
// recusa o byte 0 em text) e U+200B deixava "Beto" e "Beto"+U+200B como dois apelidos. Agora: 422 com a mensagem no
// campo, nada gravado, e o texto acentuado guardado em NFC.

const { pedir } = cenarioDeAcesso();
const unico = () => crypto.randomUUID().slice(0, 8);
const GRUPO = { diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' } as const;
const JOGADOR = { anoNascimento: 1990, posicao: 'meia' } as const;

interface Grupo {
  s: SessaoDeTeste;
  id: string;
}

async function grupoNovo(): Promise<Grupo> {
  const s = await criarSessao();
  const r = await pedir('POST', '/api/grupos', { nome: `Texto ${unico()}`, ...GRUPO }, { cookie: s.cookie });
  if (r.status !== 201) throw new Error(`criar grupo: ${r.status}`);
  return { s, id: (r.corpo as { id: string }).id };
}

function recusado(r: { status: number; corpo: unknown }, campo: string): void {
  expect(r.status).toBe(422);
  expect(r.corpo).toMatchObject({ erro: { codigo: 'dados_invalidos', campos: { [campo]: MENSAGEM_TEXTO_INVISIVEL } } });
}

describe('nome do grupo (SEC-005)', () => {
  it('NUL no nome ao criar: 422, não 500, e nenhum grupo criado', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/grupos', { nome: 'Grupo\u0000Nulo', ...GRUPO }, { cookie: s.cookie });
    recusado(r, 'nome');
    expect(await comoOwner('SELECT 1 FROM grupos WHERE criado_por = $1', [s.contaId])).toEqual([]);
  });

  it('U+202E e U+200B ao editar: 422 e o nome não muda', async () => {
    const g = await grupoNovo();
    const [antes] = await comoOwner<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [g.id]);
    for (const nome of ['\u202EGrupo Invertido', 'Grupo\u200BOculto']) {
      recusado(await pedir('PATCH', `/api/grupos/${g.id}`, { nome, ...GRUPO }, { cookie: g.s.cookie }), 'nome');
    }
    expect(await comoOwner('SELECT nome FROM grupos WHERE id = $1', [g.id])).toEqual([antes]);
  });

  it('nome acentuado decomposto (NFD) é guardado em NFC', async () => {
    const s = await criarSessao();
    const r = await pedir('POST', '/api/grupos', { nome: 'Pelada da Conceição', ...GRUPO }, { cookie: s.cookie });
    expect(r.status).toBe(201);
    const { id } = r.corpo as { id: string };
    expect(await comoOwner('SELECT nome FROM grupos WHERE id = $1', [id])).toEqual([{ nome: 'Pelada da Conceição' }]);
  });
});

describe('apelido (SEC-005)', () => {
  it('NUL no apelido: 422, não 500, e nenhum jogador criado', async () => {
    const g = await grupoNovo();
    const r = await pedir(
      'POST',
      `/api/grupos/${g.id}/jogadores`,
      { apelido: 'Ze\u0000ca', ...JOGADOR },
      {
        cookie: g.s.cookie,
      },
    );
    recusado(r, 'apelido');
    expect(await comoOwner('SELECT 1 FROM jogadores WHERE grupo_id = $1', [g.id])).toEqual([]);
  });

  it('"Beto" e "Beto"+U+200B deixam de ser dois apelidos: o segundo é recusado', async () => {
    const g = await grupoNovo();
    const url = `/api/grupos/${g.id}/jogadores`;
    expect((await pedir('POST', url, { apelido: 'Beto', ...JOGADOR }, { cookie: g.s.cookie })).status).toBe(201);
    recusado(await pedir('POST', url, { apelido: 'Beto\u200B', ...JOGADOR }, { cookie: g.s.cookie }), 'apelido');
    expect(await comoOwner('SELECT apelido FROM jogadores WHERE grupo_id = $1', [g.id])).toEqual([{ apelido: 'Beto' }]);
  });

  it('"José" em NFD é guardado em NFC e conta como repetido de "José" em NFC', async () => {
    const g = await grupoNovo();
    const url = `/api/grupos/${g.id}/jogadores`;
    const r = await pedir('POST', url, { apelido: 'José', ...JOGADOR }, { cookie: g.s.cookie });
    expect(r.status).toBe(201);
    expect(await comoOwner('SELECT apelido FROM jogadores WHERE grupo_id = $1', [g.id])).toEqual([{ apelido: 'José' }]);
    const repetido = await pedir('POST', url, { apelido: 'José', ...JOGADOR }, { cookie: g.s.cookie });
    expect(repetido.status).toBe(422);
    expect(repetido.corpo).toMatchObject({ erro: { campos: { apelido: expect.any(String) } } });
  });

  it('U+202E ao editar o apelido: 422 e o apelido não muda', async () => {
    const g = await grupoNovo();
    const criado = await pedir(
      'POST',
      `/api/grupos/${g.id}/jogadores`,
      { apelido: 'Toninho', ...JOGADOR },
      {
        cookie: g.s.cookie,
      },
    );
    const { id } = criado.corpo as { id: string };
    const r = await pedir(
      'PATCH',
      `/api/grupos/${g.id}/jogadores/${id}`,
      { apelido: '\u202Eohninot', ...JOGADOR },
      {
        cookie: g.s.cookie,
      },
    );
    recusado(r, 'apelido');
    expect(await comoOwner('SELECT apelido FROM jogadores WHERE id = $1', [id])).toEqual([{ apelido: 'Toninho' }]);
  });
});

describe('nome da habilidade (SEC-005)', () => {
  it('só invisíveis, NUL ou U+202E ao criar: 422 e nada criado', async () => {
    const g = await grupoNovo();
    const contar = async () => (await comoOwner('SELECT 1 FROM habilidades WHERE grupo_id = $1', [g.id])).length;
    const antes = await contar();
    for (const nome of ['\u200B\u200B', 'Pas\u0000se', '\u202EChute']) {
      recusado(await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome }, { cookie: g.s.cookie }), 'nome');
    }
    expect(await contar()).toBe(antes);
  });

  it('U+200B ao renomear: 422 e o nome não muda; nome acentuado em NFD vira NFC', async () => {
    const g = await grupoNovo();
    const criada = await pedir('POST', `/api/grupos/${g.id}/habilidades`, { nome: 'Cabeceio' }, { cookie: g.s.cookie });
    expect(criada.status).toBe(201);
    const { id } = criada.corpo as { id: string };
    const url = `/api/grupos/${g.id}/habilidades/${id}`;
    recusado(await pedir('PATCH', url, { nome: 'Cabe\u200Bceio' }, { cookie: g.s.cookie }), 'nome');
    expect(await comoOwner('SELECT nome FROM habilidades WHERE id = $1', [id])).toEqual([{ nome: 'Cabeceio' }]);

    expect((await pedir('PATCH', url, { nome: 'Proteção' }, { cookie: g.s.cookie })).status).toBe(200);
    expect(await comoOwner('SELECT nome FROM habilidades WHERE id = $1', [id])).toEqual([{ nome: 'Proteção' }]);
  });
});
