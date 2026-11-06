import {
  LIMITES_LANCAMENTO,
  type LancamentoCorpo,
  type LancamentoResposta,
} from '@pelada/contrato/financeiro-lancamentos';
import type { TipoLancamento } from '@pelada/contrato/financeiro';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { CampoSeletor, type OpcaoSeletor } from '../../componentes/CampoSeletor.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Dialogo } from '../../componentes/Dialogo.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros, type ErroDoResumo } from '../../componentes/ResumoErros.tsx';
import { formatarReais, lerReais } from '../../dados/dinheiro.ts';
import {
  erroDoFinanceiro,
  useCriarLancamento,
  useEditarLancamento,
  useExcluirLancamento,
  useLancamento,
  useMesFinanceiro,
} from '../../dados/financeiro.ts';
import { useGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import fin from './financeiro.module.css';

/**
 * Lançamento (`/app/grupos/:grupoId/financeiro/lancamentos/novo` e `…/lancamentos/:lancamentoId`, t23; FIN-32,
 * FIN-47), de `.specs/mockup/telas/t23-lancamento--{novo,edicao,erro,excluir}.html`:
 * - novo: Entrada marcada, a data de hoje da API (o `hoje` do `GET …/financeiro/mes`, nunca o relógio do aparelho) e o
 *   contador "0 de 80" da descrição; "Salvar" envia `POST`;
 * - edição: os campos do `GET …/lancamentos/:id`, "Última alteração: <nome>, dd/mm hh:mm" no fuso de São Paulo
 *   ("Conta excluída" quando a autora não existe mais, ACE-28) e "Excluir" com o diálogo
 *   "Excluir lançamento?" / "“<descrição>” (R$ <valor>) sai do caixa."; "Salvar" envia `PUT`;
 * - valor em reais convertido por `lerReais` (T35): texto inválido marca o campo sem chamar a API;
 * - 422 da API: "Corrija N campos: <rótulos>" (`ResumoErros`) e a mensagem ao lado de cada campo (FIN-47);
 * - 409 `lancamento_vinculado` na exclusão: a orientação da API ("Esta entrada é a mensalidade de …") numa faixa;
 * - salvo ou excluído, volta ao financeiro do mês.
 */

export const TITULO_NOVO = 'Novo lançamento';
export const TITULO_EDICAO = 'Editar lançamento';
export const TITULO_EXCLUIR = 'Excluir lançamento?';
export const AUTORA_EXCLUIDA = 'Conta excluída';

export const OPCOES_TIPO: readonly OpcaoSeletor<TipoLancamento>[] = [
  { valor: 'entrada', rotulo: 'Entrada' },
  { valor: 'saida', rotulo: 'Saída' },
];

/** Campo do contrato → `id` e rótulo na tela, na ordem do formulário (a ordem do resumo de erros). */
const CAMPOS = [
  { campo: 'tipo', id: 'tipo', rotulo: 'Tipo' },
  { campo: 'data', id: 'data', rotulo: 'Data' },
  { campo: 'descricao', id: 'desc', rotulo: 'Descrição' },
  { campo: 'valorCentavos', id: 'valor', rotulo: 'Valor' },
] as const;

type CampoLancamento = (typeof CAMPOS)[number]['campo'];
type ErrosLancamento = Partial<Record<CampoLancamento, string>>;

/** Os erros na ordem do formulário, para o `ResumoErros`. */
export function resumoDosErros<C extends string>(
  erros: Partial<Record<C, string>>,
  campos: readonly { campo: C; id: string; rotulo: string }[],
): ErroDoResumo[] {
  return campos.filter((c) => erros[c.campo]).map((c) => ({ id: c.id, rotulo: c.rotulo }));
}

/** Só os campos conhecidos do 422; o resto fica de fora (a faixa mostra a mensagem geral). */
export function errosConhecidos<C extends string>(
  porCampo: Record<string, string>,
  campos: readonly { campo: C }[],
): Partial<Record<C, string>> {
  const resultado: Partial<Record<C, string>> = {};
  for (const { campo } of campos) {
    const texto = porCampo[campo];
    if (texto) resultado[campo] = texto;
  }
  return resultado;
}

/** Centavos no texto do campo, sem o "R$": 80000 → "800,00"; −1500 → "−15,00". */
export function reaisParaCampo(centavos: number): string {
  return formatarReais(centavos).replace('R$ ', '').replace('− ', '−');
}

const HORA_SAO_PAULO = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "2026-10-15T23:41:00Z" → "15/10 20:41", no fuso de São Paulo. */
export function diaEHora(iso: string): string {
  const partes = HORA_SAO_PAULO.formatToParts(new Date(iso));
  const valor = (tipo: string) => partes.find((p) => p.type === tipo)?.value ?? '';
  return `${valor('day')}/${valor('month')} ${valor('hour')}:${valor('minute')}`;
}

export function textoUltimaAlteracao(
  l: Pick<LancamentoResposta, 'alteradoPor' | 'alteradoEm'>,
): string {
  const nome = l.alteradoPor.trim() === '' ? AUTORA_EXCLUIDA : l.alteradoPor;
  return `Última alteração: ${nome}, ${diaEHora(l.alteradoEm)}`;
}

export function textoExcluir(l: Pick<LancamentoResposta, 'descricao' | 'valorCentavos'>): string {
  return `“${l.descricao}” (${formatarReais(l.valorCentavos)}) sai do caixa.`;
}

interface FormularioLancamento {
  tipo: TipoLancamento;
  data: string;
  descricao: string;
  valor: string;
}

function DialogoExcluir({
  grupoId,
  lancamento,
  aoFechar,
  aoExcluir,
  aoFalhar,
}: {
  grupoId: string;
  lancamento: LancamentoResposta;
  aoFechar: () => void;
  aoExcluir: () => void;
  aoFalhar: (mensagem: string) => void;
}) {
  const excluir = useExcluirLancamento(grupoId, lancamento.id);

  function confirmar() {
    if (excluir.isPending) return;
    excluir.mutate(undefined, {
      onSuccess: aoExcluir,
      onError: (e) => aoFalhar(erroDoFinanceiro(e).mensagem),
    });
  }

  return (
    <Dialogo
      alerta
      titulo={TITULO_EXCLUIR}
      descricao={textoExcluir(lancamento)}
      aoFechar={aoFechar}
      acoes={
        <>
          <Botao variante="secundario" autoFocus onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="destrutivo" carregando={excluir.isPending} onClick={confirmar}>
            Excluir lançamento
          </Botao>
        </>
      }
    />
  );
}

function Formulario({
  grupoId,
  inicial,
  lancamento,
}: {
  grupoId: string;
  inicial: FormularioLancamento;
  lancamento?: LancamentoResposta | undefined;
}) {
  const navegar = useNavigate();
  const criar = useCriarLancamento(grupoId);
  const editar = useEditarLancamento(grupoId, lancamento?.id ?? '');
  const salvar = lancamento ? editar : criar;
  const [dados, setDados] = useState<FormularioLancamento>(inicial);
  const [erros, setErros] = useState<ErrosLancamento>({});
  const [falha, setFalha] = useState<{ tipo: 'erro' | 'atencao'; texto: string } | null>(null);
  const [excluir, setExcluir] = useState(false);
  const voltar = `${rotaDoGrupo(grupoId)}/financeiro`;

  function mudar<C extends keyof FormularioLancamento>(campo: C, valor: FormularioLancamento[C]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvar.isPending) return;
    setFalha(null);
    const valor = lerReais(dados.valor);
    if (!valor.ok) {
      // FIN-48: o texto que não é valor em reais não vai à API.
      setErros({ valorCentavos: valor.mensagem });
      return;
    }
    const corpo: LancamentoCorpo = {
      tipo: dados.tipo,
      data: dados.data,
      descricao: dados.descricao,
      valorCentavos: valor.centavos,
    };
    salvar.mutate(corpo, {
      onSuccess: () => void navegar(voltar),
      onError: (erro) => {
        const traduzido = erroDoFinanceiro(erro);
        const porCampo = errosConhecidos(traduzido.campos, CAMPOS);
        setErros(porCampo);
        if (Object.keys(porCampo).length === 0)
          setFalha({ tipo: 'erro', texto: traduzido.mensagem });
      },
    });
  }

  return (
    <>
      <form
        className={estilos.formulario}
        noValidate
        aria-busy={salvar.isPending || undefined}
        onSubmit={enviar}
      >
        <ResumoErros erros={resumoDosErros(erros, CAMPOS)} />
        {falha ? <Faixa tipo={falha.tipo}>{falha.texto}</Faixa> : null}
        <CampoSeletor
          id="tipo"
          rotulo="Tipo"
          variante="segmentado"
          rotuloOculto
          opcoes={OPCOES_TIPO}
          valor={dados.tipo}
          aoMudar={(v) => mudar('tipo', v)}
          erro={erros.tipo}
        />
        <CampoData
          id="data"
          rotulo="Data"
          value={dados.data}
          erro={erros.data}
          onChange={(e) => mudar('data', e.target.value)}
        />
        <Campo
          id="desc"
          rotulo="Descrição"
          maxLength={LIMITES_LANCAMENTO.descricaoMax}
          ajuda={`${dados.descricao.length} de ${LIMITES_LANCAMENTO.descricaoMax}`}
          erro={erros.descricao}
          value={dados.descricao}
          onChange={(e) => mudar('descricao', e.target.value)}
        />
        <Campo
          id="valor"
          rotulo="Valor (R$)"
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          erro={erros.valorCentavos}
          value={dados.valor}
          onChange={(e) => mudar('valor', e.target.value)}
        />
        {lancamento ? <p className={fin.ajuda}>{textoUltimaAlteracao(lancamento)}</p> : null}
        <div className={modulo['barra-acao']}>
          {lancamento ? (
            <div className={modulo['grupo-botoes']}>
              <Botao type="submit" carregando={salvar.isPending}>
                {salvar.isPending ? 'Salvando…' : 'Salvar'}
              </Botao>
              <Botao variante="texto-destrutivo" onClick={() => setExcluir(true)}>
                Excluir
              </Botao>
            </div>
          ) : (
            <Botao type="submit" carregando={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : 'Salvar'}
            </Botao>
          )}
        </div>
      </form>
      {excluir && lancamento ? (
        <DialogoExcluir
          grupoId={grupoId}
          lancamento={lancamento}
          aoFechar={() => setExcluir(false)}
          aoExcluir={() => void navegar(voltar)}
          aoFalhar={(texto) => {
            // FIN-30: o 409 `lancamento_vinculado` traz a orientação de desmarcar o pagamento no mês.
            setExcluir(false);
            setFalha({ tipo: 'atencao', texto });
          }}
        />
      ) : null}
    </>
  );
}

function ConteudoNovo({ grupoId }: { grupoId: string }) {
  // A data de hoje vem da API (FIN-32, FIN-49): o `hoje` do mês atual do caixa.
  const mes = useMesFinanceiro(grupoId);
  if (mes.isPending) return <EsqueletoLista linhas={4} />;
  if (mes.isError)
    return <ErroDaLeitura erro={mes.error} aoTentarDeNovo={() => void mes.refetch()} />;
  return (
    <Formulario
      grupoId={grupoId}
      inicial={{ tipo: 'entrada', data: mes.data.hoje, descricao: '', valor: '' }}
    />
  );
}

function ConteudoEdicao({ grupoId, id }: { grupoId: string; id: string }) {
  const consulta = useLancamento(grupoId, id);
  if (consulta.isPending) return <EsqueletoLista linhas={4} />;
  if (consulta.isError)
    return <ErroDaLeitura erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />;
  const l = consulta.data;
  return (
    <Formulario
      key={l.id}
      grupoId={grupoId}
      lancamento={l}
      inicial={{
        tipo: l.tipo,
        data: l.data,
        descricao: l.descricao,
        valor: reaisParaCampo(l.valorCentavos),
      }}
    />
  );
}

function ErroDaLeitura({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo: () => void }) {
  const traduzido = erroDoFinanceiro(erro);
  if (traduzido.codigo === 'nao_encontrado' || traduzido.status === 404)
    return <Faixa tipo="atencao">Lançamento não encontrado.</Faixa>;
  if (traduzido.codigo === 'sem_permissao_financeiro')
    return <Faixa tipo="erro">{traduzido.mensagem}</Faixa>;
  return <EstadoErro aoTentarDeNovo={aoTentarDeNovo} />;
}

export function Lancamento() {
  const { grupoId = '', lancamentoId } = useParams();
  const grupo = useGrupo(grupoId);
  const novo = lancamentoId === undefined;
  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} estreita>
      <LinkVoltar para={`${rotaDoGrupo(grupoId)}/financeiro`}>Financeiro</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>{novo ? TITULO_NOVO : TITULO_EDICAO}</h1>
      {novo ? (
        <ConteudoNovo grupoId={grupoId} />
      ) : (
        <ConteudoEdicao grupoId={grupoId} id={lancamentoId} />
      )}
    </Casca>
  );
}
