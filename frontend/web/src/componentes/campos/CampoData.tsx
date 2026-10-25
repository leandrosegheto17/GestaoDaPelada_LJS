import { Campo, type PropsCampo } from './Campo';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  /** `AAAA-MM-DD`, sem conversão de fuso. */
  valor: string;
  aoMudar: (valor: string) => void;
  min?: string;
  max?: string;
  /** Mostra a data sem permitir trocá-la (ex.: edição de partida). */
  somenteLeitura?: boolean;
}

export function CampoData({ valor, aoMudar, min, max, somenteLeitura, ...moldura }: Props) {
  return (
    <Campo {...moldura}>
      {(entrada) => (
        <input
          {...entrada}
          type="date"
          min={min}
          max={max}
          value={valor}
          readOnly={somenteLeitura}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Campo>
  );
}
