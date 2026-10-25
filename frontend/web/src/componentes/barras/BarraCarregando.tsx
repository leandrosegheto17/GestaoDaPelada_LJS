import { FormaEsqueleto } from '../basicos/Esqueleto';
import estilos from './Barra.module.css';

/** Barra com gramado enquanto o nome do grupo ainda não chegou. */
export function BarraCarregando() {
  return (
    <header className={estilos.barra}>
      <div>
        <FormaEsqueleto variante="naBarra" />
      </div>
    </header>
  );
}
