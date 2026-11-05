import estilos from './Marca.module.css';

/**
 * Marca de presença (FUN-31; galeria do mockup: "Marca presente", "lesionado", "expulso",
 * "falta"), de `.specs/mockup/base.css:191-201`. O valor é a pontuação; a letra de canto (L, E)
 * é só uma pista visual, e o `rotulo` dá o texto para leitor de tela.
 */

export type Situacao = 'presente' | 'lesionado' | 'expulso' | 'falta' | 'sem';

const LETRA: Record<Situacao, 'p' | 'l' | 'e' | 'f' | 'x'> = {
  presente: 'p',
  lesionado: 'l',
  expulso: 'e',
  falta: 'f',
  sem: 'x',
};

export interface PropsMarca {
  situacao: Situacao;
  valor: string | number;
  /** Texto para leitor de tela (ex.: "Presente, 1 ponto"). Ausente: a marca é decorativa. */
  rotulo?: string;
}

export function Marca({ situacao, valor, rotulo }: PropsMarca) {
  const classe = `${estilos.marca} ${estilos[`marca--${LETRA[situacao]}`]}`;
  if (!rotulo) {
    return (
      <span className={classe} aria-hidden="true">
        {valor}
      </span>
    );
  }
  return (
    <span className={classe}>
      <span aria-hidden="true">{valor}</span>
      <span className="sr">{rotulo}</span>
    </span>
  );
}
