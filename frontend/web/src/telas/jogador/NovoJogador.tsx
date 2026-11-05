import type { JogadorCorpo } from '@pelada/contrato/elenco';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { useCadastrarJogador } from '../../dados/elenco.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { hojeEmSaoPaulo } from '../../dados/hoje.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import {
  CamposJogador,
  errosDoJogador,
  numeroOuNulo,
  resumoDoJogador,
  type ErrosJogador,
  type FormularioJogador,
} from './camposJogador.tsx';

/**
 * Novo jogador (`/app/grupos/:grupoId/jogadores/novo`, t16; GEL-31 a GEL-40, GEL-114, GEL-118), de
 * `t16-jogador--novo.html` e `t16-jogador--erro.html`:
 * - apelido, ano, posição, telefone com máscara, data de entrada (hoje, sem futuro no seletor) e
 *   pontuação inicial (0);
 * - "Salvar" envia `POST …/jogadores` (`useCadastrarJogador`, T54); 201 leva à ficha do jogador;
 * - 422 marca cada campo com a mensagem da API e preenche o resumo (GEL-118).
 */

export function corpoDoJogador(dados: FormularioJogador): Record<string, unknown> {
  const corpo: Record<string, unknown> = {
    apelido: dados.apelido,
    anoNascimento: numeroOuNulo(dados.anoNascimento),
    posicao: dados.posicao,
    telefone: dados.telefone.trim() === '' ? null : dados.telefone,
  };
  const pontuacao = numeroOuNulo(dados.pontuacaoInicial);
  // Vazio: a pontuação fica de fora e a API grava 0 (GEL-40); texto inválido vai como nulo e volta com a mensagem.
  if (dados.pontuacaoInicial.trim() !== '') corpo.pontuacaoInicial = pontuacao;
  if (dados.dataEntrada !== '') corpo.dataEntrada = dados.dataEntrada;
  return corpo;
}

export function NovoJogador() {
  const { grupoId = '' } = useParams();
  const navegar = useNavigate();
  const grupo = useGrupo(grupoId);
  const cadastrar = useCadastrarJogador(grupoId);
  const [hoje] = useState(() => hojeEmSaoPaulo());
  const [dados, setDados] = useState<FormularioJogador>({
    apelido: '',
    anoNascimento: '',
    posicao: '',
    telefone: '',
    dataEntrada: hoje,
    pontuacaoInicial: '0',
  });
  const [erros, setErros] = useState<ErrosJogador>({});
  const [falha, setFalha] = useState<string | null>(null);
  const base = rotaDoGrupo(grupoId);

  function mudar<C extends keyof FormularioJogador>(campo: C, valor: FormularioJogador[C]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (cadastrar.isPending) return;
    setFalha(null);
    cadastrar.mutate(corpoDoJogador(dados) as unknown as JogadorCorpo, {
      onSuccess: (ficha) => {
        setErros({});
        void navegar(`${base}/jogadores/${encodeURIComponent(ficha.id)}`);
      },
      onError: (erro) => {
        const porCampo = errosDoJogador(erro);
        setErros(porCampo);
        if (Object.keys(porCampo).length === 0) setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
      },
    });
  }

  return (
    <Casca grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }} estreita>
      <LinkVoltar para={`${base}/jogadores`}>Jogadores</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Novo jogador</h1>
      <form className={estilos.formulario} noValidate aria-busy={cadastrar.isPending || undefined} onSubmit={enviar}>
        <ResumoErros erros={resumoDoJogador(erros)} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <CamposJogador dados={dados} erros={erros} mudar={mudar} hoje={hoje} comDataEntrada />
        <div className={modulo['reserva-barra']} aria-hidden="true" />
        <div className={modulo['barra-acao']}>
          <Botao type="submit" carregando={cadastrar.isPending}>
            {cadastrar.isPending ? 'Salvando…' : 'Salvar'}
          </Botao>
        </div>
      </form>
    </Casca>
  );
}
