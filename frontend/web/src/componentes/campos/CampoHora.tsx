import { Campo, type PropsCampo } from './Campo';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  /** `HH:MM`. */
  valor: string;
  aoMudar: (valor: string) => void;
}

export function CampoHora({ valor, aoMudar, ...moldura }: Props) {
  return (
    <Campo {...moldura}>
      {(entrada) => <input {...entrada} type="time" value={valor} onChange={(e) => aoMudar(e.target.value)} />}
    </Campo>
  );
}
