import type { JogadorDetalhe } from '@pelada/contrato/elenco';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useExcluirJogador } from '../../dados/elenco.ts';
import { useEmSomenteLeitura } from '../../dados/somente-leitura.ts';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';

/**
 * Excluir o jogador (GEL-84 a GEL-87, GEL-114), de `t16-jogador--excluir` e
 * `--exclusao-recusada` do mockup do módulo:
 * - "Excluir jogador" abre o `alertdialog` "Excluir <apelido>?" com o texto exato da spec
 *   (GEL-87), Cancelar com o foco e "Excluir jogador";
 * - 204: volta à lista de jogadores;
 * - 409 `jogador_com_historico`: a faixa de erro no topo da ficha com a mensagem da API e, para
 *   o jogador ativo, "Inativar em vez disso", que abre o diálogo de inativar (GEL-86);
 * - outra falha: a mensagem na mesma faixa.
 */

export const tituloExcluir = (apelido: string) => `Excluir ${apelido}?`;
export const TEXTO_EXCLUIR =
  'O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos.';

export function ExcluirJogador({
  grupoId,
  ficha,
  abrirInativar,
  alertar,
}: {
  grupoId: string;
  ficha: JogadorDetalhe;
  abrirInativar: () => void;
  /** Põe (ou tira, com `null`) a faixa de erro no topo da ficha. */
  alertar: (conteudo: ReactNode | null) => void;
}) {
  const navegar = useNavigate();
  const excluir = useExcluirJogador(grupoId, ficha.id);
  // Somente leitura (planos-e-cobranca T48; PLA-22): excluir é escrita na trava (AD-092).
  const somenteLeitura = useEmSomenteLeitura(grupoId);
  const [aberto, setAberto] = useState(false);

  function confirmar() {
    if (excluir.isPending) return;
    alertar(null);
    excluir.mutate(undefined, {
      onSuccess: () => {
        setAberto(false);
        void navegar(`${rotaDoGrupo(grupoId)}/jogadores`);
      },
      onError: (erro) => {
        setAberto(false);
        const mensagem = erro instanceof ErroApi ? erro.message : MENSAGEM_REDE;
        const comHistorico = erro instanceof ErroApi && erro.codigo === 'jogador_com_historico';
        alertar(
          <Faixa
            tipo="erro"
            acao={
              comHistorico && ficha.situacao === 'ativo' ? (
                <Botao
                  variante="texto"
                  onClick={() => {
                    alertar(null);
                    abrirInativar();
                  }}
                >
                  Inativar em vez disso
                </Botao>
              ) : undefined
            }
          >
            {mensagem}
          </Faixa>,
        );
      },
    });
  }

  return (
    <>
      <Botao variante="texto-destrutivo" disabled={somenteLeitura} onClick={() => setAberto(true)}>
        Excluir jogador
      </Botao>
      {aberto ? (
        <Dialogo
          alerta
          titulo={tituloExcluir(ficha.apelido)}
          descricao={TEXTO_EXCLUIR}
          aoFechar={() => setAberto(false)}
          acoes={
            <>
              <Botao variante="secundario" autoFocus onClick={() => setAberto(false)}>
                Cancelar
              </Botao>
              <Botao variante="destrutivo" carregando={excluir.isPending} onClick={confirmar}>
                Excluir jogador
              </Botao>
            </>
          }
        />
      ) : null}
    </>
  );
}
