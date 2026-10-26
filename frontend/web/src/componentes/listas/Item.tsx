import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icone } from '../basicos/Icone';
import { juntar } from '../basicos/juntar';
import estilos from './Lista.module.css';

interface Props {
  titulo: ReactNode;
  meta?: ReactNode;
  /** Rota do app: o item inteiro vira link, com a seta à direita. */
  para?: string;
  /** Quebra a linha quando os controles não cabem (ex.: nome + interruptor + ações). */
  quebra?: boolean;
  /** Selo logo abaixo da descrição (ex.: "Sem acesso ao financeiro"). */
  selo?: ReactNode;
  /** Valor à direita (pontos, saldo...). */
  lado?: ReactNode;
  /** Controles à direita (interruptor, botões de texto). Não combinam com `para`. */
  acoes?: ReactNode;
}

/** Linha da `Lista`. Link inteiro (`para`) ou linha comum com `lado` e `acoes`. */
export function Item({ titulo, meta, selo, para, quebra, lado, acoes }: Props) {
  const principal = (
    <span className={estilos.principal}>
      <span className={estilos.titulo}>{titulo}</span>
      {meta ? <span className={estilos.meta}>{meta}</span> : null}
      {selo}
    </span>
  );
  const ladoEl = lado ? <span className={estilos.lado}>{lado}</span> : null;
  const classe = juntar(estilos.item, quebra && estilos.quebra);
  if (para !== undefined) {
    return (
      <li>
        <Link className={classe} to={para}>
          {principal}
          {ladoEl}
          <span className={estilos.seta}>
            <Icone nome="seguinte" />
          </span>
        </Link>
      </li>
    );
  }
  return (
    <li className={classe}>
      {principal}
      {ladoEl}
      {acoes}
    </li>
  );
}
