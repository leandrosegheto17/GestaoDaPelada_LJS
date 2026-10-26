import { useId, useState } from 'react';
import { LIMITES } from '@pelada/contrato';
import { Botao } from '../basicos/Botao';
import { Campo, type PropsCampo } from './Campo';

interface Props extends Omit<PropsCampo, 'children' | 'lado' | 'classeEntrada' | 'id'> {
  valor: string;
  aoMudar: (valor: string) => void;
  /** Obrigatório: `current-password` ou `new-password`. */
  autoComplete: 'current-password' | 'new-password';
  id?: string;
  /** Mostra o botão "Mostrar" (padrão). Telas de nova senha não têm. */
  comMostrar?: boolean;
}

export function CampoSenha({ valor, aoMudar, autoComplete, id, comMostrar = true, ...moldura }: Props) {
  const gerado = useId();
  const idEntrada = id ?? gerado;
  const [visivel, setVisivel] = useState(false);
  return (
    <Campo
      {...moldura}
      id={idEntrada}
      lado={
        comMostrar ? (
          <Botao
            variante="secundario"
            aria-pressed={visivel}
            aria-controls={idEntrada}
            onClick={() => setVisivel(!visivel)}
          >
            Mostrar
          </Botao>
        ) : undefined
      }
    >
      {(entrada) => (
        <input
          {...entrada}
          type={visivel ? 'text' : 'password'}
          autoComplete={autoComplete}
          maxLength={LIMITES.senha.max}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
        />
      )}
    </Campo>
  );
}
