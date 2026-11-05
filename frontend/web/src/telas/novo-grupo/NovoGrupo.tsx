import type { DiaSemana, Frequencia } from '@pelada/contrato/grupo';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import { CampoHora } from '../../componentes/CampoHora.tsx';
import { CampoSeletor, OPCOES_DIA_SEMANA, OPCOES_FREQUENCIA } from '../../componentes/CampoSeletor.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { CascaConta } from '../../componentes/MenuConta.tsx';
import { ResumoErros } from '../../componentes/ResumoErros.tsx';
import { ErroApi, MENSAGEM_REDE } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useCriarGrupo } from '../../dados/grupos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';

/**
 * Novo grupo (`/app/grupos/novo`, t27; GEL-01, GEL-03, GEL-06, GEL-114, GEL-118):
 * - nome, dia da semana, horário e frequência (semanal marcada), sem o bloco "Primeiro admin":
 *   quem cria vira admin (`t27-novo-grupo--vazio`);
 * - "Criar grupo" envia `POST /api/grupos` (`useCriarGrupo`, T53); enviando, "Criando grupo…"
 *   (`t27-novo-grupo--carregando`); 201 leva ao início do grupo novo (`/app/grupos/:grupoId`);
 * - 422: a API valida (as mesmas regras do contrato) e devolve a mensagem de cada campo; a tela
 *   mostra "Corrija N campos:" com um link por campo, na ordem do formulário, e cada mensagem
 *   ao lado do campo (`t27-novo-grupo--erro`, GEL-118). Outra falha vai para a faixa de erro.
 * A validação fica na API: o horário incompleto no seletor do navegador só se revela no envio
 * (comentário de `t27-novo-grupo--erro`), e assim as mensagens são sempre as do contrato.
 */

export type CampoGrupo = 'nome' | 'diaSemana' | 'horario' | 'frequencia';

/** Ordem do formulário; `id` do elemento de cada campo, para o link do resumo. */
export const CAMPOS_GRUPO: readonly { campo: CampoGrupo; id: string; rotulo: string }[] = [
  { campo: 'nome', id: 'nome', rotulo: 'Nome' },
  { campo: 'diaSemana', id: 'dia', rotulo: 'Dia da semana' },
  { campo: 'horario', id: 'hora', rotulo: 'Horário' },
  { campo: 'frequencia', id: 'frequencia', rotulo: 'Frequência' },
];

export const AJUDA_NOME_GRUPO = 'O link do ranking será criado a partir do nome e não muda depois.';

export interface FormularioGrupo {
  nome: string;
  diaSemana: DiaSemana | '';
  horario: string;
  frequencia: Frequencia | '';
}

export type ErrosGrupo = Partial<Record<CampoGrupo, string>>;

/** Mensagens do 422 só dos campos do formulário. */
export function errosDoGrupo(erro: unknown): ErrosGrupo {
  const mensagens = mensagensDosCampos(erro);
  const erros: ErrosGrupo = {};
  for (const { campo } of CAMPOS_GRUPO) if (mensagens[campo]) erros[campo] = mensagens[campo];
  return erros;
}

export function resumoDoGrupo(erros: ErrosGrupo) {
  return CAMPOS_GRUPO.filter((c) => erros[c.campo]).map((c) => ({ id: c.id, rotulo: c.rotulo }));
}

/** Campos do grupo, compartilhados com a t20 (T61). */
export function CamposGrupo({
  dados,
  erros,
  mudar,
}: {
  dados: FormularioGrupo;
  erros: ErrosGrupo;
  mudar: <C extends keyof FormularioGrupo>(campo: C, valor: FormularioGrupo[C]) => void;
}) {
  return (
    <>
      <Campo
        id="nome"
        rotulo="Nome"
        maxLength={60}
        autoComplete="off"
        ajuda={AJUDA_NOME_GRUPO}
        erro={erros.nome}
        value={dados.nome}
        onChange={(e) => mudar('nome', e.target.value)}
      />
      <div className={modulo['duas-colunas']}>
        <CampoSeletor
          id="dia"
          rotulo="Dia da semana"
          opcoes={OPCOES_DIA_SEMANA}
          opcaoVazia="Escolha"
          valor={dados.diaSemana}
          erro={erros.diaSemana}
          aoMudar={(v) => mudar('diaSemana', v)}
        />
        <CampoHora
          id="hora"
          rotulo="Horário"
          erro={erros.horario}
          value={dados.horario}
          onChange={(e) => mudar('horario', e.target.value)}
        />
      </div>
      <CampoSeletor
        id="frequencia"
        rotulo="Frequência"
        variante="segmentado"
        opcoes={OPCOES_FREQUENCIA}
        valor={dados.frequencia}
        erro={erros.frequencia}
        aoMudar={(v) => mudar('frequencia', v)}
      />
    </>
  );
}

export function NovoGrupo() {
  const navegar = useNavigate();
  const criar = useCriarGrupo();
  const [dados, setDados] = useState<FormularioGrupo>({ nome: '', diaSemana: '', horario: '', frequencia: 'semanal' });
  const [erros, setErros] = useState<ErrosGrupo>({});
  const [falha, setFalha] = useState<string | null>(null);

  function mudar<C extends keyof FormularioGrupo>(campo: C, valor: FormularioGrupo[C]) {
    setDados((d) => ({ ...d, [campo]: valor }));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (criar.isPending) return;
    setFalha(null);
    criar.mutate(
      // O formulário vai como está: a API valida e responde 422 por campo (GEL-03 a GEL-06).
      dados as unknown as Parameters<typeof criar.mutate>[0],
      {
        onSuccess: (r) => {
          setErros({});
          void navegar(rotaDoGrupo(r.id));
        },
        onError: (erro) => {
          const porCampo = errosDoGrupo(erro);
          setErros(porCampo);
          if (Object.keys(porCampo).length === 0) setFalha(erro instanceof ErroApi ? erro.message : MENSAGEM_REDE);
        },
      },
    );
  }

  return (
    <CascaConta estreita>
      <LinkVoltar para="/app">Seus grupos</LinkVoltar>
      <h1 className={estilos['titulo-pagina']}>Novo grupo</h1>
      <form className={estilos.formulario} noValidate aria-busy={criar.isPending || undefined} onSubmit={enviar}>
        <ResumoErros erros={resumoDoGrupo(erros)} />
        {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
        <CamposGrupo dados={dados} erros={erros} mudar={mudar} />
        <div className={modulo['reserva-barra']} aria-hidden="true" />
        <div className={modulo['barra-acao']}>
          <Botao type="submit" carregando={criar.isPending}>
            {criar.isPending ? 'Criando grupo…' : 'Criar grupo'}
          </Botao>
        </div>
      </form>
    </CascaConta>
  );
}
