import estilos from './PularConteudo.module.css';

interface Props {
  texto?: string;
  /** Id do elemento de destino (que deve ter `tabIndex={-1}`). */
  alvo?: string;
}

/** Primeiro elemento focável da página: fica fora da tela até receber foco. */
export function PularConteudo({ texto = 'Pular para o conteúdo', alvo = 'conteudo' }: Props) {
  return (
    <a
      className={estilos.pular}
      href={`#${alvo}`}
      onClick={(evento) => {
        evento.preventDefault();
        document.getElementById(alvo)?.focus();
      }}
    >
      {texto}
    </a>
  );
}
