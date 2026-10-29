import { dadosGrupo, DIAS_DA_SEMANA, FREQUENCIAS, LIMITES, type Frequencia } from '@pelada/contrato';
import { CampoHora } from '../../componentes/campos/CampoHora';
import { CampoSeletor } from '../../componentes/campos/CampoSeletor';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import type { ErroDeCampo } from '../../componentes/campos/ResumoErros';
import { Segmentado } from '../../componentes/escolhas/Segmentado';
import { deErroApi, deValidacao, type ErrosDeCampos } from '../../dados/errosDeCampos';
import { ROTULO_DIA_SEMANA, ROTULO_FREQUENCIA } from '../../rotulos';
import estilos from './CamposDoGrupo.module.css';

/** Valores do formulário do grupo (t27 e t20). `diaSemana` vazio = "Escolha". */
export interface ValoresGrupo {
  nome: string;
  diaSemana: string;
  frequencia: Frequencia;
  horario: string;
}

export const GRUPO_VAZIO: ValoresGrupo = { nome: '', diaSemana: '', frequencia: 'semanal', horario: '' };

/**
 * Campo do corpo → id da entrada e rótulo, na ordem do formulário (para o `ResumoErros`, GEL-118). A frequência é um
 * grupo de rádios que sempre tem uma escolha: não entra.
 */
const CAMPOS = [
  { campo: 'nome', id: 'nome', rotulo: 'Nome' },
  { campo: 'diaSemana', id: 'dia', rotulo: 'Dia da semana' },
  { campo: 'horario', id: 'hora', rotulo: 'Horário' },
] as const;

/** Erros do formulário pelas regras do contrato (as mesmas da API: GEL-03 a GEL-06). */
export function validarGrupo(valores: ValoresGrupo): ErrosDeCampos {
  return deValidacao(dadosGrupo.safeParse(valores));
}

/** Erros por campo do 422 da API, ou `null` se a falha não for desse tipo. */
export const errosDaApi = deErroApi;

/** Itens do resumo "Corrija N campos: …" na ordem do formulário. */
export function resumoDoGrupo(erros: ErrosDeCampos): ErroDeCampo[] {
  return CAMPOS.filter((c) => erros[c.campo]).map((c) => ({ idCampo: c.id, rotulo: c.rotulo }));
}

const OPCOES_DIA = [
  { valor: '', rotulo: 'Escolha' },
  ...DIAS_DA_SEMANA.map((d) => ({ valor: d, rotulo: ROTULO_DIA_SEMANA[d] })),
];
const OPCOES_FREQUENCIA = FREQUENCIAS.map((f) => ({ valor: f, rotulo: ROTULO_FREQUENCIA[f] }));

interface Props {
  valores: ValoresGrupo;
  erros: ErrosDeCampos;
  aoMudar: (valores: ValoresGrupo) => void;
  /** Ajuda do nome; padrão: a do grupo novo (t27). */
  ajudaNome?: string;
}

/** Nome, dia, horário e frequência do grupo, com a mensagem da regra ao lado de cada campo. */
export function CamposDoGrupo({
  valores,
  erros,
  aoMudar,
  ajudaNome = 'O link do ranking será criado a partir do nome e não muda depois.',
}: Props) {
  const mudar = <C extends keyof ValoresGrupo>(campo: C, valor: ValoresGrupo[C]) =>
    aoMudar({ ...valores, [campo]: valor });
  return (
    <>
      <CampoTexto
        id="nome"
        rotulo="Nome"
        maxLength={LIMITES.nomeGrupo.max}
        ajuda={ajudaNome}
        erro={erros['nome']}
        valor={valores.nome}
        aoMudar={(v) => mudar('nome', v)}
      />
      <div className={estilos.duasColunas}>
        <CampoSeletor
          id="dia"
          rotulo="Dia da semana"
          opcoes={valores.diaSemana === '' ? OPCOES_DIA : OPCOES_DIA.slice(1)}
          erro={erros['diaSemana']}
          valor={valores.diaSemana}
          aoMudar={(v) => mudar('diaSemana', v)}
        />
        <CampoHora
          id="hora"
          rotulo="Horário"
          erro={erros['horario']}
          valor={valores.horario}
          aoMudar={(v) => mudar('horario', v)}
        />
      </div>
      <Segmentado
        legenda="Frequência"
        legendaVisivel
        opcoes={OPCOES_FREQUENCIA}
        valor={valores.frequencia}
        aoMudar={(v) => mudar('frequencia', v)}
      />
    </>
  );
}
