// Critérios: ACE-01, ACE-02, ACE-03, ACE-18, ACE-37 e as formas do design (Data Models).
import { describe, expect, it } from 'vitest';
import {
  adminsResposta,
  cadastroCorpo,
  conviteCadastroCorpo,
  conviteCorpo,
  emailCorpo,
  entrarCorpo,
  excluirCorpo,
  novaSenhaCorpo,
  sessaoEu,
  TERMOS_VERSAO,
  tokenCorpo,
  trocarSenhaCorpo,
} from '../src/index';

const TOKEN = 'A'.repeat(43);
const cadastro = { nome: 'Leandro', email: 'L@Ex.com', senha: 'senha-boa-123', termos: true };

describe('cadastroCorpo', () => {
  it('aceita o cadastro válido e normaliza o e-mail (ACE-01, ACE-05)', () => {
    expect(cadastroCorpo.parse(cadastro)).toEqual({ ...cadastro, email: 'l@ex.com' });
  });
  it('recusa termos: false (ACE-02)', () => {
    expect(cadastroCorpo.safeParse({ ...cadastro, termos: false }).success).toBe(false);
  });
  it('recusa campo extra', () => {
    expect(cadastroCorpo.safeParse({ ...cadastro, admin: true }).success).toBe(false);
  });
  it('indica o campo inválido: nome curto, e-mail ruim e senha curta (ACE-03)', () => {
    const r = cadastroCorpo.safeParse({ ...cadastro, nome: 'a', email: 'x', senha: '123' });
    expect(r.success).toBe(false);
    const campos = r.error?.issues.map((i) => i.path[0]).sort();
    expect(campos).toEqual(['email', 'nome', 'senha']);
  });
});

describe('corpos das demais rotas', () => {
  it('entrarCorpo aceita senha curta (sem regra de mínimo no login) e recusa senha vazia', () => {
    expect(entrarCorpo.safeParse({ email: 'a@ex.com', senha: 'x' }).success).toBe(true);
    expect(entrarCorpo.safeParse({ email: 'a@ex.com', senha: '' }).success).toBe(false);
  });
  it('emailCorpo e conviteCorpo exigem e-mail válido e recusam campo extra', () => {
    for (const s of [emailCorpo, conviteCorpo]) {
      expect(s.safeParse({ email: 'a@ex.com' }).success).toBe(true);
      expect(s.safeParse({ email: 'a' }).success).toBe(false);
      expect(s.safeParse({ email: 'a@ex.com', x: 1 }).success).toBe(false);
    }
  });
  it('tokenCorpo aceita 43 caracteres base64url e recusa outro formato', () => {
    expect(tokenCorpo.safeParse({ token: TOKEN }).success).toBe(true);
    expect(tokenCorpo.safeParse({ token: 'curto' }).success).toBe(false);
  });
  it('novaSenhaCorpo exige token e senha nova válida', () => {
    expect(novaSenhaCorpo.safeParse({ token: TOKEN, senha: 'senha-boa-123' }).success).toBe(true);
    expect(novaSenhaCorpo.safeParse({ token: TOKEN, senha: '123' }).success).toBe(false);
  });
  it('trocarSenhaCorpo exige a atual e uma nova válida', () => {
    expect(trocarSenhaCorpo.safeParse({ senhaAtual: 'x', novaSenha: 'senha-boa-123' }).success).toBe(true);
    expect(trocarSenhaCorpo.safeParse({ senhaAtual: 'x', novaSenha: '123' }).success).toBe(false);
    expect(trocarSenhaCorpo.safeParse({ novaSenha: 'senha-boa-123' }).success).toBe(false);
  });
  it('excluirCorpo exige a senha', () => {
    expect(excluirCorpo.safeParse({ senha: 'x' }).success).toBe(true);
    expect(excluirCorpo.safeParse({}).success).toBe(false);
  });
  it('conviteCadastroCorpo exige o aceite dos termos (ACE-34, ACE-02)', () => {
    const base = { token: TOKEN, nome: 'Ana', senha: 'senha-boa-123', termos: true };
    expect(conviteCadastroCorpo.safeParse(base).success).toBe(true);
    expect(conviteCadastroCorpo.safeParse({ ...base, termos: false }).success).toBe(false);
  });
});

describe('respostas', () => {
  it('sessaoEu tem id, nome, e-mail e grupos com acessaFinanceiro (ACE-18)', () => {
    const eu = {
      id: '1',
      nome: 'Ana',
      email: 'a@ex.com',
      grupos: [{ id: 'g', nome: 'Pelada', slug: 'pelada', acessaFinanceiro: false }],
    };
    expect(sessaoEu.parse(eu)).toEqual(eu);
    expect(sessaoEu.safeParse({ ...eu, senha_hash: 'x' }).success).toBe(false);
    expect(sessaoEu.safeParse({ id: '1', nome: 'Ana', email: 'a@ex.com' }).success).toBe(false);
  });
  it('adminsResposta tem admins e convites pendentes com validade (ACE-37)', () => {
    const r = {
      admins: [{ id: '1', nome: 'Ana', email: 'a@ex.com', acessaFinanceiro: true }],
      convites: [{ id: '2', email: 'b@ex.com', expiraEm: '2026-11-03T12:00:00.000Z' }],
    };
    expect(adminsResposta.parse(r)).toEqual(r);
    expect(adminsResposta.safeParse({ admins: r.admins }).success).toBe(false);
  });
});

describe('TERMOS_VERSAO', () => {
  it('é um texto não vazio', () => {
    expect(TERMOS_VERSAO).toMatch(/\S/);
  });
});
