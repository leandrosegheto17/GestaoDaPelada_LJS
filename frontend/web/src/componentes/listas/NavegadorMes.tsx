import { mesPorExtenso } from '../../formatacao';
import { Icone } from '../basicos/Icone';
import estilos from './NavegadorMes.module.css';

interface Props {
  /** Mês exibido, `AAAA-MM`. */
  mes: string;
  /** Meses vizinhos vindos da API (`null` = sem mês naquele sentido). Nenhum cálculo aqui. */
  mesAnterior: string | null;
  mesSeguinte: string | null;
  aoTrocar: (mes: string) => void;
}

export function NavegadorMes({ mes, mesAnterior, mesSeguinte, aoTrocar }: Props) {
  return (
    <nav className={estilos.mes} aria-label="Mês exibido">
      <button
        type="button"
        className={estilos.botao}
        disabled={mesAnterior === null}
        aria-label={mesAnterior === null ? 'Mês anterior' : `Mês anterior, ${mesPorExtenso(mesAnterior)}`}
        onClick={() => mesAnterior !== null && aoTrocar(mesAnterior)}
      >
        <Icone nome="anterior" tamanho={26} />
      </button>
      <h2 className={estilos.rotulo} aria-live="polite">
        {mesPorExtenso(mes)}
      </h2>
      <button
        type="button"
        className={estilos.botao}
        disabled={mesSeguinte === null}
        aria-label={mesSeguinte === null ? 'Mês seguinte' : `Mês seguinte, ${mesPorExtenso(mesSeguinte)}`}
        onClick={() => mesSeguinte !== null && aoTrocar(mesSeguinte)}
      >
        <Icone nome="seguinte" tamanho={26} />
      </button>
    </nav>
  );
}
