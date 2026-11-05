import { TERMOS_VERSAO } from '@pelada/contrato/acesso';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { SELO_RASCUNHO } from '../../src/telas/termos/Termos.tsx';
import { esperarSemViolacoes } from '../apoio/axe.ts';
import { abrirTela, json, SESSAO_ANA } from '../apoio/tela.tsx';

afterEach(() => {
  cleanup();
});

const PAGINAS = [
  ['/termos', 'Termos de uso', ['O serviço', 'Sua conta', 'Encerramento']],
  ['/privacidade', 'Privacidade', ['O que guardamos', 'E-mails', 'Quem vê', 'Como excluir seus dados']],
] as const;

describe('páginas de termos e privacidade', () => {
  for (const [caminho, titulo, secoes] of PAGINAS) {
    it(`ACE-58: ${caminho} abre sem sessão e mostra a versão igual a TERMOS_VERSAO`, async () => {
      const { local } = abrirTela(caminho);
      expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeTruthy();
      expect(local()).toBe(caminho);
      expect(screen.getByText(`Versão ${TERMOS_VERSAO}`)).toBeTruthy();
      expect(TERMOS_VERSAO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([...secoes]);
    });

    it(`ACE-58: ${caminho} também abre com sessão`, async () => {
      const { local } = abrirTela(caminho, { 'GET /api/sessao': () => json(200, SESSAO_ANA) });
      expect(await screen.findByRole('heading', { level: 1, name: titulo })).toBeTruthy();
      expect(local()).toBe(caminho);
    });

    it(`ACE-60: ${caminho} mostra a marca de rascunho`, async () => {
      abrirTela(caminho);
      const selo = await screen.findByText(SELO_RASCUNHO);
      expect(SELO_RASCUNHO).toBe('Rascunho para revisão');
      expect(selo.className).toContain('selo--atencao');
    });

    it(`ACE-56: ${caminho} passa no axe`, async () => {
      const { container } = abrirTela(caminho);
      await screen.findByRole('heading', { level: 1, name: titulo });
      await esperarSemViolacoes(container);
    });
  }
});
