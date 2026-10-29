import { conferirUrlNeon, UrlNeonRecusada } from '../../api/src/infraestrutura/seguranca/url-neon.ts';

/**
 * Variável de conexão de cada alvo (ADR-032): o Neon tem as próprias e `DATABASE_URL` vale só para o banco local.
 * - `--alvo producao`: `NEON_URL_MIGRACAO` (pelada_owner na branch `main`);
 * - `--alvo teste`: `NEON_URL_DEV` (pelada_owner na branch `dev`);
 * - sem `--alvo`: `DATABASE_URL` (a trava de host só deixa passar host local).
 */
export const VARIAVEL_DO_ALVO = { producao: 'NEON_URL_MIGRACAO', teste: 'NEON_URL_DEV' } as const;

/** Variável do alvo ausente: diz qual definir (sem valor nenhum na mensagem). */
export class UrlDoAlvoAusente extends UrlNeonRecusada {
  constructor(variavel: string) {
    super(`Defina ${variavel} no ambiente do terminal para este alvo (DATABASE_URL vale só para o banco local).`);
  }
}

/** URL do destino conforme o alvo. A outra variável nunca é lida: `DATABASE_URL` não vale para o Neon. */
export function urlDoAlvo(alvo: string | undefined, ambiente: Record<string, string | undefined>): string | undefined {
  if (alvo === 'producao' || alvo === 'teste') return ambiente[VARIAVEL_DO_ALVO[alvo]];
  return ambiente['DATABASE_URL'];
}

/**
 * Com `--alvo producao` ou `--alvo teste` o destino é o Neon (branch `main` ou `dev`, ADR-030): a URL passa pela
 * validação única (ADR-032) com o papel de owner, antes da trava de host e de qualquer conexão. Sem `--alvo`, nada a
 * conferir aqui: a trava de host só deixa passar host local. Lança `UrlNeonRecusada` (um `HostRecusado`).
 */
export function conferirAlvoNeon(url: string | undefined, alvo: string | undefined): void {
  if (alvo === 'producao' || alvo === 'teste') {
    if (!url) throw new UrlDoAlvoAusente(VARIAVEL_DO_ALVO[alvo]);
    conferirUrlNeon(url, 'owner');
  }
}
