import type { ReactNode } from 'react';
import { BarraAdmin } from '../componentes/barras/BarraAdmin';
import estilos from './vitrine.module.css';

/** Barra do admin e conteúdo com título, como nas telas de lista do mockup. */
export function Moldura({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <>
      <BarraAdmin nomeGrupo="Pelada de Quinta" destinoTrocarGrupo="/admin" />
      <main className={estilos.conteudo}>
        <h1 className={estilos.titulo}>{titulo}</h1>
        {children}
      </main>
    </>
  );
}
