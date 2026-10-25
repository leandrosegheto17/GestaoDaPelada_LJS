import { LIMITES } from '@pelada/contrato';
import { Campo, type PropsCampo, type PropsDeEntrada } from './Campo';
import estilos from './Campo.module.css';

interface PropsSeletor extends Partial<PropsDeEntrada> {
  id: string;
  /** Nota de 1 a 10, ou `null` quando vazia ("–"). */
  nota: number | null;
  aoMudar: (nota: number | null) => void;
}

const NOTAS = Array.from({ length: LIMITES.nota.max - LIMITES.nota.min + 1 }, (_, i) => LIMITES.nota.min + i);

/** Só o `<select>` da nota, para quem já tem o rótulo (ex.: linha de lista). */
export function SeletorNota({
  nota,
  aoMudar,
  className = `${estilos.entrada} ${estilos.nota}`,
  ...atributos
}: PropsSeletor) {
  return (
    <select
      {...atributos}
      className={className}
      value={nota === null ? '' : String(nota)}
      onChange={(e) => aoMudar(e.target.value === '' ? null : Number(e.target.value))}
    >
      <option value="">{'–'}</option>
      {NOTAS.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  nota: number | null;
  aoMudar: (nota: number | null) => void;
}

export function CampoNota({ nota, aoMudar, ...moldura }: Props) {
  return (
    <Campo {...moldura} classeEntrada="nota">
      {(entrada) => <SeletorNota {...entrada} nota={nota} aoMudar={aoMudar} />}
    </Campo>
  );
}
