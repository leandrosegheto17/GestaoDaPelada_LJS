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
  // Os caminhos de arquivo das respostas são relativos ao telas.json; o mapa derivado mora noutra pasta.
  const caminho = (arquivo) => relative(pastaDoMapa, `${pastaMockup}/${arquivo}`).replaceAll('\\', '/');
  const reapontar = (resposta) => ({
    ...resposta,
    ...(resposta.arquivo ? { arquivo: caminho(resposta.arquivo) } : {}),
    ...(resposta.sequencia
      ? { sequencia: resposta.sequencia.map((item) => ({ ...item, arquivo: caminho(item.arquivo) })) }
      : {}),
  });
  const telas = ativas.map((nome) => {
    const original = mapa.telas.find((t) => nomeDaTela(t) === nome);
    if (!original) throw new Error(`Tela "${nome}" não existe em telas.json.`);
    const rota = ROTAS_VITRINE[nome];
    // SPEC_DEVIATION (conta-e-acesso, T42): tela marcada `"real": true` no telas.json é comparada na rota real do app,
    // com os passos e as respostas de API do próprio mapa (a vitrine só existe para os componentes base da fundação).
    if (!rota && !original.real) throw new Error(`Tela "${nome}" não tem rota de vitrine em config-fundacao.mjs.`);
    const base = {
      id: nome,
      nome: original.nome,
      estado: original.estado,
      mockup: relative(pastaDoMapa, `${pastaMockup}/${original.mockup}`).replaceAll('\\', '/'),
      viewports: ['pc', 'celular'],
      ...(original.esperar ? { esperar: original.esperar } : {}),
    };
    if (rota) return { ...base, rota };
    return {
      ...base,
      rota: original.rota,
      ...(original.respostas ? { respostas: original.respostas.map(reapontar) } : {}),
      ...(original.passos ? { passos: original.passos } : {}),
      ...(original.recorte ? { recorte: original.recorte } : {}),
    };
  });
  return { viewports: mapa.viewports, respostas: [], ocultar: mapa.ocultar ?? [], telas };
}
