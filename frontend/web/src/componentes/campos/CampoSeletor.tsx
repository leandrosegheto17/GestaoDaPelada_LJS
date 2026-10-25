import { Campo, type PropsCampo } from './Campo';

export interface OpcaoSeletor {
  valor: string;
  rotulo: string;
}

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  valor: string;
  aoMudar: (valor: string) => void;
  /** Rótulos vêm de `src/rotulos`, não daqui. */
  opcoes: readonly OpcaoSeletor[];
}

export function CampoSeletor({ valor, aoMudar, opcoes, ...moldura }: Props) {
  return (
    <Campo {...moldura}>
      {(entrada) => (
        <select {...entrada} value={valor} onChange={(e) => aoMudar(e.target.value)}>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      )}
    </Campo>
  );
}
