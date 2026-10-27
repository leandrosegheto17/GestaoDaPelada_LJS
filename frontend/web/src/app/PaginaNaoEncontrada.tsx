import { BarraTitulo } from '../componentes/barras/BarraTitulo';
import { BotaoLink } from '../componentes/basicos/BotaoLink';
import { Botao } from '../componentes/basicos/Botao';
import { TelaMensagem } from '../componentes/basicos/TelaMensagem';

/** Rota que não existe: tela do projeto, não a padrão do React Router. */
export function PaginaNaoEncontrada() {
  return (
    <>
      <title>Página não encontrada</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <TelaMensagem
        icone="info"
        titulo="Página não encontrada"
        texto="O endereço não existe ou foi movido."
        acao={<BotaoLink to="/">Ir para o início</BotaoLink>}
      />
    </>
  );
}

/** Falha ao abrir uma rota (ex.: pedaço do app que não carregou): tela do projeto com nova tentativa. */
export function PaginaErroDeRota() {
  return (
    <>
      <title>Algo deu errado</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <TelaMensagem
        icone="atencao"
        titulo="Algo deu errado"
        texto="Não foi possível abrir esta página. Verifique a conexão e tente de novo."
        alerta
        acao={<Botao onClick={() => location.reload()}>Tentar de novo</Botao>}
      />
    </>
  );
}
