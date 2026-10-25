import { basename, relative } from 'node:path';

/** Rota de vitrine (build com `VITE_VITRINE=1`) de cada tela ativa da fundação. */
export const ROTAS_VITRINE = {
  'padrao--erro-rede': '/vitrine/erro-rede',
  'padrao--carregando-lista': '/vitrine/carregando-lista',
  't03-indisponivel--erro': '/vitrine/grupo-indisponivel',
};

/** Nome da tela = arquivo do mockup sem a extensão (ex.: `t03-indisponivel--erro`). */
export const nomeDaTela = (tela) => basename(tela.mockup, '.html');

/** Nomes que o `telas.json` do mockup conhece (base para validar `telas-ativas.txt`). */
export function nomesValidos(mapa) {
  return [...new Set(mapa.telas.map(nomeDaTela))];
}

/**
 * Deriva do `telas.json` do mockup o mapa da fundação: só as telas ativas, cada uma com `id` = nome, a rota de
 * vitrine no lugar da rota real e sem respostas de API (a vitrine não chama a API). Os caminhos do mockup passam
 * a ser relativos à pasta em que o mapa derivado será gravado.
 */
export function montarMapa(mapa, ativas, pastaMockup, pastaDoMapa) {
  const telas = ativas.map((nome) => {
    const original = mapa.telas.find((t) => nomeDaTela(t) === nome);
    if (!original) throw new Error(`Tela "${nome}" não existe em telas.json.`);
    const rota = ROTAS_VITRINE[nome];
    if (!rota) throw new Error(`Tela "${nome}" não tem rota de vitrine em config-fundacao.mjs.`);
    return {
      id: nome,
      nome: original.nome,
      estado: original.estado,
      mockup: relative(pastaDoMapa, `${pastaMockup}/${original.mockup}`).replaceAll('\\', '/'),
      rota,
      viewports: ['pc', 'celular'],
      ...(original.esperar ? { esperar: original.esperar } : {}),
    };
  });
  return { viewports: mapa.viewports, respostas: [], ocultar: mapa.ocultar ?? [], telas };
}
