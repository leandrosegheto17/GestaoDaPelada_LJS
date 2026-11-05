import {
  DIAS_DE_TRIAL,
  formatarPreco,
  PRECO_PRO_CENTAVOS,
  RECURSOS_POR_PLANO,
  type Recurso,
  type RecursosDoPlano,
} from '@pelada/dominio';
import { Link, useSearchParams } from 'react-router';
import { Casca, NOME_DO_APP } from '../../componentes/Casca.tsx';
import { Faixa } from '../../componentes/Faixa.tsx';
import { LinkBotao } from '../../componentes/LinkBotao.tsx';
import { TEXTO_CONTA_EXCLUIDA } from '../../paginas/Mensagens.tsx';
import estilos from './Landing.module.css';

/**
 * Landing em `/` (planos-e-cobranca T52; PLA-61, PLA-62, PLA-63; AD-023, AD-064, AD-094): o produto, o que ele resolve,
 * os dois planos lado a lado, os botões de criar conta e entrar, o rodapé com termos e privacidade e a faixa "Sua conta
 * foi excluída" em `?aviso=conta-excluida` (a mesma da página provisória, ACE-28). Preços, recursos e limites vêm da
 * tabela do domínio (`RECURSOS_POR_PLANO`, `formatarPreco`), nunca escritos aqui. Não chama a API (AD-094): só a rota
 * (T53) olha a sessão. Sem mockup de módulo: o estilo é o do guia, só com tokens.
 */

export const TITULO_LANDING = NOME_DO_APP;
export const TEXTO_PROPOSTA =
  'Presença, times equilibrados, ranking e caixa da sua pelada num lugar só, sem planilha e sem grupo de mensagens cheio de conta.';
export const TEXTO_GRATIS = 'Grátis';

/** O que cada recurso significa para quem lê a landing. */
export const NOMES_RECURSOS: Readonly<Record<Recurso, string>> = {
  partidas: 'Partidas com presença',
  ranking: 'Ranking, inclusive o link público',
  simulador: 'Simulador de times',
  financeiro: 'Financeiro: mensalidades e caixa',
  pdf: 'PDF do ranking',
  push: 'Avisos no celular',
};

export function textoPrecoPro(): string {
  return `${formatarPreco(PRECO_PRO_CENTAVOS)}/mês por grupo`;
}

export function textoTrial(): string {
  return `${DIAS_DE_TRIAL} dias de Pro grátis, sem cartão`;
}

/** Itens do plano: os recursos da tabela e os limites (ou "ilimitados"). */
export function itensDoPlano(plano: RecursosDoPlano): string[] {
  const itens = plano.recursos.map((r) => NOMES_RECURSOS[r]);
  itens.push(
    plano.limiteJogadores === null
      ? 'Jogadores ilimitados'
      : `Até ${plano.limiteJogadores} jogadores ativos`,
  );
  itens.push(
    plano.limiteGrupos === null
      ? 'Quantos grupos quiser'
      : `${plano.limiteGrupos} grupo${plano.limiteGrupos > 1 ? 's' : ''}`,
  );
  return itens;
}

function Plano({
  id,
  nome,
  preco,
  destaque,
  itens,
}: {
  id: string;
  nome: string;
  preco: string;
  destaque?: string | undefined;
  itens: string[];
}) {
  return (
    <section className={estilos.plano} aria-labelledby={id} data-plano={id}>
      <h2 className={estilos['plano__nome']} id={id}>
        {nome}
      </h2>
      <p className={estilos['plano__preco']}>{preco}</p>
      {destaque ? <p className={estilos['plano__destaque']}>{destaque}</p> : null}
      <ul className={estilos['plano__itens']}>
        {itens.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export function Landing() {
  const [parametros] = useSearchParams();
  return (
    <Casca>
      {parametros.get('aviso') === 'conta-excluida' ? (
        <Faixa tipo="sucesso">{TEXTO_CONTA_EXCLUIDA}</Faixa>
      ) : null}
      <div className={estilos.topo}>
        <h1 className={estilos.titulo}>{TITULO_LANDING}</h1>
        <p className={estilos.proposta}>{TEXTO_PROPOSTA}</p>
        <div className={estilos.acoes}>
          <LinkBotao para="/cadastro" variante="principal">
            Criar conta
          </LinkBotao>
          <LinkBotao para="/entrar" variante="secundario">
            Entrar
          </LinkBotao>
        </div>
      </div>

      <div className={estilos.planos}>
        <Plano
          id="plano-free"
          nome="Free"
          preco={TEXTO_GRATIS}
          itens={itensDoPlano(RECURSOS_POR_PLANO.free)}
        />
        <Plano
          id="plano-pro"
          nome="Pro"
          preco={textoPrecoPro()}
          destaque={textoTrial()}
          itens={itensDoPlano(RECURSOS_POR_PLANO.pro)}
        />
      </div>

      <footer className={estilos.rodape}>
        <Link to="/termos">Termos de uso</Link>
        <Link to="/privacidade">Privacidade</Link>
      </footer>
    </Casca>
  );
}
