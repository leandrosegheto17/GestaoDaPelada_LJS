import type { CodigoErro, CorpoErro } from '@pelada/contrato/acesso';
import { CODIGOS_ERRO, MENSAGENS_ERRO } from '@pelada/contrato/acesso';
import type { QueryClient } from '@tanstack/react-query';

/**
 * Cliente HTTP do front (ACE-20, ACE-49):
 * - toda escrita (método fora de GET e HEAD) leva `X-Pelada: 1`, que a API exige antes dos
 *   limitadores (T18);
 * - `credentials: 'same-origin'`: o cookie `__Host-sessao` vai junto, e só para a própria origem;
 * - erro da API vira `ErroApi`, com o status e o código do contrato (`corpoErro`);
 * - 401 `sessao_expirada`: limpa o cache de consultas (nada da conta fica na memória) e leva a
 *   `/entrar?aviso=sessao-expirada` (ACE-20). O 401 `sem_sessao` não navega: quem decide é a
 *   guarda de rota (T37).
 * - 403 `plano_pro` ou `somente_leitura` (planos-e-cobranca T41; PLA-21, AD-091): o plano do grupo mudou desde a
 *   última leitura; invalida as consultas do plano (`['plano', …]`) para a faixa e os avisos se atualizarem. Esses
 *   erros vêm na forma `{"erro": <código>, …}` da AD-091, sem `codigo`: o corpo bruto fica em `ErroApi.corpo`.
 */

/** Primeiro elemento das chaves de consulta do plano (`dados/plano.ts`). */
export const PREFIXO_CHAVE_PLANO = 'plano';

const ERROS_DE_PLANO = new Set(['plano_pro', 'somente_leitura']);

export const DESTINO_SESSAO_EXPIRADA = '/entrar?aviso=sessao-expirada';
export const CABECALHO_PELADA = 'X-Pelada';

const METODOS_LEITURA = new Set(['GET', 'HEAD']);

export class ErroApi extends Error {
  override name = 'ErroApi';
  /** Status HTTP; 0 quando a requisição nem chegou (rede). */
  readonly status: number;
  /** Código do contrato, quando a resposta trouxe um conhecido. */
  readonly codigo: CodigoErro | undefined;
  readonly campos: readonly string[];
  readonly grupos: NonNullable<CorpoErro['grupos']>;
  /** O corpo JSON da resposta como veio (os erros de plano da AD-091 não têm `codigo`). */
  readonly corpo: unknown;

  constructor(
    status: number,
    corpo: Partial<CorpoErro> | undefined,
    mensagemPadrao: string,
    bruto?: unknown,
  ) {
    super(corpo?.erro ?? mensagemPadrao);
    this.status = status;
    this.codigo = corpo?.codigo;
    this.campos = corpo?.campos ?? [];
    this.grupos = corpo?.grupos ?? [];
    this.corpo = bruto;
  }
}

export const MENSAGEM_REDE = 'Não foi possível conectar. Verifique a conexão e tente de novo.';
const MENSAGEM_INESPERADA = 'Algo deu errado. Tente de novo.';

export type Metodo = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OpcoesRequisicao {
  /**
   * Não limpa o cache nem navega no 401 `sessao_expirada`: a consulta da sessão (T37) usa,
   * para a guarda decidir sem laço de navegação no `/entrar`.
   */
  semTratarExpiracao?: boolean;
}

export interface ClienteApi {
  requisitar<T>(
    metodo: Metodo,
    caminho: string,
    corpo?: unknown,
    opcoes?: OpcoesRequisicao,
  ): Promise<T>;
  get<T>(caminho: string): Promise<T>;
  post<T>(caminho: string, corpo?: unknown): Promise<T>;
  put<T>(caminho: string, corpo?: unknown): Promise<T>;
  patch<T>(caminho: string, corpo?: unknown): Promise<T>;
  delete<T>(caminho: string, corpo?: unknown): Promise<T>;
}

export interface DependenciasCliente {
  consultas: QueryClient;
  navegar: (destino: string) => void;
  /** Padrão: o `fetch` global (o teste injeta um dublê). */
  fetch?: typeof fetch;
}

function codigoConhecido(valor: unknown): valor is CodigoErro {
  return typeof valor === 'string' && (CODIGOS_ERRO as readonly string[]).includes(valor);
}

async function lerCorpo(resposta: Response): Promise<unknown> {
  if (resposta.status === 204) return undefined;
  const tipo = resposta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) return undefined;
  try {
    return await resposta.json();
  } catch {
    return undefined;
  }
}

function corpoDeErro(valor: unknown): Partial<CorpoErro> | undefined {
  if (typeof valor !== 'object' || valor === null) return undefined;
  const v = valor as Record<string, unknown>;
  if (!codigoConhecido(v.codigo)) return undefined;
  return {
    codigo: v.codigo,
    erro: typeof v.erro === 'string' ? v.erro : MENSAGENS_ERRO[v.codigo],
    campos: Array.isArray(v.campos)
      ? v.campos.filter((c): c is string => typeof c === 'string')
      : undefined,
    grupos: Array.isArray(v.grupos) ? (v.grupos as CorpoErro['grupos']) : undefined,
  };
}

function ehErroDePlano(valor: unknown): boolean {
  if (typeof valor !== 'object' || valor === null) return false;
  const erro = (valor as Record<string, unknown>).erro;
  return typeof erro === 'string' && ERROS_DE_PLANO.has(erro);
}

export function criarCliente({
  consultas,
  navegar,
  fetch: buscar = globalThis.fetch.bind(globalThis),
}: DependenciasCliente): ClienteApi {
  async function requisitar<T>(
    metodo: Metodo,
    caminho: string,
    corpo?: unknown,
    opcoes: OpcoesRequisicao = {},
  ): Promise<T> {
    const cabecalhos: Record<string, string> = { Accept: 'application/json' };
    if (!METODOS_LEITURA.has(metodo)) cabecalhos[CABECALHO_PELADA] = '1';
    if (corpo !== undefined) cabecalhos['Content-Type'] = 'application/json';

    let resposta: Response;
    try {
      resposta = await buscar(caminho, {
        method: metodo,
        headers: cabecalhos,
        credentials: 'same-origin',
        body: corpo === undefined ? undefined : JSON.stringify(corpo),
      });
    } catch {
      throw new ErroApi(0, undefined, MENSAGEM_REDE);
    }

    const dados = await lerCorpo(resposta);
    if (resposta.ok) return dados as T;

    const erro = corpoDeErro(dados);
    if (
      resposta.status === 401 &&
      erro?.codigo === 'sessao_expirada' &&
      !opcoes.semTratarExpiracao
    ) {
      consultas.clear();
      navegar(DESTINO_SESSAO_EXPIRADA);
    }
    if (resposta.status === 403 && ehErroDePlano(dados)) {
      void consultas.invalidateQueries({ queryKey: [PREFIXO_CHAVE_PLANO] });
    }
    throw new ErroApi(resposta.status, erro, MENSAGEM_INESPERADA, dados);
  }

  return {
    requisitar,
    get: (caminho) => requisitar('GET', caminho),
    post: (caminho, corpo) => requisitar('POST', caminho, corpo),
    put: (caminho, corpo) => requisitar('PUT', caminho, corpo),
    patch: (caminho, corpo) => requisitar('PATCH', caminho, corpo),
    delete: (caminho, corpo) => requisitar('DELETE', caminho, corpo),
  };
}
