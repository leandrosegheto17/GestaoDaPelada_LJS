const AREA_PROTEGIDA = /^\/app(\/|$)/;

/** Início padrão depois de entrar: a lista de grupos. */
export const ROTA_INICIAL = '/app';

export function ehAreaProtegida(pathname: string): boolean {
  return AREA_PROTEGIDA.test(pathname);
}

/** Rota de entrada com a página pedida em `volta`, ou `null` se a página atual não exige login. */
export function destinoDeEntrada(pathname: string, search: string): string | null {
  if (!ehAreaProtegida(pathname)) return null;
  return `/entrar?volta=${encodeURIComponent(pathname + search)}`;
}

const INICIO_PERIGOSO = /^\/[/\\]/;

function temControle(texto: string): boolean {
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0;
    if (codigo < 0x20 || codigo === 0x7f) return true;
  }
  return false;
}

/**
 * Valida o `volta` lido da URL: só caminho local do app. Recusa `//`, `/\`, barra invertida,
 * esquema, caracteres de controle (CR/LF) e codificações que virem qualquer uma dessas formas.
 */
export function lerDestino(texto: string | null | undefined): string | null {
  if (!texto || !texto.startsWith('/')) return null;
  let decodificado: string;
  try {
    decodificado = decodeURIComponent(texto);
  } catch {
    return null;
  }
  for (const forma of [texto, decodificado]) {
    if (INICIO_PERIGOSO.test(forma) || forma.includes('\\') || temControle(forma)) return null;
  }
  return texto;
}
