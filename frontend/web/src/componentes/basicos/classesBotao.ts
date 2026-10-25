import estilos from './Botao.module.css';
import { juntar } from './juntar';

export type VarianteBotao = 'principal' | 'secundario' | 'destrutivo' | 'texto' | 'textoDestrutivo';

export interface OpcoesClassesBotao {
  variante?: VarianteBotao;
  bloco?: boolean;
  topo?: boolean;
  carregando?: boolean;
}

/** Classes do botão, compartilhadas por `Botao` e `BotaoLink`. */
export function classesBotao({ variante = 'principal', bloco, topo, carregando }: OpcoesClassesBotao): string {
  const classes: (string | false | undefined)[] = [estilos.botao];
  if (variante === 'textoDestrutivo') classes.push(estilos.texto, estilos.textoDestrutivo);
  else classes.push(estilos[variante]);
  classes.push(bloco && estilos.bloco, topo && estilos.topo, carregando && estilos.carregando);
  return juntar(...classes);
}
