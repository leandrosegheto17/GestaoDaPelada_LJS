import type { JogadorDaPartida, Marcacao, SituacaoMarcacao } from '@pelada/contrato/partidas';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Botao } from '../../componentes/Botao.tsx';
import { Busca } from '../../componentes/Busca.tsx';
import fin from '../financeiro/financeiro.module.css';
import modulo from '../grupos-elenco.module.css';
import estilos from './partida.module.css';

/**
 * Formulário da partida (t11; partidas-e-ranking T60, reaproveitado na edição, T61; PAR-31), de
 * `.specs/features/partidas-e-ranking/mockup/telas/t11-partida--nova.html` (R-04):
 * - a linha de cima com o campo de data (que o pai monta: editável no lançamento, fixo na edição) e "Choveu?";
 * - "Presentes N · Lesionados N · Expulsos N · Ausentes N", "Buscar jogador", "Marcar todos como presentes",
 *   "Limpar marcações" e, por jogador, os botões A, P, L e E (rádios num `fieldset` "Situação de <apelido>");
 * - "Salvar partida (N presentes)".
 *
 * As marcações ficam no estado deste componente: uma falha de envio não as perde (PAR-35). O pai troca a `key` quando
 * a lista muda de data, para recomeçar das situações que a API devolveu. Só as marcações P, L e E vão no corpo: a API
 * não grava `ausente` (PAR-23).
 */

const OPCOES: ReadonlyArray<{
  valor: SituacaoMarcacao;
  letra: string;
  nome: string;
  classe: string;
}> = [
  { valor: 'ausente', letra: 'A', nome: 'Ausente', classe: 'op-a' },
  { valor: 'presente', letra: 'P', nome: 'Presente', classe: 'op-p' },
  { valor: 'lesionado', letra: 'L', nome: 'Lesionado', classe: 'op-l' },
  { valor: 'expulso', letra: 'E', nome: 'Expulso', classe: 'op-e' },
];

export type Situacoes = Readonly<Record<string, SituacaoMarcacao>>;

export interface Contagem {
  presentes: number;
  lesionados: number;
  expulsos: number;
  ausentes: number;
}

export function contar(situacoes: Situacoes): Contagem {
  const c = { presentes: 0, lesionados: 0, expulsos: 0, ausentes: 0 };
  for (const s of Object.values(situacoes)) {
    if (s === 'presente') c.presentes += 1;
    else if (s === 'lesionado') c.lesionados += 1;
    else if (s === 'expulso') c.expulsos += 1;
    else c.ausentes += 1;
  }
  return c;
}

export function textoContagemMarcacoes(c: Contagem): string {
  return `Presentes ${c.presentes} · Lesionados ${c.lesionados} · Expulsos ${c.expulsos} · Ausentes ${c.ausentes}`;
}

/** "Salvar partida (1 presente)", "Salvar partida (19 presentes)". */
export function textoSalvar(presentes: number): string {
  return `Salvar partida (${presentes} ${presentes === 1 ? 'presente' : 'presentes'})`;
}

/** As marcações do corpo: só P, L e E, na ordem da lista. */
export function marcacoesDoCorpo(
  jogadores: readonly JogadorDaPartida[],
  situacoes: Situacoes,
): Marcacao[] {
  return jogadores
    .map((j) => ({ jogadorId: j.id, situacao: situacoes[j.id] ?? 'ausente' }))
    .filter((m) => m.situacao !== 'ausente');
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');
}

function situacoesIniciais(
  jogadores: readonly JogadorDaPartida[],
): Record<string, SituacaoMarcacao> {
  return Object.fromEntries(jogadores.map((j) => [j.id, j.situacao]));
}

export interface PropsFormularioPartida {
  /** Campo de data (editável no lançamento, texto fixo na edição). */
  campoData: ReactNode;
  choveuInicial: boolean;
  /** Ausente: a lista ainda carrega ou não há ativos; `semLista` ocupa o lugar dela e o envio fica desabilitado. */
  jogadores: readonly JogadorDaPartida[] | undefined;
  semLista?: ReactNode;
  salvando: boolean;
  aoSalvar: (dados: { choveu: boolean; marcacoes: Marcacao[] }) => void;
  /** Conteúdo depois do botão de salvar, na barra de ação (o "Excluir partida" da edição). */
  acoesExtras?: ReactNode;
  /** Aviso logo abaixo da data e do "Choveu?" (a faixa de pré-marcação da simulador T52, SIM-77). */
  avisoAposData?: ReactNode;
}

export function FormularioPartida({
  campoData,
  choveuInicial,
  jogadores,
  semLista,
  salvando,
  aoSalvar,
  acoesExtras,
  avisoAposData,
}: PropsFormularioPartida) {
  const [choveu, setChoveu] = useState(choveuInicial);
  const [situacoes, setSituacoes] = useState<Record<string, SituacaoMarcacao>>(() =>
    situacoesIniciais(jogadores ?? []),
  );
  const [busca, setBusca] = useState('');

  const comLista = jogadores !== undefined && jogadores.length > 0;
  const contagem = contar(
    Object.fromEntries((jogadores ?? []).map((j) => [j.id, situacoes[j.id] ?? 'ausente'])),
  );
  const visiveis = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!jogadores) return [];
    return termo === '' ? jogadores : jogadores.filter((j) => semAcento(j.apelido).includes(termo));
  }, [jogadores, busca]);

  function marcar(id: string, situacao: SituacaoMarcacao) {
    setSituacoes((s) => ({ ...s, [id]: situacao }));
  }

  function marcarTodos(situacao: SituacaoMarcacao) {
    setSituacoes(Object.fromEntries((jogadores ?? []).map((j) => [j.id, situacao])));
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!comLista || salvando) return;
    aoSalvar({ choveu, marcacoes: marcacoesDoCorpo(jogadores ?? [], situacoes) });
  }

  return (
    <form noValidate onSubmit={enviar}>
      <div className={modulo['duas-colunas']}>
        {campoData}
        <label className={fin.interruptor}>
          <span>Choveu?</span>
          <input
            type="checkbox"
            role="switch"
            checked={choveu}
            onChange={(e) => setChoveu(e.target.checked)}
          />
          <span className={fin['interruptor__trilho']} aria-hidden="true" />
          <span className={fin['interruptor__estado']} aria-hidden="true">
            {choveu ? 'Sim' : 'Não'}
          </span>
        </label>
      </div>
      {avisoAposData}
      {comLista ? (
        <>
          <p className={estilos['contagem-fixa']} aria-live="polite">
            {textoContagemMarcacoes(contagem)}
          </p>
          <div className={estilos['ferramentas-lista']}>
            <Busca id="busca" rotulo="Buscar jogador" valor={busca} aoMudar={setBusca} />
            <Botao variante="secundario" onClick={() => marcarTodos('presente')}>
              Marcar todos como presentes
            </Botao>
            <Botao variante="texto" onClick={() => marcarTodos('ausente')}>
              Limpar marcações
            </Botao>
          </div>
          <ul className={`${estilos['lista-situacao']} ${estilos['lista-situacao--duas']}`}>
            {visiveis.map((j) => (
              <li key={j.id} className={estilos['linha-jogador']}>
                <span className={estilos['linha-jogador__nome']} aria-hidden="true">
                  {j.apelido}
                </span>
                <fieldset className={estilos['seletor-situacao']}>
                  <legend className="sr">{`Situação de ${j.apelido}`}</legend>
                  {OPCOES.map((o) => (
                    <label key={o.valor} className={estilos[o.classe]}>
                      <input
                        type="radio"
                        name={`situacao-${j.id}`}
                        value={o.valor}
                        checked={(situacoes[j.id] ?? 'ausente') === o.valor}
                        onChange={() => marcar(j.id, o.valor)}
                      />
                      <span>
                        <i aria-hidden="true">{o.letra}</i>
                        <small>{o.nome}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>
              </li>
            ))}
          </ul>
        </>
      ) : (
        semLista
      )}
      <div className={modulo['reserva-barra']} aria-hidden="true" />
      <div className={modulo['barra-acao']}>
        <Botao type="submit" variante="principal" disabled={!comLista} carregando={salvando}>
          {comLista ? textoSalvar(contagem.presentes) : 'Salvar partida'}
        </Botao>
        {acoesExtras}
      </div>
    </form>
  );
}
