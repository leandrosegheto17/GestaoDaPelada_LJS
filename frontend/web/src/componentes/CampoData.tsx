import { Campo, type PropsCampo } from './Campo.tsx';

/**
 * Campo de data (GEL-115), da marcação de `t16-jogador--novo.html` ("Data de entrada"):
 * `input type="date"` com o valor no formato do navegador (`aaaa-mm-dd`) e `min`/`max` no mesmo
 * formato. Rótulo, ajuda e erro seguem o `Campo` (erro ligado por `aria-describedby`).
 */

export type PropsCampoData = Omit<PropsCampo, 'type' | 'lateral' | 'min' | 'max'> & {
  /** Data mínima, `aaaa-mm-dd`. */
  min?: string | undefined;
  /** Data máxima, `aaaa-mm-dd` (ex.: hoje, na data de entrada). */
  max?: string | undefined;
};

export function CampoData(props: PropsCampoData) {
  return <Campo {...props} type="date" />;
}
