import { DIAS_DA_SEMANA, FREQUENCIAS } from '@pelada/contrato/grupo';
import estilosCampo from './Campo.module.css';
import estilos from './CampoSeletor.module.css';

/**
 * Seletor de uma opção (GEL-115), da marcação de `t27-novo-grupo--vazio.html` e
 * `t16-jogador--novo.html`:
 * - `lista`: `select.campo__entrada` ("Dia da semana", "Posição"), com a opção vazia opcional
 *   ("Escolha");
 * - `segmentado`: `fieldset.segmentado` com rádios ("Frequência"), de
 *   `.specs/mockup/base.css:97-105`. O grupo recebe `role="radiogroup"` para levar
 *   `aria-invalid`, e o nome vem da `legend` por `aria-labelledby`.
 * Com erro, o mesmo padrão do `Campo`: `campo--erro`, `aria-invalid` e o erro ligado por
 * `aria-describedby`.
 *
 * `OPCOES_DIA_SEMANA` e `OPCOES_FREQUENCIA` são os rótulos de tela dos valores do contrato.
 */

export interface OpcaoSeletor<V extends string = string> {
  valor: V;
  rotulo: string;
}

export const ROTULOS_DIA_SEMANA: Record<(typeof DIAS_DA_SEMANA)[number], string> = {
  domingo: 'Domingo',
  segunda: 'Segunda',
  terca: 'Terça',
  quarta: 'Quarta',
  quinta: 'Quinta',
  sexta: 'Sexta',
  sabado: 'Sábado',
};

export const ROTULOS_FREQUENCIA: Record<(typeof FREQUENCIAS)[number], string> = {
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
};

export const OPCOES_DIA_SEMANA: readonly OpcaoSeletor<(typeof DIAS_DA_SEMANA)[number]>[] =
  DIAS_DA_SEMANA.map((valor) => ({
    valor,
    rotulo: ROTULOS_DIA_SEMANA[valor],
  }));

export const OPCOES_FREQUENCIA: readonly OpcaoSeletor<(typeof FREQUENCIAS)[number]>[] =
  FREQUENCIAS.map((valor) => ({
    valor,
    rotulo: ROTULOS_FREQUENCIA[valor],
  }));

export interface PropsCampoSeletor<V extends string> {
  id: string;
  rotulo: string;
  opcoes: readonly OpcaoSeletor<V>[];
  /** Valor escolhido; `''` quando nenhum. */
  valor: V | '';
  aoMudar: (valor: V) => void;
  variante?: 'lista' | 'segmentado' | undefined;
  /** Texto da opção vazia da `lista` (ex.: "Escolha"); ausente, sem opção vazia. */
  opcaoVazia?: string | undefined;
  ajuda?: string | undefined;
  erro?: string | undefined;
  desabilitado?: boolean | undefined;
  /** `segmentado` com o rótulo só para leitor de tela (classe `sr`), como no mockup do lançamento. */
  rotuloOculto?: boolean | undefined;
}

function IconeErro() {
  return (
    <svg
      className={estilosCampo.icone}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

export function CampoSeletor<V extends string>({
  id,
  rotulo,
  opcoes,
  valor,
  aoMudar,
  variante = 'lista',
  opcaoVazia,
  ajuda,
  erro,
  desabilitado = false,
  rotuloOculto = false,
}: PropsCampoSeletor<V>) {
  const idAjuda = ajuda ? `${id}-ajuda` : undefined;
  const idErro = erro ? `${id}-erro` : undefined;
  const descricao = [idAjuda, idErro].filter(Boolean).join(' ') || undefined;
  const classeCampo = [estilosCampo.campo, erro ? estilosCampo['campo--erro'] : '']
    .filter(Boolean)
    .join(' ');
  const rodape = (
    <>
      {ajuda ? (
        <p className={estilosCampo['campo__ajuda']} id={idAjuda}>
          {ajuda}
        </p>
      ) : null}
      {erro ? (
        <p className={estilosCampo['campo__erro']} id={idErro}>
          <IconeErro />
          {erro}
        </p>
      ) : null}
    </>
  );

  if (variante === 'segmentado') {
    const idLegenda = `${id}-rotulo`;
    return (
      <div className={classeCampo}>
        <fieldset
          id={id}
          className={estilos.segmentado}
          role="radiogroup"
          aria-labelledby={idLegenda}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          disabled={desabilitado || undefined}
        >
          <legend className={rotuloOculto ? 'sr' : estilosCampo['campo__rotulo']} id={idLegenda}>
            {rotulo}
          </legend>
          {opcoes.map((opcao) => (
            <label key={opcao.valor} className={estilos['segmentado__opcao']}>
              <input
                className={estilos['segmentado__entrada']}
                type="radio"
                name={id}
                value={opcao.valor}
                checked={valor === opcao.valor}
                onChange={() => aoMudar(opcao.valor)}
              />
              <span className={estilos['segmentado__texto']}>{opcao.rotulo}</span>
            </label>
          ))}
        </fieldset>
        {rodape}
      </div>
    );
  }

  return (
    <div className={classeCampo}>
      <label className={estilosCampo['campo__rotulo']} htmlFor={id}>
        {rotulo}
      </label>
      <select
        id={id}
        className={estilosCampo['campo__entrada']}
        value={valor}
        disabled={desabilitado || undefined}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descricao}
        onChange={(e) => {
          const escolhido = opcoes.find((o) => o.valor === e.target.value);
          if (escolhido) aoMudar(escolhido.valor);
        }}
      >
        {opcaoVazia !== undefined ? <option value="">{opcaoVazia}</option> : null}
        {opcoes.map((opcao) => (
          <option key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </option>
        ))}
      </select>
      {rodape}
    </div>
  );
}
