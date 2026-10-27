import { TERMOS_VERSAO } from '@pelada/contrato';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { Selo } from '../../componentes/basicos/Selo';
import { PaginaAcesso } from './PaginaAcesso';

interface Props {
  titulo: string;
  /** Destino do "Voltar" quando a página foi aberta direto (sem tela anterior no app). */
  voltarPara: string;
  children: ReactNode;
}

/** Página pública de texto (termos e privacidade): selo de rascunho e versão (ACE-58, ACE-60). */
export function PaginaTexto({ titulo, voltarPara, children }: Props) {
  const navegar = useNavigate();
  const { key } = useLocation();
  // Veio de outra tela do app (cadastro, menu): volta para ela; aberta direto, vai ao destino padrão.
  const aoVoltar = key !== 'default' ? () => void navegar(-1) : undefined;
  return (
    <PaginaAcesso
      titulo={titulo}
      voltarPara={voltarPara}
      voltarRotulo="Voltar"
      {...(aoVoltar ? { aoVoltar } : {})}
      cabecalho={
        <p className="acima-2">
          <Selo tom="atencao">Rascunho para revisão</Selo> <span className="texto-sec">Versão {TERMOS_VERSAO}</span>
        </p>
      }
    >
      {children}
    </PaginaAcesso>
  );
}
