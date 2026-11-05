import { Campo, type PropsCampo } from './Campo.tsx';

/**
 * Campo de horário (GEL-115), da marcação de `t27-novo-grupo--vazio.html` e
 * `t27-novo-grupo--erro.html` ("Horário"): `input type="time"`, valor `HH:MM`. O seletor do
 * navegador pode deixar o valor incompleto: quem usa envia o que houver e a API responde
 * "Horário inválido." no campo (GEL-06), mostrado aqui pelo `erro`.
 */

export type PropsCampoHora = Omit<PropsCampo, 'type' | 'lateral'>;

export function CampoHora(props: PropsCampoHora) {
  return <Campo {...props} type="time" />;
}
