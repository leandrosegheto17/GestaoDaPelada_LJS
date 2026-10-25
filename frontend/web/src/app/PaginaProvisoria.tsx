import { BarraTitulo } from '../componentes/barras/BarraTitulo';
import { TelaMensagem } from '../componentes/basicos/TelaMensagem';

/** Página `/` da fundação: o nome do produto e "Em breve" (as telas de verdade chegam nas features seguintes). */
export function PaginaProvisoria() {
  return (
    <>
      <title>Gestão da Pelada</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <TelaMensagem icone="info" titulo="Em breve" texto="Estamos preparando o Gestão da Pelada. Volte em breve." />
    </>
  );
}
