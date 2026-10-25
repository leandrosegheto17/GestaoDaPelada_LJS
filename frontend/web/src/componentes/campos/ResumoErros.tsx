import { Faixa } from '../basicos/Faixa';
import estilos from './ResumoErros.module.css';

export interface ErroDeCampo {
  idCampo: string;
  rotulo: string;
}

interface Props {
  erros: readonly ErroDeCampo[];
}

/** Só aparece com 2 ou mais erros; cada item leva o foco ao campo. */
export function ResumoErros({ erros }: Props) {
  if (erros.length < 2) return null;
  return (
    <Faixa tipo="erro" semIcone className={estilos.resumo}>
      <strong>Corrija {erros.length} campos:</strong>
      <ul>
        {erros.map((e) => (
          <li key={e.idCampo}>
            <a
              href={`#${e.idCampo}`}
              onClick={(evento) => {
                evento.preventDefault();
                document.getElementById(e.idCampo)?.focus();
              }}
            >
              {e.rotulo}
            </a>
          </li>
        ))}
      </ul>
    </Faixa>
  );
}
