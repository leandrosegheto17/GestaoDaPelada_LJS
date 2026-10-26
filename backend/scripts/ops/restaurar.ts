import { existsSync } from 'node:fs';
import {
  exigirHostPermitido,
  hostDaUrl,
  hostELocal,
  HostRecusado,
} from '../../api/src/infraestrutura/seguranca/trava-host.ts';

/**
 * Restauração de um dump (`docs/runbook.md`, seção 4, passo 5) com a trava de host antes de qualquer escrita (SEC-009,
 * G-16). `pg_restore --clean` apaga tabelas, então:
 * - a trava de host vale como no `pnpm migrar`: host local passa; host remoto exige `--alvo teste` e a confirmação
 *   digitada do host (ou `CI=true`);
 * - `--alvo producao` é sempre recusado: a restauração vai para uma branch nova ou um banco local, nunca para produção;
 * - destino remoto exige `URL_ORIGEM` (a origem de produção, a mesma do passo 6 do runbook), e destino no mesmo
 *   endpoint do Neon é recusado. A comparação é pelo identificador do endpoint (o primeiro rótulo do host, sem o
 *   sufixo `-pooler`, em minúsculas e sem ponto final), então o pooler e o host com ponto final contam como o mesmo.
 * A senha sai da URL e vai em `PGPASSWORD`, fora da linha de comando. Nenhuma mensagem traz a URL.
 */
export interface OpcoesRestaurar {
  /** URL do banco de destino (`DATABASE_URL`). */
  url: string | undefined;
  /** Dump já decifrado (`pg_dump -Fc`). */
  arquivo: string | undefined;
  alvo?: string | undefined;
  ci?: string | undefined;
  /** URL da origem de produção (`URL_ORIGEM`), obrigatória quando o destino é remoto. */
  urlOrigem?: string | undefined;
  confirmar?: () => string | Promise<string>;
  /** Roda o comando e devolve o código de saída. */
  executar: (comando: string, args: string[], env: Record<string, string>) => number | Promise<number>;
  /** Binário do `pg_restore` (PostgreSQL 16). Padrão: `pg_restore` do PATH. */
  comando?: string | undefined;
}

/** Identificador do endpoint do Neon: primeiro rótulo do host, sem `-pooler`, em minúsculas e sem ponto final. */
export function endpointDoHost(host: string): string {
  const [primeiro = ''] = host.toLowerCase().replace(/\.+$/, '').split('.');
  return primeiro.replace(/-pooler$/, '');
}

export async function restaurar(opcoes: OpcoesRestaurar): Promise<number> {
  if (opcoes.alvo === 'producao') {
    throw new HostRecusado('Nunca restaure em produção: use uma branch nova do Neon (--alvo teste) ou o banco local.');
  }
  const host = await exigirHostPermitido({
    url: opcoes.url,
    alvo: opcoes.alvo,
    ci: opcoes.ci,
    confirmar: opcoes.confirmar,
  });
  if (!hostELocal(host)) {
    if (!opcoes.urlOrigem) {
      throw new HostRecusado(
        'Destino remoto: informe URL_ORIGEM (a origem de produção) para a trava conferir o endpoint.',
      );
    }
    const endpoint = endpointDoHost(host);
    if (endpointDoHost(hostDaUrl(opcoes.urlOrigem)) === endpoint) {
      throw new HostRecusado(
        `Destino no mesmo host da origem (mesmo endpoint ${endpoint}): restaure numa branch nova ou no banco local.`,
      );
    }
  }
  if (!opcoes.arquivo || !existsSync(opcoes.arquivo)) {
    throw new Error('Informe --arquivo com o dump decifrado (dump.pgdump).');
  }

  const destino = new URL(opcoes.url as string);
  const senha = decodeURIComponent(destino.password);
  destino.password = '';
  const env: Record<string, string> = senha ? { PGPASSWORD: senha } : {};
  const args = ['--no-owner', '--no-privileges', '--clean', '--if-exists', '-d', destino.toString(), opcoes.arquivo];
  return opcoes.executar(opcoes.comando ?? 'pg_restore', args, env);
}
