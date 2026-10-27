/** Corpo de erro da API: `{ erro: { codigo, mensagem, campos?, ...extras } }` (ex.: `grupos` em `unico_admin`). */
export interface CorpoErroApi {
  erro: { codigo: string; mensagem: string; campos?: Record<string, string>; [extra: string]: unknown };
}

/** Confere a forma do erro padrão sem depender de biblioteca de schema. */
export function lerCorpoErro(dado: unknown): CorpoErroApi | null {
  if (typeof dado !== 'object' || dado === null) return null;
  const erro = (dado as { erro?: unknown }).erro;
  if (typeof erro !== 'object' || erro === null) return null;
  const { codigo, mensagem, campos } = erro as Record<string, unknown>;
  if (typeof codigo !== 'string' || typeof mensagem !== 'string') return null;
  if (campos !== undefined) {
    if (typeof campos !== 'object' || campos === null) return null;
    if (!Object.values(campos).every((v) => typeof v === 'string')) return null;
  }
  return dado as CorpoErroApi;
}

/** Erro devolvido pela API na forma padrão. */
export class ErroApi extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly campos: Record<string, string> | undefined;
  readonly extras: Record<string, unknown>;

  constructor(status: number, corpo: CorpoErroApi) {
    super(corpo.erro.mensagem);
    this.name = 'ErroApi';
    this.status = status;
    const { codigo, campos, ...resto } = corpo.erro;
    this.codigo = codigo;
    this.campos = campos;
    this.extras = Object.fromEntries(Object.entries(resto).filter(([chave]) => chave !== 'mensagem'));
  }
}

/** A requisição não chegou à API (rede fora, DNS, conexão interrompida). */
export class ErroRede extends Error {
  constructor(causa: unknown) {
    super('Falha de rede.', { cause: causa });
    this.name = 'ErroRede';
  }
}

/** A resposta não confere com o contrato, ou o erro não tem a forma padrão (ex.: HTML de 429/502). */
export class ErroResposta extends Error {
  readonly status: number;

  constructor(status: number, detalhe: string) {
    super(`Resposta inesperada da API (${status}): ${detalhe}`);
    this.name = 'ErroResposta';
    this.status = status;
  }
}

export function ehErroDeRede(erro: unknown): erro is ErroRede {
  return erro instanceof ErroRede;
}
