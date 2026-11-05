import type { ConfigFinanceiraCorpo, MesFinanceiroResposta } from '@pelada/contrato/financeiro';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { lerReais } from '../../dados/dinheiro.ts';
import { erroDoFinanceiro, useMesFinanceiro, useSalvarConfig } from '../../dados/financeiro.ts';
import { useGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import { errosConhecidos, reaisParaCampo, resumoDosErros } from './Lancamento.tsx';

/**
 * Configurar caixa (`/app/grupos/:grupoId/financeiro/config`, t24; FIN-01, FIN-02, FIN-47, FIN-48), de
 * `.specs/mockup/telas/t24-config--{vazio,erro}.html`:
 * - mensalidade (opcional), saldo inicial e a data do saldo inicial, preenchidos da configuração do mês atual
 *   (`GET …/financeiro/mes`); sem configuração, vazios e a data de hoje da API;
 * - os valores em reais vão a centavos por `lerReais` (T35, FIN-48): texto inválido mostra "Informe um valor em
 *   reais, ex.: 350,00." no campo, sem chamar a API (como `t24-config--erro`, sem o resumo); mensalidade vazia vai
 *   como `null` (sem mensalidade, FIN-01);
 * - 422 da API (ex.: data no futuro, FIN-02): "Corrija N campos: <rótulos>" e a mensagem ao lado de cada campo
 *   (FIN-47);
 * - salvo, volta ao financeiro do mês (t22).
 */

export const ROTULO_MENSALIDADE = 'Mensalidade (opcional, R$)';
export const ROTULO_SALDO = 'Saldo inicial (R$)';
export const ROTULO_DATA = 'Data do saldo inicial';
export const AJUDA_MENSALIDADE = 'Com mensalidade, marcar “pagou” já cria a entrada no caixa.';

const CAMPOS = [
  { campo: 'mensalidadeCentavos', id: 'mens', rotulo: 'Mensalidade' },
  { campo: 'saldoInicialCentavos', id: 'saldo', rotulo: 'Saldo inicial' },
  { campo: 'dataSaldoInicial', id: 'data', rotulo: 'Data do saldo inicial' },
] as const;

type CampoConfig = (typeof CAMPOS)[number]['campo'];
type ErrosConfig = Partial<Record<CampoConfig, string>>;

interface FormularioConfig {
  mensalidade: string;
  saldo: string;
  data: string;
}

function inicialDo(dados: MesFinanceiroResposta): FormularioConfig {
  const { config } = dados;
  if (config === null) return { mensalidade: '', saldo: '', data: dados.hoje };
  return {
    mensalidade: config.mensalidadeCentavos === null ? '' : reaisParaCampo(config.mensalidadeCentavos),
    saldo: reaisParaCampo(config.saldoInicialCentavos),
    data: config.dataSaldoInicial,
  };
}

/** O formulário em corpo do `PUT`, ou os erros de cada campo em reais (FIN-48). */
export function corpoDaConfig(dados: FormularioConfig): { ok: true; corpo: ConfigFinanceiraCorpo } | { ok: false; erros: ErrosConfig } {
  const erros: ErrosConfig = {};
  let mensalidadeCentavos: number | null = null;
  if (dados.mensalidade.trim() !== '') {
    const mensalidade = lerReais(dados.mensalidade);
    if (mensalidade.ok) mensalidadeCentavos = mensalidade.centavos;
    else erros.mensalidadeCentavos = mensalidade.mensagem;
  }
  const saldo = lerReais(dados.saldo);
  if (!saldo.ok) erros.saldoInicialCentavos = saldo.mensagem;
  if (!saldo.ok || Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, corpo: { mensalidadeCentavos, saldoInicialCentavos: saldo.centavos, dataSaldoInicial: dados.data } };
}

function Formulario({ grupoId, inicial, hoje }: { grupoId: string; inicial: FormularioConfig; hoje: string }) {
  const navegar = useNavigate();
  const salvar = useSalvarConfig(grupoId);
  const [dados, setDados] = useState<FormularioConfig>(inicial);
  const [erros, setErros] = useState<ErrosConfig>({});
  // O resumo só aparece no 422 da API; o erro de reais do próprio formulário fica no campo (t24-config--erro).
  const [doServidor, setDoServidor] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);

  function mudar<C extends keyof FormularioConfig>(campo: C, valor: FormularioConfig[C]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvar.isPending) return;
    setFalha(null);
    const lido = corpoDaConfig(dados);
    if (!lido.ok) {
      setDoServidor(false);
      setErros(lido.erros);
      return;
    }
    salvar.mutate(lido.corpo, {
      onSuccess: () => void navegar(`${rotaDoGrupo(grupoId)}/financeiro`),
      onError: (erro) => {
        const traduzido = erroDoFinanceiro(erro);
        const porCampo = errosConhecidos(traduzido.campos, CAMPOS);
        setDoServidor(true);
        setErros(porCampo);
        if (Object.keys(porCampo).length === 0) setFalha(traduzido.mensagem);
      },
    });
  }

  return (
    <form className={estilos.formulario} noValidate aria-busy={salvar.isPending || undefined} onSubmit={enviar}>
      {doServidor ? <ResumoErros erros={resumoDosErros(erros, CAMPOS)} /> : null}
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <Campo
        id="mens"
        rotulo={ROTULO_MENSALIDADE}
        inputMode="decimal"
        placeholder="0,00"
        autoComplete="off"
        ajuda={AJUDA_MENSALIDADE}
        erro={erros.mensalidadeCentavos}
        value={dados.mensalidade}
        onChange={(e) => mudar('mensalidade', e.target.value)}
      />
      <div className={modulo['duas-colunas']}>
        <Campo
          id="saldo"
          rotulo={ROTULO_SALDO}
          inputMode="decimal"
          placeholder="0,00"
          autoComplete="off"
          erro={erros.saldoInicialCentavos}
          value={dados.saldo}
          onChange={(e) => mudar('saldo', e.target.value)}
        />
        <CampoData
          id="data"
          rotulo={ROTULO_DATA}
          max={hoje}
          erro={erros.dataSaldoInicial}
          value={dados.data}
          onChange={(e) => mudar('data', e.target.value)}
        />
      </div>
      <div className={modulo['barra-acao']}>
        <Botao type="submit" carregando={salvar.isPending}>
          {salvar.isPending ? 'Salvando…' : 'Salvar'}
        </Botao>
      </div>
    </form>
  );
}

export function ConfigCaixa() {
  const { grupoId = '' } = useParams();
  const grupo = useGrupo(grupoId);
  const mes = useMesFinanceiro(grupoId);

  function conteudo() {
    if (mes.isPending) return <EsqueletoLista linhas={3} />;
    if (mes.isError) {
      const erro = erroDoFinanceiro(mes.error);
      if (erro.codigo === 'sem_permissao_financeiro') return <Faixa tipo="erro">{erro.mensagem}</Faixa>;
      if (erro.status === 404) return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void mes.refetch()} />;
    }
    return <Formulario grupoId={grupoId} inicial={inicialDo(mes.data)} hoje={mes.data.hoje} />;
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} estreita ocupada={mes.isPending}>
      <LinkVoltar para={`${rotaDoGrupo(grupoId)}/financeiro`}>Financeiro</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Configurar caixa</h1>
      {conteudo()}
    </Casca>
  );
}
