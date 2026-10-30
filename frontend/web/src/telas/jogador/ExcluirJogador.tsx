import type { JogadorDetalhe } from '@pelada/contrato';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { recusaPorHistorico, useExcluirJogador } from '../../dados/elenco';

/**
 * SPEC_DEVIATION: o mockup t16 excluir diz "…quem não tem partidas nem notas."; vale o texto da spec e da T66
 * (GEL-87), que inclui os pagamentos.
 */
const TEXTO_EXCLUIR = 'O cadastro é apagado. Só é possível excluir quem não tem partidas, notas nem pagamentos.';

interface Props {
  grupoId: string;
  jogador: JogadorDetalhe;
  /** Recusa por histórico (409, GEL-85): a ficha mostra a mensagem com "Inativar em vez disso". */
  aoRecusar: (mensagem: string) => void;
}

/**
 * "Excluir jogador" (t16 excluir e exclusao-recusada, GEL-86, GEL-87): confirma com "Excluir <apelido>?" num diálogo
 * destrutivo (Esc não fecha; o foco começa em Cancelar). Excluído, volta à lista; com histórico, a API recusa com
 * 409 e nada é apagado.
 */
export function ExcluirJogador({ grupoId, jogador, aoRecusar }: Props) {
  const [aberto, setAberto] = useState(false);
  const refCancelar = useRef<HTMLButtonElement>(null);
  const excluir = useExcluirJogador(grupoId, jogador.id);
  const navegar = useNavigate();
  const recusa = recusaPorHistorico(excluir.error);
  const falhaDeEnvio = excluir.isError && recusa === null;

  const fechar = () => {
    excluir.reset();
    setAberto(false);
  };
  const confirmar = () =>
    excluir.mutate(undefined, {
      onSuccess: () => void navegar(`/app/grupos/${grupoId}/jogadores`),
      onError: (erro) => {
        const r = recusaPorHistorico(erro);
        if (!r) return;
        setAberto(false);
        aoRecusar(r.mensagem);
      },
    });

  return (
    <>
      <Botao variante="textoDestrutivo" onClick={() => setAberto(true)}>
        Excluir jogador
      </Botao>
      {aberto ? (
        <Dialogo
          titulo={`Excluir ${jogador.apelido}?`}
          descricao={TEXTO_EXCLUIR}
          destrutivo
          refFocoInicial={refCancelar}
          aoFechar={fechar}
          acoes={
            <>
              <Botao ref={refCancelar} variante="secundario" onClick={fechar}>
                Cancelar
              </Botao>
              <Botao
                variante="destrutivo"
                carregando={excluir.isPending}
                rotuloCarregando="Excluindo…"
                onClick={confirmar}
              >
                Excluir jogador
              </Botao>
            </>
          }
        >
          {falhaDeEnvio ? <ErroEnvio /> : null}
        </Dialogo>
      ) : null}
    </>
  );
}
