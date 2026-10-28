import { existsSync } from 'node:fs';
import {
  exigirHostPermitido,
  hostDaUrl,
  hostELocal,
  HostRecusado,
} from '../../api/src/infraestrutura/seguranca/trava-host.ts';
import { conferirUrlNeon } from '../../api/src/infraestrutura/seguranca/url-neon.ts';

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
 * SEC-011: quem conecta é a libpq, não o parser WHATWG da trava. Por isso a consulta da URL só aceita a lista de
 * permissão `PARAMETROS_PERMITIDOS` (nada de `service`, `hostaddr`, `host`, `passfile`, `options`, `dbname`...),
 * `password=` é recusado (senha só pelo `PGPASSWORD`), e o `pg_restore` roda com ambiente limpo: nenhuma variável
 * `PG*` herdada (`PGHOSTADDR`, `PGSERVICE`...) chega a ele, só o `PGPASSWORD` e o mínimo para o processo rodar.
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
  /** Roda o comando com exatamente o ambiente recebido (já limpo) e devolve o código de saída. */
  executar: (comando: string, args: string[], env: Record<string, string>) => number | Promise<number>;
  /** Ambiente de onde sai o mínimo repassado ao `pg_restore`. Padrão: `process.env`. */
  ambiente?: Record<string, string | undefined> | undefined;
  /** Binário do `pg_restore` (PostgreSQL 18). Padrão: `pg_restore` do PATH. */
  comando?: string | undefined;
}

/** Únicos parâmetros aceitos na consulta da URL de destino (nomes exatos, como a libpq os lê). */
export const PARAMETROS_PERMITIDOS = new Set(['sslmode', 'channel_binding', 'connect_timeout', 'application_name']);

/** Variáveis herdadas que o `pg_restore` precisa para rodar (comparadas sem caixa: `Path`, `SystemRoot`...). */
const AMBIENTE_PERMITIDO = new Set([
  'PATH',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'HOME',
  'APPDATA',
  'LANG',
  'LC_ALL',
]);

function exigirParametrosPermitidos(url: string | undefined): void {
  let analisada: URL;
  try {
    analisada = new URL(url ?? '');
  } catch {
    return; // A trava de host recusa URL ausente ou inválida com a mensagem dela.
  }
  for (const nome of analisada.searchParams.keys()) {
    if (nome === 'password') {
      throw new HostRecusado('Senha na consulta da URL não é aceita: use a senha da URL ou PGPASSWORD.');
    }
    if (!PARAMETROS_PERMITIDOS.has(nome)) {
      throw new HostRecusado(
        `Parâmetro não aceito na consulta da URL do destino; aceitos: ${[...PARAMETROS_PERMITIDOS].join(', ')}.`,
      );
    }
  }
}

/** Ambiente limpo do `pg_restore`: só o mínimo para rodar e o `PGPASSWORD` (o da URL vence o herdado). */
function ambienteLimpo(ambiente: Record<string, string | undefined>, senha: string): Record<string, string> {
  const limpo: Record<string, string> = {};
  for (const [nome, valor] of Object.entries(ambiente)) {
    if (valor !== undefined && AMBIENTE_PERMITIDO.has(nome.toUpperCase())) limpo[nome] = valor;
  }
  const senhaFinal = senha || ambiente['PGPASSWORD'];
  if (senhaFinal) limpo['PGPASSWORD'] = senhaFinal;
  return limpo;
}

/** Identificador do endpoint do Neon: primeiro rótulo do host, sem `-pooler`, em minúsculas e sem ponto final. */
export function endpointDoHost(host: string): string {
  const [primeiro = ''] = host.toLowerCase().replace(/\.+$/, '').split('.');
  return primeiro.replace(/-pooler$/, '');
}

export async function restaurar(opcoes: OpcoesRestaurar): Promise<number> {
  if (opcoes.alvo === 'producao') {
    throw new HostRecusado('Nunca restaure em produção: use a branch dev do Neon (--alvo teste) ou o banco local.');
  }
  exigirParametrosPermitidos(opcoes.url);
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
        `Destino no mesmo host da origem (mesmo endpoint ${endpoint}): restaure na branch dev ou no banco local.`,
      );
    }
    // ADR-032: destino remoto é a branch dev do Neon, pela conexão direta do owner, com TLS.
    conferirUrlNeon(opcoes.url, 'owner');
  }
  if (!opcoes.arquivo || !existsSync(opcoes.arquivo)) {
    throw new Error('Informe --arquivo com o dump decifrado (dump.pgdump).');
  }

  const destino = new URL(opcoes.url as string);
  const senha = decodeURIComponent(destino.password);
  destino.password = '';
  const env = ambienteLimpo(opcoes.ambiente ?? process.env, senha);
  const args = ['--no-owner', '--no-privileges', '--clean', '--if-exists', '-d', destino.toString(), opcoes.arquivo];
  return opcoes.executar(opcoes.comando ?? 'pg_restore', args, env);
}
