import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BarraAdmin } from '../../componentes/barras/BarraAdmin';
import { PularConteudo } from '../../componentes/barras/PularConteudo';
import { EsqueletoTitulo } from '../../componentes/basicos/Esqueleto';
import { Voltar } from '../../componentes/basicos/Voltar';
import { Folha, ListaFolha } from '../../componentes/dialogos/Folha';
import { OpcaoFolha } from '../../componentes/dialogos/OpcaoFolha';
import { useSair, useSessao } from '../../dados/sessao';

/** Menu da conta (t09): Minha conta, Privacidade, Termos de uso e Sair. */
function MenuConta({ aoFechar }: { aoFechar: () => void }) {
  const sessao = useSessao();
  const sair = useSair();
  const navegar = useNavigate();
  const aoSair = () => {
    sair.mutate(undefined, {
      onSuccess: () => {
        aoFechar();
        void navegar('/entrar', { replace: true });
      },
    });
  };
  return (
    <Folha titulo={sessao.data?.nome ?? 'Menu da conta'} aoFechar={aoFechar}>
      <ListaFolha>
        <OpcaoFolha para="/app/conta">Minha conta</OpcaoFolha>
        <OpcaoFolha para="/privacidade">Privacidade</OpcaoFolha>
        <OpcaoFolha para="/termos">Termos de uso</OpcaoFolha>
        <OpcaoFolha aoEscolher={aoSair}>Sair</OpcaoFolha>
      </ListaFolha>
    </Folha>
  );
}

interface Props {
  titulo: string;
  /** `<title>` da página; padrão: o próprio título. */
  tituloDocumento?: string;
  /** Nome na barra; sem ele, "Gestão da Pelada". */
  nomeGrupo?: string;
  destinoTrocarGrupo?: string;
  /** Atalho "Ver ranking" na barra (rota do app, ex.: `/g/<slug>`). */
  destinoRanking?: string;
  /** Título só para leitores de tela (o início do grupo, t09). */
  tituloOculto?: boolean;
  /** Largura cheia do conteúdo, sem o limite das telas de formulário (t09). */
  largo?: boolean;
  voltarPara?: string;
  voltarRotulo?: string;
  /** Mostra o botão do menu da conta na barra (t08 e t32). */
  comMenu?: boolean;
  ocupado?: boolean;
  /** O título ainda não chegou: fica só para leitores de tela e um esqueleto o substitui na vista. */
  tituloEmEsqueleto?: boolean;
  children: ReactNode;
}

/** Página estreita das telas com sessão (barra de admin, "Voltar", título e conteúdo). */
export function PaginaInterna({
  titulo,
  tituloDocumento,
  nomeGrupo,
  destinoTrocarGrupo,
  destinoRanking,
  tituloOculto,
  largo,
  voltarPara,
  voltarRotulo,
  comMenu,
  ocupado,
  tituloEmEsqueleto,
  children,
}: Props) {
  const [menuAberto, setMenuAberto] = useState(false);
  return (
    <>
      <title>{tituloDocumento ?? titulo}</title>
      <PularConteudo />
      <BarraAdmin
        {...(nomeGrupo ? { nomeGrupo } : {})}
        {...(destinoTrocarGrupo ? { destinoTrocarGrupo } : {})}
        {...(destinoRanking ? { destinoRanking } : {})}
        {...(comMenu ? { aoAbrirMenu: () => setMenuAberto(true), menuAberto } : {})}
      />
      <main
        id="conteudo"
        tabIndex={-1}
        className={largo ? 'conteudo conteudo--admin' : 'conteudo conteudo--estreito'}
        aria-busy={ocupado || undefined}
      >
        {voltarPara && voltarRotulo ? <Voltar para={voltarPara} rotulo={voltarRotulo} /> : null}
        <h1 className={tituloOculto ? 'sr' : 'titulo'}>
          {tituloEmEsqueleto ? (
            <>
              <span className="sr">{titulo}</span>
              <EsqueletoTitulo />
            </>
          ) : (
            titulo
          )}
        </h1>
        {children}
      </main>
      {menuAberto ? <MenuConta aoFechar={() => setMenuAberto(false)} /> : null}
    </>
  );
}
