import {
  CAMPOS_PESO,
  LIMITES_PESO,
  type CampoPeso,
  type PesosCorpo,
  type PesosPainel,
} from '@pelada/contrato/pesos';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router';
import { Botao } from '../../componentes/Botao.tsx';
import { Campo } from '../../componentes/Campo.tsx';
import campo from '../../componentes/Campo.module.css';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { EsqueletoLista } from '../../componentes/EsqueletoLista.tsx';
import { EstadoErro } from '../../componentes/EstadoErro.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import {
  FaixaSomenteLeitura,
  TrechoSomenteLeitura,
} from '../../componentes/FaixaSomenteLeitura.tsx';
import { LinkVoltar } from '../../componentes/LinkVoltar.tsx';
import { ItemLista, Lista } from '../../componentes/Lista.tsx';
import { ResumoErros, type ErroDoResumo } from '../../componentes/ResumoErros.tsx';
import { ErroApi } from '../../dados/cliente.ts';
import { mensagensDosCampos } from '../../dados/erros-campo.ts';
import { useGrupo } from '../../dados/grupos.ts';
import { usePesos, useSalvarPesos } from '../../dados/pesos.ts';
import estilos from '../acesso.module.css';
import modulo from '../grupos-elenco.module.css';
import { rotaDoGrupo } from '../grupos/Grupos.tsx';
import tabela from '../tabela-simples.module.css';

/**
 * Pontuação (`/app/grupos/:grupoId/pontuacao`, t18; partidas-e-ranking T62; PAR-10, PAR-11, PAR-12, PAR-147), de
 * `.specs/mockup/telas/t18-pontuacao--{sucesso,salvo,erro}.html`:
 * - "Vigente desde dd/mm/aaaa" e a tabela "Pesos vigentes" (Situação, Pontos);
 * - o formulário "Nova configuração (vale a partir de hoje)" com os 6 pesos, a nota "Inteiros de −10 a 10. Partidas
 *   anteriores a hoje não mudam." e "Salvar nova configuração";
 * - campo vazio ou fora de inteiro de −10 a 10: "Use um número inteiro de −10 a 10." ao lado dele, sem enviar
 *   (PAR-12); 422 da API: "Corrija N campos: …" e a mensagem em cada campo (PAR-147);
 * - salvo: "Nova configuração vale a partir de hoje." (PAR-11), com o painel novo;
 * - "Histórico": uma linha por configuração anterior, mais recente primeiro, "De … a …" e
 *   "p · p · p · p · p · p · registrado por <nome>" (PAR-10);
 * - somente leitura (planos-e-cobranca T49; PLA-22): a faixa no topo e os campos e "Salvar nova configuração"
 *   desabilitados; os pesos vigentes e o histórico continuam.
 *
 * Números negativos aparecem com o sinal de menos tipográfico ("−1"), como no mockup.
 * [LACUNA] a mensagem local usa "−10" (sinal de menos, como a spec e o mockup); o `MENSAGEM_PESO` do contrato, que a
 * API devolve no 422, usa o hífen ("-10").
 */

export const MENSAGEM_PESO_TELA = `Use um número inteiro de −${Math.abs(LIMITES_PESO.min)} a ${LIMITES_PESO.max}.`;
export const NOTA_PESOS = 'Inteiros de −10 a 10. Partidas anteriores a hoje não mudam.';
export const TEXTO_SALVO = 'Nova configuração vale a partir de hoje.';

export const ROTULOS_PESO: Readonly<Record<CampoPeso, string>> = {
  presencaSemChuva: 'Presença sem chuva',
  presencaComChuva: 'Presença com chuva',
  lesionadoSemChuva: 'Lesionado sem chuva',
  lesionadoComChuva: 'Lesionado com chuva',
  expulsoSemChuva: 'Expulso sem chuva',
  expulsoComChuva: 'Expulso com chuva',
};

/** "2026-09-01" → "01/09/2026". */
export function dataCompleta(data: string): string {
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** −1 → "−1" (sinal tipográfico). */
export function numero(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

/** O texto do campo vira peso: inteiro de −10 a 10, aceitando "-" e "−"; o resto é `null`. */
export function lerPeso(texto: string): number | null {
  const limpo = texto.trim().replace('−', '-');
  if (!/^-?\d+$/.test(limpo)) return null;
  const n = Number(limpo);
  return n >= LIMITES_PESO.min && n <= LIMITES_PESO.max ? n : null;
}

export function textoPesos(p: Record<CampoPeso, number>): string {
  return CAMPOS_PESO.map((c) => numero(p[c])).join(' · ');
}

type Textos = Record<CampoPeso, string>;

function textosDe(p: Record<CampoPeso, number>): Textos {
  return Object.fromEntries(CAMPOS_PESO.map((c) => [c, String(p[c])])) as Textos;
}

function Painel({ grupoId, painel }: { grupoId: string; painel: PesosPainel }) {
  const salvar = useSalvarPesos(grupoId);
  const [textos, setTextos] = useState<Textos>(() => textosDe(painel.vigente));
  const [erros, setErros] = useState<Partial<Record<CampoPeso, string>>>({});
  const [resumo, setResumo] = useState<ErroDoResumo[]>([]);
  const [salvo, setSalvo] = useState(false);
  const [falha, setFalha] = useState<string | null>(null);
  const { vigente, historico } = painel;

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvar.isPending) return;
    setSalvo(false);
    setFalha(null);
    const locais: Partial<Record<CampoPeso, string>> = {};
    const corpo: Partial<PesosCorpo> = {};
    for (const c of CAMPOS_PESO) {
      const n = lerPeso(textos[c]);
      if (n === null) locais[c] = MENSAGEM_PESO_TELA;
      else corpo[c] = n;
    }
    if (Object.keys(locais).length > 0) {
      // PAR-12: a validação local fica ao lado do campo, e nada vai à API.
      setErros(locais);
      setResumo([]);
      return;
    }
    setErros({});
    setResumo([]);
    salvar.mutate(corpo as PesosCorpo, {
      onSuccess: (novo) => {
        setTextos(textosDe(novo.vigente));
        setSalvo(true);
      },
      onError: (erro) => {
        if (erro instanceof ErroApi && erro.status === 422) {
          const porCampo = mensagensDosCampos(erro);
          const conhecidos = Object.fromEntries(
            Object.entries(porCampo).filter(([c]) => c in ROTULOS_PESO),
          ) as Partial<Record<CampoPeso, string>>;
          setErros(conhecidos);
          setResumo(
            CAMPOS_PESO.filter((c) => c in conhecidos).map((c) => ({
              id: c,
              rotulo: ROTULOS_PESO[c],
            })),
          );
          if (Object.keys(conhecidos).length === 0) setFalha(erro.message);
          return;
        }
        setFalha(erro instanceof Error ? erro.message : 'Não foi possível salvar. Tente de novo.');
      },
    });
  }

  return (
    <>
      {salvo ? <Faixa tipo="sucesso">{TEXTO_SALVO}</Faixa> : null}
      {falha ? <Faixa tipo="erro">{falha}</Faixa> : null}
      <ResumoErros erros={resumo} />
      <section className={modulo.cartao} aria-labelledby="vig">
        <h2 id="vig" className={`${estilos.subtitulo} ${modulo['sem-topo']}`}>
          {`Vigente desde ${dataCompleta(vigente.vigenteDesde)}`}
        </h2>
        <table className={tabela['tabela-simples']}>
          <caption className="sr">Pesos vigentes</caption>
          <thead>
            <tr>
              <th scope="col">Situação</th>
              <th scope="col">Pontos</th>
            </tr>
          </thead>
          <tbody>
            {CAMPOS_PESO.map((c) => (
              <tr key={c}>
                <th scope="row">{ROTULOS_PESO[c]}</th>
                <td>{numero(vigente[c])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className={estilos.secao} aria-labelledby="nova">
        <h2 id="nova" className={estilos.subtitulo}>
          Nova configuração (vale a partir de hoje)
        </h2>
        <form className={estilos.formulario} noValidate onSubmit={enviar}>
          <TrechoSomenteLeitura grupoId={grupoId}>
            <div className={modulo['duas-colunas']}>
              {CAMPOS_PESO.map((c) => (
                <Campo
                  key={c}
                  id={c}
                  rotulo={ROTULOS_PESO[c]}
                  type="number"
                  min={LIMITES_PESO.min}
                  max={LIMITES_PESO.max}
                  step={1}
                  inputMode="numeric"
                  value={textos[c]}
                  erro={erros[c]}
                  onChange={(e) => setTextos((t) => ({ ...t, [c]: e.target.value }))}
                />
              ))}
            </div>
            <p className={campo['campo__ajuda']}>{NOTA_PESOS}</p>
            <div>
              <Botao type="submit" variante="principal" carregando={salvar.isPending}>
                Salvar nova configuração
              </Botao>
            </div>
          </TrechoSomenteLeitura>
        </form>
      </section>
      <section className={estilos.secao} aria-labelledby="hist">
        <h2 id="hist" className={estilos.subtitulo}>
          Histórico
        </h2>
        {historico.length === 0 ? (
          <p>Nenhuma configuração anterior.</p>
        ) : (
          <Lista rotulo="Configurações anteriores">
            {historico.map((h) => (
              <ItemLista
                key={h.vigenteDesde}
                titulo={`De ${dataCompleta(h.vigenteDesde)} a ${dataCompleta(h.vigenteAte)}`}
                meta={`${textoPesos(h)} · registrado por ${h.registradoPor}`}
              />
            ))}
          </Lista>
        )}
      </section>
    </>
  );
}

export function PaginaPontuacao() {
  const { grupoId = '' } = useParams();
  const base = rotaDoGrupo(grupoId);
  const grupo = useGrupo(grupoId);
  const consulta = usePesos(grupoId);

  function conteudo() {
    if (consulta.isPending) return <EsqueletoLista linhas={4} rotulo="Carregando a pontuação…" />;
    if (consulta.isError) {
      if (consulta.error instanceof ErroApi && consulta.error.status === 404)
        return <Faixa tipo="atencao">Grupo não encontrado.</Faixa>;
      return <EstadoErro aoTentarDeNovo={() => void consulta.refetch()} />;
    }
    return <Painel grupoId={grupoId} painel={consulta.data} />;
  }

  return (
    <Casca
      grupo={{ nome: grupo.data?.nome ?? NOME_DO_APP, trocarHref: '/app' }}
      titulo="Pontuação"
      estreita
    >
      <LinkVoltar para={base}>Início</LinkVoltar>
      <FaixaSomenteLeitura grupoId={grupoId} />
      {conteudo()}
    </Casca>
  );
}
