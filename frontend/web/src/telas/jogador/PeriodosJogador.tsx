import type { JogadorDetalhe } from '@pelada/contrato';
import { useState } from 'react';
import { Botao } from '../../componentes/basicos/Botao';
import { ErroEnvio } from '../../componentes/basicos/ErroEnvio';
import { CampoData } from '../../componentes/campos/CampoData';
import { Dialogo } from '../../componentes/dialogos/Dialogo';
import { Item } from '../../componentes/listas/Item';
import { Lista } from '../../componentes/listas/Lista';
import { useInativarJogador, useReativarJogador } from '../../dados/elenco';
import { deErroApi } from '../../dados/errosDeCampos';
import { dataCompleta, hojeEmSaoPaulo } from '../../formatacao';
import { CorrigirDatas } from './CorrigirDatas';
import estilos from './PeriodosJogador.module.css';

const AVISO_INATIVAR =
  'Ele sai do ranking, do lançamento, do simulador e do financeiro a partir da data de saída. O histórico e os pontos ficam guardados.';
const TEXTO_REATIVAR = 'Volta a aparecer no ranking e nas partidas; a data de início e os pontos não mudam.';

interface PropsDialogo {
  grupoId: string;
  jogador: JogadorDetalhe;
  aoFechar: () => void;
}

/** Inativar (t16 inativar, GEL-51, GEL-52, GEL-59): o aviso vem antes de confirmar; sem data a API usa hoje. */
function DialogoInativar({ grupoId, jogador, aoFechar }: PropsDialogo) {
  const [hoje] = useState(hojeEmSaoPaulo);
  const [data, setData] = useState(hoje);
  const inativar = useInativarJogador(grupoId, jogador.id);
  const erroDaData = deErroApi(inativar.error)?.['data'];
  const falhaDeEnvio = inativar.isError && !erroDaData;
  return (
    <Dialogo
      titulo={`Inativar ${jogador.apelido}`}
      descricao={AVISO_INATIVAR}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            carregando={inativar.isPending}
            rotuloCarregando="Inativando…"
            disabled={Boolean(erroDaData)}
            onClick={() => inativar.mutate({ data }, { onSuccess: aoFechar })}
          >
            Inativar
          </Botao>
        </>
      }
    >
      <CampoData
        id="saida"
        rotulo="Data de saída"
        max={hoje}
        erro={erroDaData}
        erroComoAlerta
        valor={data}
        aoMudar={(v) => {
          inativar.reset();
          setData(v);
        }}
      />
      {falhaDeEnvio ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

interface PropsReativar extends PropsDialogo {
  /** Chamado com o texto "<apelido> reativado desde <dd/mm/aaaa>." (GEL-60). */
  aoReativado: (texto: string) => void;
}

/** Reativar (t16 reativar e reativar-erro, GEL-54, GEL-55, GEL-60): o 422 de período aparece no campo da data. */
function DialogoReativar({ grupoId, jogador, aoFechar, aoReativado }: PropsReativar) {
  const [hoje] = useState(hojeEmSaoPaulo);
  const [data, setData] = useState(hoje);
  const reativar = useReativarJogador(grupoId, jogador.id);
  const erroDaData = deErroApi(reativar.error)?.['data'];
  const falhaDeEnvio = reativar.isError && !erroDaData;
  const saidaAnterior = jogador.periodos.map((p) => p.fim).findLast((fim) => fim !== null) ?? null;
  const ajuda =
    'Pode ser uma data que já passou, se ele voltou a jogar antes de você registrar.' +
    (saidaAnterior ? ` Não pode ser antes da saída anterior (${dataCompleta(saidaAnterior)}).` : '');
  return (
    <Dialogo
      titulo={`Reativar ${jogador.apelido}`}
      descricao={TEXTO_REATIVAR}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao
            carregando={reativar.isPending}
            rotuloCarregando="Reativando…"
            disabled={Boolean(erroDaData)}
            onClick={() =>
              reativar.mutate(
                { data },
                {
                  onSuccess: () => {
                    aoFechar();
                    aoReativado(`${jogador.apelido} reativado desde ${dataCompleta(data)}.`);
                  },
                },
              )
            }
          >
            Reativar
          </Botao>
        </>
      }
    >
      <CampoData
        id="retorno"
        rotulo="Data de retorno"
        max={hoje}
        ajuda={ajuda}
        erro={erroDaData}
        valor={data}
        aoMudar={(v) => {
          reativar.reset();
          setData(v);
        }}
      />
      {falhaDeEnvio ? <ErroEnvio /> : null}
    </Dialogo>
  );
}

interface Props {
  grupoId: string;
  jogador: JogadorDetalhe;
  /** Aviso de sucesso para a ficha mostrar (ex.: "Beto reativado desde 07/10/2026."). */
  aoAvisar: (texto: string) => void;
}

/**
 * Situação do jogador (t16 inativo e períodos): desde quando está ativo ou inativo, os períodos de atividade e as
 * ações Inativar ou Reativar (GEL-59, GEL-60). Sem as prévias de acumulado (C7).
 */
export function PeriodosJogador({ grupoId, jogador, aoAvisar }: Props) {
  const [dialogo, setDialogo] = useState<'inativar' | 'reativar' | null>(null);
  const ativo = jogador.situacao === 'ativo';
  return (
    <section className="secao" aria-labelledby="s-sit">
      <h2 id="s-sit" className="subtitulo">
        Situação
      </h2>
      <div className="formulario">
        <p className="paragrafo">
          {ativo ? 'Ativo' : 'Inativo'} desde {dataCompleta(jogador.desde)}.
        </p>
        <div className={estilos.campo}>
          <span className={estilos.rotulo} id="s-per">
            Períodos de atividade
          </span>
          <Lista rotuladaPor="s-per">
            {jogador.periodos.map((p, i) => (
              <Item
                key={p.id}
                quebra
                titulo={
                  <>
                    {dataCompleta(p.inicio)} <span aria-hidden="true">→</span>
                    <span className="sr">até</span> {p.fim ? dataCompleta(p.fim) : 'atual'}
                  </>
                }
                meta={i === 0 ? 'Entrada' : 'Retorno'}
                acoes={
                  <CorrigirDatas
                    grupoId={grupoId}
                    jogador={jogador}
                    periodo={p}
                    indice={i}
                    aoCorrigido={() => aoAvisar('Datas corrigidas.')}
                  />
                }
              />
            ))}
          </Lista>
        </div>
        {ativo ? null : <p className="paragrafo">{TEXTO_REATIVAR}</p>}
        <div className={estilos.botoes}>
          {ativo ? (
            <Botao variante="secundario" onClick={() => setDialogo('inativar')}>
              Inativar
            </Botao>
          ) : (
            <Botao variante="secundario" onClick={() => setDialogo('reativar')}>
              Reativar
            </Botao>
          )}
        </div>
      </div>
      {dialogo === 'inativar' ? (
        <DialogoInativar grupoId={grupoId} jogador={jogador} aoFechar={() => setDialogo(null)} />
      ) : null}
      {dialogo === 'reativar' ? (
        <DialogoReativar grupoId={grupoId} jogador={jogador} aoFechar={() => setDialogo(null)} aoReativado={aoAvisar} />
      ) : null}
    </section>
  );
}
