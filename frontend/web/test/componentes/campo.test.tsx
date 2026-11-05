import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Campo, CampoSenha } from '../../src/componentes/Campo.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';

afterEach(() => {
  cleanup();
});

describe('Campo', () => {
  it('ACE-56: estado normal tem rótulo ligado à entrada, sem aria-invalid; axe sem violação', async () => {
    const { container } = render(<Campo id="email" rotulo="E-mail" type="email" autoComplete="username" />);
    const entrada = screen.getByLabelText('E-mail') as HTMLInputElement;
    expect(entrada.id).toBe('email');
    expect(entrada.className).toContain('campo__entrada');
    expect(entrada.getAttribute('aria-invalid')).toBeNull();
    expect(entrada.readOnly).toBe(false);
    expect(container.querySelector('.campo')).toBeTruthy();
    await esperarSemViolacoes(container);
  });

  it('ACE-56: com erro, o erro está ligado ao campo por aria-describedby, depois da ajuda; axe sem violação', async () => {
    const { container } = render(
      <Campo
        id="senha"
        rotulo="Senha"
        type="password"
        ajuda="De 8 a 72 caracteres."
        erro="A senha precisa ter pelo menos 8 caracteres."
      />,
    );
    const entrada = screen.getByLabelText('Senha');
    expect(entrada.getAttribute('aria-invalid')).toBe('true');
    expect(entrada.getAttribute('aria-describedby')).toBe('senha-ajuda senha-erro');
    const erro = document.getElementById('senha-erro');
    expect(erro?.textContent).toBe('A senha precisa ter pelo menos 8 caracteres.');
    expect(erro?.className).toContain('campo__erro');
    expect(document.getElementById('senha-ajuda')?.textContent).toBe('De 8 a 72 caracteres.');
    expect(container.querySelector('.campo')?.className).toContain('campo--erro');
    // O ícone do erro é decorativo.
    expect(erro?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    await esperarSemViolacoes(container);
  });

  it('ACE-56: sem erro nem ajuda, não há aria-describedby', () => {
    render(<Campo id="nome" rotulo="Seu nome" />);
    expect(screen.getByLabelText('Seu nome').getAttribute('aria-describedby')).toBeNull();
  });

  it('ACE-56: somente leitura tem readonly e aria-readonly; axe sem violação', async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Campo
        id="email"
        rotulo="E-mail"
        type="email"
        value="rodrigo@exemplo.com.br"
        onChange={onChange}
        somenteLeitura
        ajuda="O convite foi enviado para este e-mail."
      />,
    );
    const entrada = screen.getByLabelText('E-mail') as HTMLInputElement;
    expect(entrada.readOnly).toBe(true);
    expect(entrada.getAttribute('aria-readonly')).toBe('true');
    expect(entrada.getAttribute('aria-describedby')).toBe('email-ajuda');
    await esperarSemViolacoes(container);
  });
});

describe('CampoSenha', () => {
  it('ACE-56: alterna o type entre password e text, com aria-pressed e aria-controls', () => {
    render(<CampoSenha id="senha" rotulo="Senha" autoComplete="current-password" />);
    const entrada = screen.getByLabelText('Senha') as HTMLInputElement;
    const botao = screen.getByRole('button', { name: 'Mostrar' });
    expect(entrada.type).toBe('password');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
    expect(botao.getAttribute('aria-controls')).toBe('senha');
    expect(botao.getAttribute('type')).toBe('button');

    fireEvent.click(botao);
    expect(entrada.type).toBe('text');
    expect(botao.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(botao);
    expect(entrada.type).toBe('password');
    expect(botao.getAttribute('aria-pressed')).toBe('false');
  });

  it('ACE-56: com erro e mostrando a senha, axe sem violação', async () => {
    const { container } = render(<CampoSenha id="senha" rotulo="Senha" erro="Informe a senha." />);
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar' }));
    expect(screen.getByLabelText('Senha').getAttribute('aria-describedby')).toBe('senha-erro');
    await esperarSemViolacoes(container);
  });
});
