import { Route, Routes } from 'react-router';
import { ErroRede } from '../componentes/basicos/ErroRede';
import { FormaEsqueleto } from '../componentes/basicos/Esqueleto';
import { TelaMensagem } from '../componentes/basicos/TelaMensagem';
import { BarraTitulo } from '../componentes/barras/BarraTitulo';
import { Moldura } from './Moldura';

/** Estados do mockup com a aparência final (`padrao--erro-rede`), parados, para a comparação visual (FUN-37). */
function ErroDeRede() {
  return (
    <Moldura titulo="Partidas">
      <ErroRede aoTentar={() => undefined} />
    </Moldura>
  );
}

/** `padrao--carregando-lista`: o esqueleto já visível, sem o atraso de 300 ms. */
function CarregandoLista() {
  return (
    <Moldura titulo="Jogadores">
      <p className="sr" role="status">
        Carregando…
      </p>
      <FormaEsqueleto variante="bloco" quantidade={6} />
    </Moldura>
  );
}

/** `t03-indisponivel--erro`. */
function GrupoIndisponivel() {
  return (
    <>
      <title>Grupo indisponível</title>
      <BarraTitulo titulo="Gestão da Pelada" />
      <TelaMensagem
        icone="proibido"
        titulo="Grupo indisponível"
        texto="Este grupo não está disponível no momento. Fale com o admin do seu grupo."
      />
    </>
  );
}

export function Vitrine() {
  return (
    <div data-vitrine="">
      <Routes>
        <Route path="erro-rede" element={<ErroDeRede />} />
        <Route path="carregando-lista" element={<CarregandoLista />} />
        <Route path="grupo-indisponivel" element={<GrupoIndisponivel />} />
      </Routes>
    </div>
  );
}
