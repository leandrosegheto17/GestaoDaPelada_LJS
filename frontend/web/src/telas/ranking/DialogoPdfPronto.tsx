import { useState } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { compartilhar, TITULO_PDF_PRONTO, type NavegadorCompartilha } from '../../pdf/entregar.ts';

/**
 * Diálogo "PDF pronto." (partidas-e-ranking T69; PAR-105), de `.specs/mockup/telas/t01-ranking--pdf-compartilhar.html`:
 * "Ranking de <mês> de <ano> da <grupo>.", "Baixar" (secundário) e "Compartilhar" (principal). O compartilhamento
 * recusado deixa o diálogo aberto; o concluído fecha; outra falha vai a `aoFalhar` (a faixa de erro do PDF, T70).
 */

export interface PropsDialogoPdfPronto {
  arquivo: File;
  /** "outubro de 2026". */
  mesPorExtenso: string;
  grupo: string;
  aoBaixar: () => void;
  aoCompartilhar: () => void;
  aoFalhar: (erro: unknown) => void;
  aoFechar: () => void;
  navegador?: NavegadorCompartilha | undefined;
}

export function textoPdfPronto(mesPorExtenso: string, grupo: string): string {
  return `Ranking de ${mesPorExtenso} da ${grupo}.`;
}

export function DialogoPdfPronto({
  arquivo,
  mesPorExtenso,
  grupo,
  aoBaixar,
  aoCompartilhar,
  aoFalhar,
  aoFechar,
  navegador,
}: PropsDialogoPdfPronto) {
  const [compartilhando, setCompartilhando] = useState(false);
  const texto = textoPdfPronto(mesPorExtenso, grupo);

  const aoTocarCompartilhar = async () => {
    setCompartilhando(true);
    try {
      const resultado = await compartilhar(
        arquivo,
        { title: arquivo.name, text: texto },
        navegador,
      );
      if (resultado === 'compartilhado') aoCompartilhar();
    } catch (erro) {
      aoFalhar(erro);
    } finally {
      setCompartilhando(false);
    }
  };

  return (
    <Dialogo
      titulo={TITULO_PDF_PRONTO}
      descricao={texto}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoBaixar}>
            Baixar
          </Botao>
          <Botao
            variante="principal"
            onClick={() => void aoTocarCompartilhar()}
            disabled={compartilhando}
          >
            Compartilhar
          </Botao>
        </>
      }
    />
  );
}
