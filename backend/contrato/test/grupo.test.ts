import { describe, expect, it } from 'vitest';
import {
  arquivarCorpo,
  criarGrupoCorpo,
  dadosGrupo,
  editarGrupoCorpo,
  gruposResposta,
  MENSAGEM_DIA_SEMANA,
  MENSAGEM_FREQUENCIA,
  MENSAGEM_HORARIO_AUSENTE,
  MENSAGEM_HORARIO_INVALIDO,
  MENSAGEM_NOME_GRUPO,
  MENSAGEM_TEXTO_INVISIVEL,
  textoVisivel,
} from '../src/grupo.ts';

/** Contrato do grupo (T16; GEL-03 a GEL-07, GEL-19, SEC-005). */

const VALIDO = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' };

/** Mensagens da falha, por campo. */
function mensagens(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  const porCampo: Record<string, string[]> = {};
  for (const problema of resultado.error?.issues ?? []) {
    const campo = String(problema.path[0] ?? '');
    (porCampo[campo] ??= []).push(problema.message);
  }
  return porCampo;
}

describe('dadosGrupo', () => {
  it('GEL-01: o corpo válido passa como veio', () => {
    expect(dadosGrupo.parse(VALIDO)).toEqual(VALIDO);
  });

  it('GEL-03: "  AB  " (2 depois do trim) é recusado com a mensagem no nome', () => {
    const r = dadosGrupo.safeParse({ ...VALIDO, nome: '  AB  ' });
    expect(r.success).toBe(false);
    expect(mensagens(r)).toEqual({ nome: [MENSAGEM_NOME_GRUPO] });
    expect(MENSAGEM_NOME_GRUPO).toBe('O nome precisa ter de 3 a 60 caracteres.');
  });

  it('GEL-03: 61 caracteres são recusados com a mensagem', () => {
    const r = dadosGrupo.safeParse({ ...VALIDO, nome: 'a'.repeat(61) });
    expect(mensagens(r)).toEqual({ nome: [MENSAGEM_NOME_GRUPO] });
  });

  it('GEL-03: 3 e 60 caracteres são aceitos, e o nome sai sem os espaços das pontas', () => {
    expect(dadosGrupo.parse({ ...VALIDO, nome: '  ABC  ' }).nome).toBe('ABC');
    expect(dadosGrupo.parse({ ...VALIDO, nome: 'a'.repeat(60) }).nome).toBe('a'.repeat(60));
  });

  it('GEL-03: nome ausente ou que não é texto dá a mesma mensagem', () => {
    const { nome: _n, ...semNome } = VALIDO;
    expect(mensagens(dadosGrupo.safeParse(semNome))).toEqual({ nome: [MENSAGEM_NOME_GRUPO] });
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, nome: 123 }))).toEqual({ nome: [MENSAGEM_NOME_GRUPO] });
  });

  it.each(['Quinta', 'terça', 'feriado', '', null])('GEL-04: dia da semana %j recusado no campo diaSemana', (dia) => {
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, diaSemana: dia }))).toEqual({ diaSemana: [MENSAGEM_DIA_SEMANA] });
  });

  it.each(['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'])('GEL-04: %s aceito', (dia) => {
    expect(dadosGrupo.safeParse({ ...VALIDO, diaSemana: dia }).success).toBe(true);
  });

  it.each(['diaria', 'Semanal', 'anual', undefined])('GEL-05: frequência %j recusada no campo frequencia', (f) => {
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, frequencia: f }))).toEqual({
      frequencia: [MENSAGEM_FREQUENCIA],
    });
  });

  it.each(['semanal', 'quinzenal', 'mensal'])('GEL-05: %s aceita', (f) => {
    expect(dadosGrupo.safeParse({ ...VALIDO, frequencia: f }).success).toBe(true);
  });

  it('GEL-06: horário ausente dá "Informe o horário."', () => {
    const { horario: _h, ...semHorario } = VALIDO;
    expect(mensagens(dadosGrupo.safeParse(semHorario))).toEqual({ horario: [MENSAGEM_HORARIO_AUSENTE] });
    expect(MENSAGEM_HORARIO_AUSENTE).toBe('Informe o horário.');
  });

  it('GEL-06: horário vazio também pede o horário', () => {
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, horario: '' }))).toEqual({ horario: [MENSAGEM_HORARIO_AUSENTE] });
  });

  it.each(['24:00', '7:30', '12:60', '12h30', '1230', ' 20:30'])('GEL-06: %j dá "Horário inválido."', (h) => {
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, horario: h }))).toEqual({ horario: [MENSAGEM_HORARIO_INVALIDO] });
    expect(MENSAGEM_HORARIO_INVALIDO).toBe('Horário inválido.');
  });

  it.each(['00:00', '07:30', '23:59'])('GEL-06: %s aceito', (h) => {
    expect(dadosGrupo.safeParse({ ...VALIDO, horario: h }).success).toBe(true);
  });

  it.each([
    ['slug', { slug: 'outro-grupo' }],
    ['urlPublica', { urlPublica: 'https://exemplo.com/g/x' }],
    ['outro campo', { criadoPor: 'conta-x' }],
  ])('GEL-07: corpo com %s é recusado', (_nome, extra) => {
    expect(criarGrupoCorpo.safeParse({ ...VALIDO, ...extra }).success).toBe(false);
    expect(editarGrupoCorpo.safeParse({ ...VALIDO, ...extra }).success).toBe(false);
  });

  it('GEL-19: a edição usa as mesmas regras e mensagens da criação', () => {
    const r = editarGrupoCorpo.safeParse({ ...VALIDO, nome: 'AB', horario: '7:30' });
    expect(mensagens(r)).toEqual({ nome: [MENSAGEM_NOME_GRUPO], horario: [MENSAGEM_HORARIO_INVALIDO] });
  });
});

describe('textoVisivel (SEC-005)', () => {
  it.each([
    ['NUL', 'Grupo\u0000Nulo'],
    ['espaço de largura zero U+200B', 'Grupo​Zero'],
    ['inversão de direção U+202E', 'Grupo‮Invertido'],
    ['quebra de linha', 'Grupo\nQuebrado'],
  ])('SEC-005: %s no nome do grupo é recusado', (_nome, nome) => {
    expect(mensagens(dadosGrupo.safeParse({ ...VALIDO, nome }))).toEqual({ nome: [MENSAGEM_TEXTO_INVISIVEL] });
  });

  it('SEC-005: só invisíveis não passam como nome de 3 caracteres', () => {
    expect(dadosGrupo.safeParse({ ...VALIDO, nome: '​​​' }).success).toBe(false);
  });

  it('SEC-005: "Pelada São" em NFD sai em NFC', () => {
    const nfd = 'Pelada São';
    expect(nfd).not.toBe(nfd.normalize('NFC'));
    const nome = dadosGrupo.parse({ ...VALIDO, nome: nfd }).nome;
    expect(nome).toBe('Pelada São');
    expect(nome.length).toBe(10);
  });

  it('SEC-005: o tamanho conta o texto já em NFC', () => {
    const schema = textoVisivel(2, 3, 'tamanho');
    // "ão" em NFD tem 3 unidades; em NFC, 2: cabe no máximo de 3.
    expect(schema.parse('ão')).toBe('ão');
  });
});

describe('arquivarCorpo e respostas', () => {
  it('GEL-22: arquivar recebe o nome de confirmação como veio, sem trim', () => {
    expect(arquivarCorpo.parse({ nomeConfirmacao: ' Pelada ' })).toEqual({ nomeConfirmacao: ' Pelada ' });
  });

  it('GEL-22: arquivar recusa campo a mais e confirmação ausente', () => {
    expect(arquivarCorpo.safeParse({ nomeConfirmacao: 'x', forcar: true }).success).toBe(false);
    expect(arquivarCorpo.safeParse({}).success).toBe(false);
  });

  it('GEL-27: a lista separa ativos e arquivados', () => {
    const item = { id: 'g1', nome: 'Pelada', slug: 'pelada', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:30' };
    expect(gruposResposta.parse({ ativos: [item], arquivados: [] })).toEqual({ ativos: [item], arquivados: [] });
    expect(gruposResposta.safeParse({ ativos: [item] }).success).toBe(false);
  });
});
