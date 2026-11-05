import { formatarPreco, PRECO_PRO_CENTAVOS, type RecursoPro } from '@pelada/dominio';
import estilos from './AvisoRecursoPro.module.css';
import { LinkBotao } from './LinkBotao.tsx';

/**
 * Aviso de recurso Pro (planos-e-cobranca T42; PLA-27, AD-064): aparece no lugar do formulário quando o grupo não tem o
 * recurso. O preço vem da tabela do domínio (`formatarPreco(PRECO_PRO_CENTAVOS)`), nunca escrito aqui. Sem mockup de
 * módulo: o estilo é o das telas do guia (ícone, título e texto da `tela-mensagem`, botão principal), só com tokens.
 * O título é `h2`: o aviso fica dentro de uma tela que já tem o `h1`.
 */

export const NOMES_RECURSOS_PRO: Readonly<Record<RecursoPro, string>> = {
  simulador: 'Simulador de times',
  financeiro: 'Financeiro',
  pdf: 'PDF do ranking',
  push: 'Avisos no celular',
};

export function textoPrecoPro(): string {
  return `Disponível no plano Pro: ${formatarPreco(PRECO_PRO_CENTAVOS)}/mês`;
}

export function caminhoMeuPlano(grupoId: string): string {
  return `/app/grupos/${encodeURIComponent(grupoId)}/plano`;
}

export interface PropsAvisoRecursoPro {
  recurso: RecursoPro;
  grupoId: string;
}

export function AvisoRecursoPro({ recurso, grupoId }: PropsAvisoRecursoPro) {
  return (
    <section className={estilos.aviso} aria-labelledby={`aviso-pro-${recurso}`}>
      <svg
        className={estilos.icone}
        viewBox="0 0 24 24"
        width={48}
        height={48}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <h2 className={estilos.titulo} id={`aviso-pro-${recurso}`}>
        {NOMES_RECURSOS_PRO[recurso]}
      </h2>
      <p className={estilos.texto}>{textoPrecoPro()}</p>
      <LinkBotao para={caminhoMeuPlano(grupoId)} variante="principal">
        Ver Meu plano
      </LinkBotao>
    </section>
  );
}
