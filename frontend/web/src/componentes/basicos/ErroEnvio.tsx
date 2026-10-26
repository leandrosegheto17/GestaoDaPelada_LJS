import { Faixa } from './Faixa';

/** Falha de conexão ao enviar um formulário: os campos continuam preenchidos. */
export function ErroEnvio() {
  return <Faixa tipo="erro">Não foi possível enviar. Verifique a conexão.</Faixa>;
}
