import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/** Fração de pixels diferentes aceita na comparação visual (FUN-38). */
export const LIMITE_PADRAO = 0.01;

/**
 * Compara dois PNG pixel a pixel. Devolve `{ ok, diferenca, mensagem, imagemDiferenca }`, onde `diferenca` é a fração
 * (0 a 1) de pixels diferentes. Tamanhos diferentes reprovam sem comparar.
 */
export function compararImagens(a, b, { limite = LIMITE_PADRAO } = {}) {
  const imgA = PNG.sync.read(a);
  const imgB = PNG.sync.read(b);
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return {
      ok: false,
      diferenca: 1,
      mensagem: `tamanhos diferentes: ${imgA.width}x${imgA.height} contra ${imgB.width}x${imgB.height}`,
    };
  }
  const saida = new PNG({ width: imgA.width, height: imgA.height });
  const diferentes = pixelmatch(imgA.data, imgB.data, saida.data, imgA.width, imgA.height, {
    threshold: 0.1,
  });
  const diferenca = diferentes / (imgA.width * imgA.height);
  const ok = diferenca <= limite;
  return {
    ok,
    diferenca,
    mensagem: `${(diferenca * 100).toFixed(2)}% de pixels diferentes (limite ${(limite * 100).toFixed(2)}%)`,
    imagemDiferenca: PNG.sync.write(saida),
  };
}
