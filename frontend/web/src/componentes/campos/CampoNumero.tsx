import type { ReactNode } from 'react';
import { Campo, type PropsCampo } from './Campo';
import estilos from './Campo.module.css';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  valor: number;
  aoMudar: (valor: number) => void;
  min: number;
  max: number;
  /** Ex.: "Diminuir jogadores por time". */
  rotuloDiminuir: string;
  /** Ex.: "Aumentar jogadores por time". */
  rotuloAumentar: string;
  /** Desliga a entrada e os dois botões (ex.: limite "Ilimitado"). */
  desabilitado?: boolean;
  /** Controle depois do "+", na mesma linha (ex.: caixa "Ilimitado"). */
  aoLado?: ReactNode;
}

export function CampoNumero({
  valor,
  aoMudar,
  min,
  max,
  rotuloDiminuir,
  rotuloAumentar,
  desabilitado,
  aoLado,
  ...moldura
}: Props) {
  const limitar = (n: number) => Math.min(max, Math.max(min, n));
  const digitado = (texto: string) => {
    const n = Number.parseInt(texto, 10);
    if (Number.isFinite(n)) aoMudar(limitar(n));
  };
  return (
    <Campo {...moldura}>
      {(entrada) => (
        <div className={estilos.numero}>
          <button
            type="button"
            className={estilos.numeroBotao}
            aria-label={rotuloDiminuir}
            disabled={desabilitado || valor <= min}
            onClick={() => aoMudar(limitar(valor - 1))}
          >
            {'−'}
          </button>
          <input
            {...entrada}
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            value={valor}
            disabled={desabilitado}
            onChange={(e) => digitado(e.target.value)}
          />
          <button
            type="button"
            className={estilos.numeroBotao}
            aria-label={rotuloAumentar}
            disabled={desabilitado || valor >= max}
            onClick={() => aoMudar(limitar(valor + 1))}
          >
            +
          </button>
          {aoLado}
        </div>
      )}
    </Campo>
  );
}
