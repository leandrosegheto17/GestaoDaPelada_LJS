import { conferirUrlNeon, ROLES_NEON, type PapelNeon } from '../../api/src/infraestrutura/seguranca/url-neon.ts';

const USO = `Uso: PG_URL=... node conferir-url-neon-cli.ts --papel (${Object.keys(ROLES_NEON).join(' | ')}) --executar`;

/**
 * Confere a URL do Neon em `PG_URL` para o papel indicado (ADR-032), antes do dump cifrado do backup e do deploy.
 * A URL vem do ambiente, nunca da linha de comando, e nunca é impressa. Devolve o código de saída.
 */
export function main(argv: readonly string[], ambiente: Record<string, string | undefined> = process.env): number {
  const indice = argv.indexOf('--papel');
  const papel = indice >= 0 ? argv[indice + 1] : undefined;
  if (!argv.includes('--executar') || !papel || !Object.hasOwn(ROLES_NEON, papel)) {
    console.error(USO);
    return 1;
  }
  try {
    conferirUrlNeon(ambiente['PG_URL'], papel as PapelNeon);
    return 0;
  } catch (erro) {
    console.error((erro as Error).message);
    return 1;
  }
}
