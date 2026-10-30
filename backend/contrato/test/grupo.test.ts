// Critérios: GEL-03 (nome de 3 a 60 sem os espaços das pontas), GEL-04 (dia), GEL-05 (frequência), GEL-06 (horário),
// GEL-07 (slug e urlPublica recusados), GEL-19 (edição com as mesmas mensagens), GEL-23 (arquivar pede o nome digitado).
import { describe, expect, it } from 'vitest';
import {
  arquivarCorpo,
  criarGrupoCorpo,
  criarGrupoResposta,
  editarGrupoCorpo,
  grupoDetalhe,
  gruposResposta,
} from '../src/grupo.ts';
import { camposDe, sem } from './apoio.ts';

const valido = { nome: 'Pelada de Quinta', diaSemana: 'quinta', frequencia: 'semanal', horario: '20:00' };
const MSG_NOME = 'O nome precisa ter de 3 a 60 caracteres.';

describe.each([
  ['criarGrupoCorpo', criarGrupoCorpo],
  ['editarGrupoCorpo (GEL-19)', editarGrupoCorpo],
])('%s', (_nome, schema) => {
  it('aceita o corpo válido', () => {
    expect(schema.parse(valido)).toEqual(valido);
  });

  describe('nome (GEL-03)', () => {
    it('2 e 61 caracteres são recusados com a mensagem no campo nome', () => {
      expect(camposDe(schema, { ...valido, nome: 'ab' })).toEqual({ nome: MSG_NOME });
      expect(camposDe(schema, { ...valido, nome: 'a'.repeat(61) })).toEqual({ nome: MSG_NOME });
    });

    it('3 e 60 caracteres passam', () => {
      expect(schema.safeParse({ ...valido, nome: 'abc' }).success).toBe(true);
      expect(schema.safeParse({ ...valido, nome: 'a'.repeat(60) }).success).toBe(true);
    });

    it('espaços das pontas não contam e saem do valor', () => {
      expect(camposDe(schema, { ...valido, nome: '  ab  ' })).toEqual({ nome: MSG_NOME });
      expect(schema.parse({ ...valido, nome: `  ${'a'.repeat(60)}  ` }).nome).toBe('a'.repeat(60));
      expect(schema.parse({ ...valido, nome: '  Racha  ' }).nome).toBe('Racha');
    });

    it('ausente ou não texto cai na mesma mensagem', () => {
      expect(camposDe(schema, sem(valido, 'nome'))).toEqual({ nome: MSG_NOME });
      expect(camposDe(schema, { ...valido, nome: 123 })).toEqual({ nome: MSG_NOME });
    });
  });

  describe('dia da semana (GEL-04)', () => {
    it.each(['domingo', 'segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado'])('aceita %s', (dia) => {
      expect(schema.safeParse({ ...valido, diaSemana: dia }).success).toBe(true);
    });

    it.each(['terça', 'Quinta', 'feriado', '', undefined, 4])('recusa %j no campo diaSemana', (dia) => {
      expect(Object.keys(camposDe(schema, { ...valido, diaSemana: dia }))).toEqual(['diaSemana']);
    });
  });

  describe('frequência (GEL-05)', () => {
    it.each(['semanal', 'quinzenal', 'mensal'])('aceita %s', (frequencia) => {
      expect(schema.safeParse({ ...valido, frequencia }).success).toBe(true);
    });

    it.each(['diaria', 'Semanal', '', undefined])('recusa %j no campo frequencia', (frequencia) => {
      expect(Object.keys(camposDe(schema, { ...valido, frequencia }))).toEqual(['frequencia']);
    });
  });

  describe('horário (GEL-06)', () => {
    it.each(['00:00', '23:59', '09:30', '12:00'])('aceita %s', (horario) => {
      expect(schema.safeParse({ ...valido, horario }).success).toBe(true);
    });

    it('ausente → "Informe o horário."', () => {
      expect(camposDe(schema, sem(valido, 'horario'))).toEqual({ horario: 'Informe o horário.' });
      expect(camposDe(schema, { ...valido, horario: '' })).toEqual({ horario: 'Informe o horário.' });
    });

    it.each(['24:00', '12:60', '9:30', '0930', '12:00:00', ' 12:00', 'meio-dia', 1200, null])(
      'fora de HH:MM (%j) → "Horário inválido."',
      (horario) => {
        expect(camposDe(schema, { ...valido, horario })).toEqual({ horario: 'Horário inválido.' });
      },
    );
  });

  describe('campos que não se editam (GEL-07)', () => {
    it('corpo com slug é recusado', () => {
      expect(schema.safeParse({ ...valido, slug: 'outro' }).success).toBe(false);
    });

    it('corpo com urlPublica é recusado', () => {
      expect(schema.safeParse({ ...valido, urlPublica: 'https://x' }).success).toBe(false);
    });

    it('qualquer campo desconhecido é recusado', () => {
      expect(schema.safeParse({ ...valido, criadoPor: 'u1' }).success).toBe(false);
    });
  });
});

describe('arquivarCorpo (GEL-23)', () => {
  it('exige nomeConfirmacao em texto e não o altera (a comparação exata é da rota)', () => {
    expect(arquivarCorpo.parse({ nomeConfirmacao: '  Pelada de Quinta ' })).toEqual({
      nomeConfirmacao: '  Pelada de Quinta ',
    });
    expect(Object.keys(camposDe(arquivarCorpo, {}))).toEqual(['nomeConfirmacao']);
    expect(Object.keys(camposDe(arquivarCorpo, { nomeConfirmacao: 12 }))).toEqual(['nomeConfirmacao']);
  });

  it('recusa campo extra', () => {
    expect(arquivarCorpo.safeParse({ nomeConfirmacao: 'x', forcar: true }).success).toBe(false);
  });
});

describe('respostas', () => {
  const grupo = {
    id: 'g1',
    nome: 'Pelada de Quinta',
    slug: 'pelada-de-quinta',
    linkPublico: 'https://exemplo.com.br/g/pelada-de-quinta',
    diaSemana: 'quinta',
    frequencia: 'semanal',
    horario: '20:00',
  };

  it('criarGrupoResposta tem id, slug e link público (GEL-01)', () => {
    expect(criarGrupoResposta.parse({ id: 'g1', slug: 'pelada', linkPublico: 'https://x/g/pelada' })).toBeTruthy();
    expect(criarGrupoResposta.safeParse({ id: 'g1', slug: 'pelada' }).success).toBe(false);
  });

  it('grupoDetalhe traz os dados, as contagens e se a conta é a criadora (GEL-20)', () => {
    const detalhe = { ...grupo, jogadoresAtivos: 12, habilidades: 6, admins: 1, souCriador: true };
    expect(grupoDetalhe.parse(detalhe)).toEqual(detalhe);
    for (const campo of ['slug', 'linkPublico', 'jogadoresAtivos', 'habilidades', 'admins', 'souCriador']) {
      expect(grupoDetalhe.safeParse(sem(detalhe, campo)).success).toBe(false);
    }
  });

  it('gruposResposta separa ativos e arquivados, com dia, frequência e horário (GEL-27)', () => {
    const item = {
      id: 'g1',
      nome: 'Racha',
      slug: 'racha',
      diaSemana: 'sabado',
      frequencia: 'mensal',
      horario: '08:00',
    };
    expect(gruposResposta.parse({ ativos: [item], arquivados: [] })).toEqual({ ativos: [item], arquivados: [] });
    expect(gruposResposta.safeParse({ ativos: [] }).success).toBe(false);
    expect(gruposResposta.safeParse({ ativos: [sem(item, 'horario')], arquivados: [] }).success).toBe(false);
  });
});
