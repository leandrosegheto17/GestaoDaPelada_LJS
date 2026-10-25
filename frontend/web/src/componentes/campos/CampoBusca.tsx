import { useId } from 'react';
import estilos from './Campo.module.css';

interface Props {
  /** Rótulo falado e placeholder (ex.: "Buscar jogador"). */
  rotulo: string;
  valor: string;
  aoMudar: (texto: string) => void;
}

/** Caixa de busca local: o rótulo é só para leitor de tela; o placeholder faz o papel visual. */
export function CampoBusca({ rotulo, valor, aoMudar }: Props) {
  const id = useId();
  return (
    <div>
      <label className="sr" htmlFor={id}>
        {rotulo}
      </label>
      <input
        id={id}
        className={estilos.entrada}
        type="search"
        placeholder={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
    </div>
  );
}
