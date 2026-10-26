import estilos from './Barra.module.css';

interface Props {
  titulo: string;
}

/** Barra com gramado só com o nome do app (telas sem grupo); o `h1` fica no conteúdo da tela. */
export function BarraTitulo({ titulo }: Props) {
  return (
    <header className={estilos.barra}>
      <p className={estilos.titulo}>{titulo}</p>
    </header>
  );
}
