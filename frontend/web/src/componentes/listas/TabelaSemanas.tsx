import { useId } from 'react';
import { Indicadores } from './Indicadores';
import { TabelaSimples } from './TabelaSimples';
import estilos from './Tabelas.module.css';

export interface ColunaSemana {
  titulo: string;
  /** Nome curto usado no cartão do celular. */
  tituloCurto: string;
}

export interface Semana {
  /** Ex.: "19/10 a 25/10". */
  rotulo: string;
  /** Um valor por coluna (sem o rótulo). */
  valores: readonly string[];
}

interface Props {
  legenda: string;
  /** Colunas depois da primeira (que é o rótulo da semana). */
  colunas: readonly ColunaSemana[];
  semanas: readonly Semana[];
}

/** Tabela no PC e um cartão por semana no celular; a troca é só por CSS. */
export function TabelaSemanas({ legenda, colunas, semanas }: Props) {
  const base = useId();
  return (
    <>
      <TabelaSimples
        soDesktop
        legenda={legenda}
        colunas={['Semana', ...colunas.map((c) => c.titulo)]}
        linhas={semanas.map((s) => [s.rotulo, ...s.valores])}
      />
      <div className={estilos.cartoes}>
        {semanas.map((s, i) => (
          <section key={s.rotulo} className={estilos.cartao} aria-labelledby={`${base}-${i}`}>
            <h2 id={`${base}-${i}`} className={estilos.cartaoTitulo}>
              {s.rotulo}
            </h2>
            <Indicadores itens={colunas.map((c, j) => ({ rotulo: c.tituloCurto, valor: s.valores[j] ?? '' }))} />
          </section>
        ))}
      </div>
    </>
  );
}
