import { editarJogadorCorpo, jogadorCorpo, LIMITES, type JogadorDetalhe } from '@pelada/contrato';
import type { ReactNode } from 'react';
import { Campo } from '../../componentes/campos/Campo';
import { CampoData } from '../../componentes/campos/CampoData';
import { CampoSeletor } from '../../componentes/campos/CampoSeletor';
import { CampoTexto } from '../../componentes/campos/CampoTexto';
import type { ErroDeCampo } from '../../componentes/campos/ResumoErros';
import type { CorpoEdicaoJogador, CorpoJogador } from '../../dados/elenco';
import { deValidacao, type ErrosDeCampos } from '../../dados/errosDeCampos';
import { ROTULO_POSICAO } from '../../rotulos';
import estilos from './CamposDoJogador.module.css';

/** Valores do formulário do jogador (t16 novo e edição); tudo texto até a hora de enviar. */
export interface ValoresJogador {
  apelido: string;
  anoNascimento: string;
  posicao: string;
  telefone: string;
  pontuacaoInicial: string;
  dataEntrada: string;
}

export const jogadorVazio = (hoje: string): ValoresJogador => ({
  apelido: '',
  anoNascimento: '',
  posicao: '',
  telefone: '',
  pontuacaoInicial: '0',
  dataEntrada: hoje,
});

/** `(11) 98765-4321` a partir dos dígitos digitados (no máximo 11). */
export function mascararTelefone(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export const valoresDoDetalhe = (j: JogadorDetalhe): ValoresJogador => ({
  apelido: j.apelido,
  anoNascimento: j.anoNascimento === null ? '' : String(j.anoNascimento),
  posicao: j.posicao,
  telefone: j.telefone === null ? '' : mascararTelefone(j.telefone),
  pontuacaoInicial: String(j.pontuacaoInicial),
  dataEntrada: j.desde,
});

/** Campo do corpo → id da entrada e rótulo, na ordem do formulário (para o `ResumoErros`, GEL-118). */
const CAMPOS = [
  { campo: 'apelido', id: 'apelido', rotulo: 'Apelido' },
  { campo: 'anoNascimento', id: 'ano', rotulo: 'Ano de nascimento' },
  { campo: 'posicao', id: 'pos', rotulo: 'Posição' },
  { campo: 'telefone', id: 'tel', rotulo: 'Telefone' },
  { campo: 'dataEntrada', id: 'entrada', rotulo: 'Data de entrada' },
  { campo: 'pontuacaoInicial', id: 'inicial', rotulo: 'Pontuação inicial' },
] as const;

export function resumoDoJogador(erros: ErrosDeCampos): ErroDeCampo[] {
  return CAMPOS.filter((c) => erros[c.campo]).map((c) => ({ idCampo: c.id, rotulo: c.rotulo }));
}

const numero = (texto: string): number | undefined => (texto.trim() === '' ? undefined : Number(texto));

/** Corpo bruto a validar: campo vazio vira `undefined` para o contrato dar a mensagem do campo. */
function bruto(v: ValoresJogador, comEntrada: boolean) {
  return {
    apelido: v.apelido,
    anoNascimento: numero(v.anoNascimento),
    posicao: v.posicao === '' ? undefined : v.posicao,
    telefone: v.telefone,
    pontuacaoInicial: numero(v.pontuacaoInicial),
    ...(comEntrada && v.dataEntrada !== '' ? { dataEntrada: v.dataEntrada } : {}),
  };
}

/** Erros pelas regras do contrato (as mesmas da API: GEL-33, GEL-34, GEL-36, GEL-37, GEL-39, GEL-40). */
export function validarJogador(v: ValoresJogador, hoje: string, edicao = false): ErrosDeCampos {
  const esquema = edicao ? editarJogadorCorpo(hoje) : jogadorCorpo(hoje);
  return deValidacao(esquema.safeParse(bruto(v, !edicao)));
}

/** Corpo a enviar (já validado). */
export function corpoDoCadastro(v: ValoresJogador): CorpoJogador {
  return {
    apelido: v.apelido.trim(),
    anoNascimento: Number(v.anoNascimento),
    posicao: v.posicao,
    telefone: v.telefone.trim() === '' ? null : v.telefone,
    pontuacaoInicial: Number(v.pontuacaoInicial),
    ...(v.dataEntrada !== '' ? { dataEntrada: v.dataEntrada } : {}),
  };
}

export function corpoDaEdicao(v: ValoresJogador): CorpoEdicaoJogador {
  return {
    apelido: v.apelido.trim(),
    anoNascimento: Number(v.anoNascimento),
    posicao: v.posicao,
    telefone: v.telefone.trim() === '' ? null : v.telefone,
    pontuacaoInicial: Number(v.pontuacaoInicial),
  };
}

const OPCOES_POSICAO = [
  { valor: '', rotulo: 'Escolha' },
  ...(['zagueiro', 'lateral', 'volante', 'meia', 'atacante', 'centroavante', 'goleiro'] as const).map((p) => ({
    valor: p,
    rotulo: ROTULO_POSICAO[p],
  })),
];

interface Props {
  valores: ValoresJogador;
  erros: ErrosDeCampos;
  aoMudar: (valores: ValoresJogador) => void;
  /** Cadastro: mostra a data de entrada. Edição: ela só muda pela rota de início (GEL-41). */
  comDataEntrada: boolean;
  hoje: string;
  /** Na edição, no lugar da data de entrada: a data de início e o caminho para alterá-la (t16, GEL-77). */
  inicio?: ReactNode;
}

/** Apelido, ano, posição, telefone com máscara, pontuação inicial e (no cadastro) data de entrada. */
export function CamposDoJogador({ valores, erros, aoMudar, comDataEntrada, hoje, inicio }: Props) {
  const mudar = <C extends keyof ValoresJogador>(campo: C, valor: ValoresJogador[C]) =>
    aoMudar({ ...valores, [campo]: valor });
  const anoMax = Number(hoje.slice(0, 4)) - LIMITES.idadeMinima;
  return (
    <>
      <CampoTexto
        id="apelido"
        rotulo="Apelido"
        maxLength={LIMITES.apelido.max}
        ajuda="De 2 a 30 caracteres. É o nome que aparece no ranking."
        erro={erros['apelido']}
        valor={valores.apelido}
        aoMudar={(v) => mudar('apelido', v)}
      />
      <div className={estilos.duasColunas}>
        <Campo id="ano" rotulo="Ano de nascimento" erro={erros['anoNascimento']}>
          {(entrada) => (
            <input
              {...entrada}
              type="number"
              inputMode="numeric"
              min={LIMITES.anoNascimentoMin}
              max={anoMax}
              value={valores.anoNascimento}
              onChange={(e) => mudar('anoNascimento', e.target.value)}
            />
          )}
        </Campo>
        <CampoSeletor
          id="pos"
          rotulo="Posição"
          ajuda="Só para cadastro."
          opcoes={valores.posicao === '' ? OPCOES_POSICAO : OPCOES_POSICAO.slice(1)}
          erro={erros['posicao']}
          valor={valores.posicao}
          aoMudar={(v) => mudar('posicao', v)}
        />
      </div>
      <div className={estilos.duasColunas}>
        <Campo id="tel" rotulo="Telefone (opcional)" erro={erros['telefone']}>
          {(entrada) => (
            <input
              {...entrada}
              type="tel"
              inputMode="tel"
              placeholder="(DD) 9XXXX-XXXX"
              value={valores.telefone}
              onChange={(e) => mudar('telefone', mascararTelefone(e.target.value))}
            />
          )}
        </Campo>
        {comDataEntrada ? (
          <CampoData
            id="entrada"
            rotulo="Data de entrada"
            max={hoje}
            erro={erros['dataEntrada']}
            valor={valores.dataEntrada}
            aoMudar={(v) => mudar('dataEntrada', v)}
          />
        ) : (
          inicio
        )}
        <Campo
          id="inicial"
          rotulo="Pontuação inicial"
          ajuda="Pontos de antes da 1ª partida no app (0 a 9999)."
          erro={erros['pontuacaoInicial']}
        >
          {(entrada) => (
            <input
              {...entrada}
              type="number"
              inputMode="numeric"
              min={LIMITES.pontuacaoInicial.min}
              max={LIMITES.pontuacaoInicial.max}
              step={1}
              value={valores.pontuacaoInicial}
              onChange={(e) => mudar('pontuacaoInicial', e.target.value)}
            />
          )}
        </Campo>
      </div>
    </>
  );
}
