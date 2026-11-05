import { LIMITE_JOGADORES_FREE } from '@pelada/dominio';
import { Link } from 'react-router';
import { useSomenteLeitura, type MotivoSomenteLeitura } from '../dados/somente-leitura.ts';
import { caminhoMeuPlano } from './AvisoRecursoPro.tsx';
import { Faixa } from './Faixa.tsx';

/**
 * Faixa de somente leitura (planos-e-cobranca T43; PLA-22, AD-064): no topo das telas do grupo quando o plano diz que
 * ele passou do limite do Free, com o motivo e o link para Meu plano. É a `Faixa` do guia (`faixa--atencao`,
 * `role="status"`); sem motivo, não aparece nada.
 */

export const TITULO_SOMENTE_LEITURA = 'Este grupo passou do limite do plano Free';

export function textoDoMotivo(motivo: MotivoSomenteLeitura): string {
  return motivo === 'limite_jogadores'
    ? `Ele tem mais de ${LIMITE_JOGADORES_FREE} jogadores ativos e fica somente leitura até voltar a ${LIMITE_JOGADORES_FREE} ou assinar o Pro. Inativar jogador continua permitido.`
    : 'No Free, só o grupo mais antigo de quem o criou pode ser editado; este fica somente leitura até assinar o Pro.';
}

export interface PropsFaixaSomenteLeitura {
  grupoId: string;
}

export function FaixaSomenteLeitura({ grupoId }: PropsFaixaSomenteLeitura) {
  const motivo = useSomenteLeitura(grupoId);
  if (motivo === null) return null;
  return (
    <Faixa
      tipo="atencao"
      titulo={TITULO_SOMENTE_LEITURA}
      acao={<Link to={caminhoMeuPlano(grupoId)}>Ver Meu plano</Link>}
    >
      <p>{textoDoMotivo(motivo)}</p>
    </Faixa>
  );
}
