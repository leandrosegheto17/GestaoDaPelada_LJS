/** Tipos de `push-falso.mjs` (notificacoes T27), para os testes em TypeScript. */

export interface PushRecebido {
  caminho: string;
  ttl: string | null;
  topic: string | null;
  urgency: string | null;
  contentEncoding: string | null;
  comAutorizacao: boolean;
  bytes: number;
}

export interface PushFalso {
  /** Base do `endpoint` das assinaturas falsas: `http://localhost:<porta>`. */
  base: string;
  porta: number;
  /** O valor de `PUSH_HOSTS_DEV` que libera este servidor. */
  hostsDev: string;
  recebidas: PushRecebido[];
  fechar(): Promise<void>;
}

export declare function iniciarPushFalso(opcoes?: { porta?: number }): Promise<PushFalso>;
