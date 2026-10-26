import type { ReactNode } from 'react';
import { juntar } from '../basicos/juntar';
import estilos from './Tabelas.module.css';

interface Props {
  /** Legenda da tabela, lida por leitores de tela (`caption` oculta). */
  legenda: string;
  colunas: readonly string[];
  /** A primeira célula de cada linha é o cabeçalho da linha. */
  linhas: readonly (readonly ReactNode[])[];
  /** Esconde a tabela no celular (usada com `.cartoes` equivalentes). */
  soDesktop?: boolean;
}

export function TabelaSimples({ legenda, colunas, linhas, soDesktop }: Props) {
  return (
    <table className={juntar(estilos.tabela, soDesktop && estilos.semanas)}>
      <caption className="sr">{legenda}</caption>
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha, i) => (
          <tr key={i}>
            {linha.map((celula, j) =>
              j === 0 ? (
                <th key={j} scope="row">
                  {celula}
                </th>
              ) : (
                <td key={j}>{celula}</td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
