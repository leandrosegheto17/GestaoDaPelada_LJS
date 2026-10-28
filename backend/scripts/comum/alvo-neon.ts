import { conferirUrlNeon } from '../../api/src/infraestrutura/seguranca/url-neon.ts';

/**
 * Com `--alvo producao` ou `--alvo teste` o destino é o Neon (branch `main` ou `dev`, ADR-030): a URL passa pela
 * validação única (ADR-032) com o papel de owner, antes da trava de host e de qualquer conexão. Sem `--alvo`, nada a
 * conferir aqui: a trava de host só deixa passar host local. Lança `UrlNeonRecusada` (um `HostRecusado`).
 */
export function conferirAlvoNeon(url: string | undefined, alvo: string | undefined): void {
  if (alvo === 'producao' || alvo === 'teste') conferirUrlNeon(url, 'owner');
}
