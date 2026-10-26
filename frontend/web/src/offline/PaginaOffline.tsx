import { BarraTitulo } from '../componentes/barras/BarraTitulo';
import { Botao } from '../componentes/basicos/Botao';
import { TelaMensagem } from '../componentes/basicos/TelaMensagem';

/** Página servida pelo service worker quando a rota não está em cache e não há rede (FUN-34). */
export function PaginaOffline() {
  return (
    <>
      <title>Sem conexão</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <TelaMensagem
        icone="semConexao"
        titulo="Sem conexão"
        texto="Não foi possível abrir esta página sem internet. Conecte-se e tente de novo."
        acao={<Botao onClick={() => location.reload()}>Tentar de novo</Botao>}
      />
    </>
  );
}
