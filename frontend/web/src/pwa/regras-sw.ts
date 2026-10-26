/** Página mostrada quando a navegação não pode ser atendida pelo shell nem pela rede (FUN-34). */
export const URL_OFFLINE = '/offline.html';

/**
 * Responde a uma navegação: tenta o shell (precache, depois rede) e, se falhar, devolve a página offline.
 * Sem nenhuma das duas, devolve erro de rede.
 */
export async function responderNavegacao(
  shell: () => Promise<Response>,
  offline: () => Promise<Response | undefined>,
): Promise<Response> {
  try {
    return await shell();
  } catch {
    return (await offline()) ?? Response.error();
  }
}
