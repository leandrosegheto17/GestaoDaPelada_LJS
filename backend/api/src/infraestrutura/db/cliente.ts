import pg from 'pg';

/** O banco não respondeu. A mensagem é fixa de propósito: a URL e o endereço nunca saem daqui (FUN-16). */
export class BancoIndisponivel extends Error {
  constructor() {
    super('Banco indisponível');
    this.name = 'BancoIndisponivel';
  }
}

const TEMPO_LIMITE_CONEXAO_MS = 5_000;

export interface OpcoesCliente {
  /** Nome que a sessão leva no `pg_stat_activity`. */
  applicationName?: string;
}

export interface ClienteLazy {
  /** Abre a conexão na primeira chamada e devolve a mesma nas seguintes. */
  conectar(): Promise<pg.Client>;
  /** A conexão chegou a ser pedida. */
  aberto(): boolean;
  /** Fecha a conexão, se houve. Seguro chamar mais de uma vez. */
  fechar(): Promise<void>;
}

/**
 * Cliente `pg` de UMA requisição: só abre quando alguém pede (FUN-16). A string de conexão vem de uma função para que
 * ninguém a guarde antes da hora. Falha ao conectar vira `BancoIndisponivel`, sem a causa original.
 */
export function criarClienteLazy(
  connectionString: () => string,
  opcoes: OpcoesCliente = {},
): ClienteLazy {
  let cliente: pg.Client | null = null;
  let abertura: Promise<pg.Client> | null = null;

  return {
    conectar() {
      abertura ??= (async () => {
        const novo = new pg.Client({
          connectionString: connectionString(),
          connectionTimeoutMillis: TEMPO_LIMITE_CONEXAO_MS,
          ...(opcoes.applicationName ? { application_name: opcoes.applicationName } : {}),
        });
        // Ao fechar, o socket do Workers cancela a leitura pendente ("This socket has been closed") e emite 'error'
        // no próprio socket e no cliente; sem ouvinte, vira rejeição não tratada.
        novo.on('error', () => undefined);
        (novo as unknown as { connection: { stream: NodeJS.EventEmitter } }).connection.stream.on(
          'error',
          () => undefined,
        );
        cliente = novo;
        try {
          await novo.connect();
        } catch {
          throw new BancoIndisponivel();
        }
        return novo;
      })();
      return abertura;
    },
    aberto: () => abertura !== null,
    async fechar() {
      const atual = cliente;
      cliente = null;
      if (!atual) return;
      await abertura?.catch(() => undefined);
      await atual.end().catch(() => undefined);
    },
  };
}
