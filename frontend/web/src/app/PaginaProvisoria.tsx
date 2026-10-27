import { useInRouterContext, useSearchParams } from 'react-router';
import { BarraTitulo } from '../componentes/barras/BarraTitulo';
import { Faixa } from '../componentes/basicos/Faixa';
import { TelaMensagem } from '../componentes/basicos/TelaMensagem';
import { AvisoInstalacao } from '../pwa/AvisoInstalacao';

function AvisoDaUrl() {
  const [parametros] = useSearchParams();
  if (parametros.get('aviso') !== 'conta-excluida') return null;
  // Na largura de conteúdo das telas de acesso, como no mockup (t32, conta excluída).
  return (
    <div className="conteudo conteudo--estreito">
      <Faixa tipo="sucesso">Sua conta foi excluída.</Faixa>
    </div>
  );
}

/**
 * Página `/` da fundação: o nome do produto e "Em breve" (as telas de verdade chegam nas features seguintes).
 * `?aviso=conta-excluida` (vindo de Minha conta, ACE-28) mostra a confirmação da exclusão.
 */
export function PaginaProvisoria() {
  // Fora de um roteador (testes isolados da página) não há URL para ler.
  const noRoteador = useInRouterContext();
  return (
    <>
      <title>Gestão da Pelada</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <AvisoInstalacao />
      {noRoteador ? <AvisoDaUrl /> : null}
      <TelaMensagem icone="info" titulo="Em breve" texto="Estamos preparando o Gestão da Pelada. Volte em breve." />
    </>
  );
}
