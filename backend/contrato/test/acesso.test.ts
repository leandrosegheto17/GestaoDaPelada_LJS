import { describe, expect, it } from 'vitest';
import {
  cadastroCorpo,
  CODIGOS_ERRO,
  conviteCadastroCorpo,
  conviteCorpo,
  corpoDoErro,
  corpoErro,
  emailCorpo,
  entrarCorpo,
  erroDeValidacao,
  excluirCorpo,
  MENSAGENS_ERRO,
  novaSenhaCorpo,
  sessaoEu,
  TERMOS_VERSAO,
  tokenCorpo,
  trocarSenhaCorpo,
  adminsResposta,
} from '../src/acesso.ts';

/** Schemas das rotas de acesso (T12; ACE-02, ACE-58). */

const TOKEN = 'A'.repeat(43);
const CADASTRO = { nome: 'Ana Souza', email: 'ana@exemplo.com', senha: 'senha boa 123', termos: true };

describe('cadastroCorpo', () => {
  it('ACE-01: cadastro válido passa e normaliza o e-mail', () => {
    expect(cadastroCorpo.parse({ ...CADASTRO, email: ' Ana@Exemplo.COM ' }).email).toBe('ana@exemplo.com');
  });

  it.each([
    ['sem o campo termos', (({ termos: _t, ...resto }) => resto)(CADASTRO)],
    ['termos falso', { ...CADASTRO, termos: false }],
    ['termos como texto', { ...CADASTRO, termos: 'true' }],
  ])('ACE-02: %s falha com termos_obrigatorios', (_nome, corpo) => {
    const r = cadastroCorpo.safeParse(corpo);
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(erroDeValidacao(r.error).codigo).toBe('termos_obrigatorios');
    expect(r.error.issues.find((i) => i.path[0] === 'termos')?.message).toBe('termos_obrigatorios');
  });

  it('ACE-03: nome curto dá dados_invalidos com o campo nome', () => {
    const r = cadastroCorpo.safeParse({ ...CADASTRO, nome: 'A' });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(erroDeValidacao(r.error)).toEqual({
      erro: MENSAGENS_ERRO.dados_invalidos,
      codigo: 'dados_invalidos',
      campos: ['nome'],
    });
  });

  it('ACE-03: vários campos inválidos aparecem todos, em ordem', () => {
    const r = cadastroCorpo.safeParse({ ...CADASTRO, nome: '', email: 'x', senha: 'curta' });
    expect(r.success).toBe(false);
    if (!r.success) expect(erroDeValidacao(r.error).campos).toEqual(['email', 'nome', 'senha']);
  });
});

describe('.strict() em todo corpo', () => {
  it.each([
    ['cadastroCorpo', cadastroCorpo, CADASTRO],
    ['entrarCorpo', entrarCorpo, { email: 'a@b.com', senha: 'x' }],
    ['emailCorpo', emailCorpo, { email: 'a@b.com' }],
    ['tokenCorpo', tokenCorpo, { token: TOKEN }],
    ['novaSenhaCorpo', novaSenhaCorpo, { token: TOKEN, senha: 'senha boa 123' }],
    ['trocarSenhaCorpo', trocarSenhaCorpo, { senhaAtual: 'x', senhaNova: 'senha boa 123' }],
    ['excluirCorpo', excluirCorpo, { senha: 'x' }],
    ['conviteCorpo', conviteCorpo, { email: 'a@b.com' }],
    ['conviteCadastroCorpo', conviteCadastroCorpo, { token: TOKEN, nome: 'Ana', senha: 'senha boa 123', termos: true }],
  ] as const)('ACE-03: %s aceita o corpo válido e recusa campo a mais', (_nome, schema, valido) => {
    expect(schema.safeParse(valido).success).toBe(true);
    expect(schema.safeParse({ ...valido, e_dono: true }).success).toBe(false);
  });

  it('ACE-34: o cadastro pelo convite não aceita e-mail no corpo (o e-mail é o do convite)', () => {
    expect(
      conviteCadastroCorpo.safeParse({ token: TOKEN, nome: 'Ana', senha: 'senha boa 123', termos: true, email: 'a@b.com' }).success,
    ).toBe(false);
  });

  it('ACE-26: a senha nova da troca segue os limites da senha (73 caracteres falha)', () => {
    expect(trocarSenhaCorpo.safeParse({ senhaAtual: 'x', senhaNova: 'a'.repeat(73) }).success).toBe(false);
  });
});

describe('respostas', () => {
  it('ACE-18: sessaoEu com grupos é válida e recusa campo a mais (e_dono não sai)', () => {
    const eu = {
      id: '1',
      nome: 'Ana',
      email: 'ana@exemplo.com',
      grupos: [{ id: 'g', nome: 'Grupo', slug: 'grupo', acessaFinanceiro: false }],
    };
    expect(sessaoEu.safeParse(eu).success).toBe(true);
    expect(sessaoEu.safeParse({ ...eu, e_dono: true }).success).toBe(false);
  });

  it('ACE-37: adminsResposta tem admins e convites', () => {
    expect(
      adminsResposta.safeParse({
        admins: [{ id: '1', nome: 'Ana', email: 'a@b.com', acessaFinanceiro: true }],
        convites: [{ id: 'c', email: 'b@c.com', expiraEm: '2026-11-12T00:00:00.000Z' }],
      }).success,
    ).toBe(true);
  });

  it('ACE-29: corpoDoErro de unico_admin leva a lista de grupos e passa no corpoErro', () => {
    const corpo = corpoDoErro('unico_admin', { grupos: [{ id: 'g', nome: 'Grupo' }] });
    expect(corpoErro.parse(corpo)).toEqual({ erro: MENSAGENS_ERRO.unico_admin, codigo: 'unico_admin', grupos: [{ id: 'g', nome: 'Grupo' }] });
  });

  it('ACE-11: todo código de erro tem mensagem', () => {
    for (const codigo of CODIGOS_ERRO) expect(MENSAGENS_ERRO[codigo].length).toBeGreaterThan(0);
  });
});

describe('TERMOS_VERSAO', () => {
  it('ACE-58: está no formato AAAA-MM-DD e é uma data válida', () => {
    expect(TERMOS_VERSAO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${TERMOS_VERSAO}T00:00:00Z`).toISOString().slice(0, 10)).toBe(TERMOS_VERSAO);
  });
});
