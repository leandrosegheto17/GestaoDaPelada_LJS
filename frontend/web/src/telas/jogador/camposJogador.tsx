import type { Posicao } from '@pelada/contrato/elenco';
import { LIMITES_JOGADOR } from '@pelada/contrato/elenco';
import { Campo } from '../../componentes/Campo.tsx';
import { CampoData } from '../../componentes/CampoData.tsx';
import { CampoSeletor } from '../../componentes/CampoSeletor.tsx';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import modulo from '../grupos-elenco.module.css';
import { OPCOES_POSICAO } from '../jogadores/posicoes.ts';

/**
 * Campos do jogador, da marcação de `t16-jogador--novo.html` e `t16-jogador--edicao.html`
 * (GEL-31 a GEL-41, GEL-118), compartilhados pelo cadastro (T63) e pela ficha (T64). A data de
 * entrada só existe no cadastro: na ficha ela muda pela rota de início (GEL-41, GEL-83).
 * A validação é da API (as mesmas regras do contrato, com "hoje" do relógio dela); a tela envia o
 * que foi digitado e mostra a mensagem de cada campo do 422.
 */

export type CampoJogador = 'apelido' | 'anoNascimento' | 'posicao' | 'telefone' | 'dataEntrada' | 'pontuacaoInicial';

export const CAMPOS_JOGADOR: readonly { campo: CampoJogador; id: string; rotulo: string }[] = [
  { campo: 'apelido', id: 'apelido', rotulo: 'Apelido' },
  { campo: 'anoNascimento', id: 'ano', rotulo: 'Ano de nascimento' },
  { campo: 'posicao', id: 'pos', rotulo: 'Posição' },
  { campo: 'telefone', id: 'tel', rotulo: 'Telefone (opcional)' },
  { campo: 'dataEntrada', id: 'entrada', rotulo: 'Data de entrada' },
  { campo: 'pontuacaoInicial', id: 'inicial', rotulo: 'Pontuação inicial' },
];

export const AJUDA_APELIDO = 'De 2 a 30 caracteres. É o nome que aparece no ranking.';
export const AJUDA_POSICAO = 'Só para cadastro.';
export const AJUDA_PONTUACAO = 'Pontos de antes da 1ª partida no app (0 a 9999).';

export interface FormularioJogador {
  apelido: string;
  anoNascimento: string;
  posicao: Posicao | '';
  telefone: string;
  dataEntrada: string;
  pontuacaoInicial: string;
}

export type ErrosJogador = Partial<Record<CampoJogador, string>>;

export function errosDoJogador(erro: unknown): ErrosJogador {
  const mensagens = mensagensDosCampos(erro);
  const erros: ErrosJogador = {};
  for (const { campo } of CAMPOS_JOGADOR) if (mensagens[campo]) erros[campo] = mensagens[campo];
  return erros;
}

export function resumoDoJogador(erros: ErrosJogador) {
  return CAMPOS_JOGADOR.filter((c) => erros[c.campo]).map((c) => ({ id: c.id, rotulo: c.rotulo }));
}

/** Máscara do celular enquanto digita: só dígitos, até 11, no formato "(DD) 9XXXX-XXXX" (GEL-39). */
export function mascararTelefone(texto: string): string {
  const d = texto.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Texto do campo numérico como vai à API: vazio vira `null` (a API responde a mensagem do campo). */
export function numeroOuNulo(texto: string): number | null {
  if (texto.trim() === '') return null;
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

export function CamposJogador({
  dados,
  erros,
  mudar,
  hoje,
  comDataEntrada,
}: {
  dados: FormularioJogador;
  erros: ErrosJogador;
  mudar: <C extends keyof FormularioJogador>(campo: C, valor: FormularioJogador[C]) => void;
  hoje: string;
  comDataEntrada: boolean;
}) {
  const anoMaximo = Number(hoje.slice(0, 4)) - LIMITES_JOGADOR.idadeMinima;
  return (
    <>
      <Campo
        id="apelido"
        rotulo="Apelido"
        maxLength={LIMITES_JOGADOR.apelidoMax}
        autoComplete="off"
        ajuda={AJUDA_APELIDO}
        erro={erros.apelido}
        value={dados.apelido}
        onChange={(e) => mudar('apelido', e.target.value)}
      />
      <div className={modulo['duas-colunas']}>
        <Campo
          id="ano"
          rotulo="Ano de nascimento"
          type="number"
          inputMode="numeric"
          min={LIMITES_JOGADOR.anoNascimentoMin}
          max={anoMaximo}
          erro={erros.anoNascimento}
          value={dados.anoNascimento}
          onChange={(e) => mudar('anoNascimento', e.target.value)}
        />
        <CampoSeletor
          id="pos"
          rotulo="Posição"
          opcoes={OPCOES_POSICAO}
          opcaoVazia="Escolha"
          ajuda={AJUDA_POSICAO}
          valor={dados.posicao}
          erro={erros.posicao}
          aoMudar={(v) => mudar('posicao', v)}
        />
      </div>
      <div className={modulo['duas-colunas']}>
        <Campo
          id="tel"
          rotulo="Telefone (opcional)"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="(DD) 9XXXX-XXXX"
          erro={erros.telefone}
          value={dados.telefone}
          onChange={(e) => mudar('telefone', mascararTelefone(e.target.value))}
        />
        {comDataEntrada ? (
          <CampoData
            id="entrada"
            rotulo="Data de entrada"
            max={hoje}
            erro={erros.dataEntrada}
            value={dados.dataEntrada}
            onChange={(e) => mudar('dataEntrada', e.target.value)}
          />
        ) : null}
        <Campo
          id="inicial"
          rotulo="Pontuação inicial"
          type="number"
          inputMode="numeric"
          min={LIMITES_JOGADOR.pontuacaoMin}
          max={LIMITES_JOGADOR.pontuacaoMax}
          step={1}
          ajuda={AJUDA_PONTUACAO}
          erro={erros.pontuacaoInicial}
          value={dados.pontuacaoInicial}
          onChange={(e) => mudar('pontuacaoInicial', e.target.value)}
        />
      </div>
    </>
  );
}
