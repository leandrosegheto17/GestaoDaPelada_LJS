import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * Comparador de imagens da comparação visual (FUN-38): conta, pixel a pixel, quantos pixels
 * diferem entre dois PNG e aprova até o limite (padrão 1%, inclusivo). Imagens de tamanhos
 * diferentes reprovam com a mensagem dos dois tamanhos, sem comparar.
 *
 * `limiar` é a diferença mínima de cor (0 a 1) para um pixel contar como diferente: 0,1, o
 * padrão do pixelmatch, absorve a suavização de fonte.
 */

export const LIMITE_PADRAO = 0.01;
export const LIMIAR_PADRAO = 0.1;

/** Formata uma proporção (0,0123) como porcentagem com duas casas ("1,23%"). */
export function porcentagem(proporcao) {
  return `${(proporcao * 100).toFixed(2).replace('.', ',')}%`;
}

/**
 * @param {Buffer | Uint8Array} pngA
 * @param {Buffer | Uint8Array} pngB
 * @param {{ limite?: number, limiar?: number }} [opcoes]
 */
export function compararPng(pngA, pngB, opcoes = {}) {
  const limite = opcoes.limite ?? LIMITE_PADRAO;
  const limiar = opcoes.limiar ?? LIMIAR_PADRAO;
  const a = PNG.sync.read(Buffer.from(pngA));
  const b = PNG.sync.read(Buffer.from(pngB));

  if (a.width !== b.width || a.height !== b.height) {
    return {
      passou: false,
      diferentes: null,
      total: null,
      proporcao: 1,
      mensagem: `Tamanhos diferentes: ${a.width}x${a.height} contra ${b.width}x${b.height}. Compare imagens do mesmo viewport.`,
      diff: null,
    };
  }

  const { width, height } = a;
  const diff = new PNG({ width, height });
  const diferentes = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: limiar });
  const total = width * height;
  const proporcao = diferentes / total;
  const passou = proporcao <= limite;
  return {
    passou,
    diferentes,
    total,
    proporcao,
    mensagem: `${porcentagem(proporcao)} de pixels diferentes (${diferentes} de ${total}; limite ${porcentagem(limite)})${passou ? '' : ': reprovado'}.`,
    diff: PNG.sync.write(diff),
  };
}
