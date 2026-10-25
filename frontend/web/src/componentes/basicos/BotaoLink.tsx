import { Link, type LinkProps } from 'react-router';
import { classesBotao, type OpcoesClassesBotao } from './classesBotao';

type Props = Omit<LinkProps, 'className'> & OpcoesClassesBotao;

/** Link com a aparência de botão (navegação, não ação). */
export function BotaoLink({ variante, bloco, topo, carregando, ...resto }: Props) {
  return <Link {...resto} className={classesBotao({ variante, bloco, topo, carregando })} />;
}
