import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { BarraAdmin } from '../../componentes/barras/BarraAdmin';
import { PularConteudo } from '../../componentes/barras/PularConteudo';
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
  voltarPara?: string;
  voltarRotulo?: string;
  /** Mostra o botão do menu da conta na barra (t08 e t32). */
  comMenu?: boolean;
  ocupado?: boolean;
  children: ReactNode;
}

/** Página estreita das telas com sessão (barra de admin, "Voltar", título e conteúdo). */
export function PaginaInterna({
  titulo,
  tituloDocumento,
  nomeGrupo,
  destinoTrocarGrupo,
  voltarPara,
  voltarRotulo,
  comMenu,
  ocupado,
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
        {...(comMenu ? { aoAbrirMenu: () => setMenuAberto(true), menuAberto } : {})}
      />
      <main id="conteudo" tabIndex={-1} className="conteudo conteudo--estreito" aria-busy={ocupado || undefined}>
        {voltarPara && voltarRotulo ? <Voltar para={voltarPara} rotulo={voltarRotulo} /> : null}
        <h1 className="titulo">{titulo}</h1>
        {children}
      </main>
      {menuAberto ? <MenuConta aoFechar={() => setMenuAberto(false)} /> : null}
    </>
  );
}
