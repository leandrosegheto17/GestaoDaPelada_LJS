import { useState } from 'react';
import { lerMoeda } from '../../formatacao';
import { Campo, type PropsCampo } from './Campo';
import { mensagemMoeda } from './mensagensMoeda';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada'> {
  /** Valor em centavos; `null` = vazio. */
  centavos: number | null;
  aoMudar: (centavos: number | null) => void;
  /** Faixa do contrato (ex.: `LIMITES.valorCentavos`). */
  faixa: { min: number; max: number };
  /** Vazio é aceito e devolve `null`. */
  opcional?: boolean;
}

function textoInicial(centavos: number | null): string {
  if (centavos === null) return '';
  const sinal = centavos < 0 ? '-' : '';
  const absoluto = Math.abs(centavos);
  return `${sinal}${Math.trunc(absoluto / 100)},${String(absoluto % 100).padStart(2, '0')}`;
}

export function CampoMoeda({ centavos, aoMudar, faixa, opcional, erro, ...moldura }: Props) {
  const [texto, setTexto] = useState(() => textoInicial(centavos));
  const [erroLocal, setErroLocal] = useState<string | undefined>(undefined);

  const conferir = () => {
    if (texto.trim() === '' && opcional) {
      setErroLocal(undefined);
      aoMudar(null);
      return;
    }
    const resultado = lerMoeda(texto, faixa);
    if (resultado.ok) {
      setErroLocal(undefined);
      aoMudar(resultado.centavos);
    } else {
      setErroLocal(mensagemMoeda(resultado.motivo, texto, faixa));
      aoMudar(null);
    }
  };

  return (
    <Campo {...moldura} erro={erro ?? erroLocal}>
      {(entrada) => (
        <input
          {...entrada}
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={conferir}
        />
      )}
    </Campo>
  );
}
