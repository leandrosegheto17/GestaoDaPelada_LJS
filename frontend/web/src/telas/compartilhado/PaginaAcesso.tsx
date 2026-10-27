import type { FormEvent, ReactNode } from 'react';
import { BarraTitulo } from '../../componentes/barras/BarraTitulo';
import { PularConteudo } from '../../componentes/barras/PularConteudo';
import { Voltar } from '../../componentes/basicos/Voltar';

interface PropsPagina {
  /** `<title>` e `h1` da página. */
  titulo: string;
  voltarPara?: string;
  voltarRotulo?: string;
  /** Voltar por conta da tela (ex.: no histórico) em vez de ir a `voltarPara`. */
  aoVoltar?: () => void;
  /** Faz o leitor de tela saber que o conteúdo está carregando. */
  ocupado?: boolean;
  /** Conteúdo logo abaixo do título (ex.: selo e versão). */
  cabecalho?: ReactNode;
  children: ReactNode;
}

/** Página estreita das telas de acesso (mockup: barra com o nome do app, "Voltar", título e conteúdo). */
export function PaginaAcesso({
  titulo,
  voltarPara,
  voltarRotulo,
  aoVoltar,
  ocupado,
  cabecalho,
  children,
}: PropsPagina) {
  return (
    <>
      <title>{titulo}</title>
      <PularConteudo />
      <BarraTitulo titulo="Gestão da Pelada" />
      <main id="conteudo" tabIndex={-1} className="conteudo" aria-busy={ocupado || undefined}>
        {voltarPara && voltarRotulo ? (
          <Voltar para={voltarPara} rotulo={voltarRotulo} {...(aoVoltar ? { aoClicar: aoVoltar } : {})} />
        ) : null}
        <h1 className="titulo">{titulo}</h1>
        {cabecalho}
        {children}
      </main>
    </>
  );
}

interface PropsFormulario {
  aoEnviar: () => void;
  enviando?: boolean;
  /** Margem de cima (`acima-3`), quando o formulário vem logo depois de uma faixa. */
  classe?: string;
  children: ReactNode;
}

/** `<form>` sem validação do navegador (as mensagens são nossas) e com `aria-busy` ao enviar. */
export function Formulario({ aoEnviar, enviando = false, classe, children }: PropsFormulario) {
  const aoSubmeter = (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    aoEnviar();
  };
  return (
    <form
      className={classe ? `formulario ${classe}` : 'formulario'}
      noValidate
      onSubmit={aoSubmeter}
      aria-busy={enviando || undefined}
    >
      {children}
    </form>
  );
}
