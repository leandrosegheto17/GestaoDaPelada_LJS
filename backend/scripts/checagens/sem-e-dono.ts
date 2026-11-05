import { join } from 'node:path';
import { arquivosDoRepositorio, type Arquivo } from './sem-url-absoluta.ts';

/**
 * Checagem `sem-e-dono` (T33; ACE-63): nenhuma rota, caso de uso ou repositório lê ou escreve a
 * marca de dono da conta, e nenhum código da aplicação faz hash de senha por conta própria (o
 * bcrypt é só do banco, nas funções das migrações).
 *
 * - a coluna de dono (o nome é montado por partes, para este arquivo passar sobre si mesmo) em
 *   `backend/api/src/entrada/`, `backend/api/src/aplicacao/` e
 *   `backend/api/src/infraestrutura/db/repositorios/` reprova;
 * - `crypt(`, `scrypt(` ou a importação de uma biblioteca de hash de senha (bcrypt, argon2) em
 *   `backend/api/src/` fora de `migracoes/`, ou em `frontend/web/src/`, reprova.
 */
export const RAIZ = join(import.meta.dirname, '..', '..', '..');

const COLUNA_DONO = ['e', 'dono'].join('_');
const RE_DONO = new RegExp(`\\b${COLUNA_DONO}\\b`);

export const PASTAS_SEM_DONO: readonly string[] = [
  'backend/api/src/entrada/',
  'backend/api/src/aplicacao/',
  'backend/api/src/infraestrutura/db/repositorios/',
];

export const PASTAS_SEM_HASH: readonly string[] = ['backend/api/src/', 'frontend/web/src/'];

/** As migrações podem (e devem) usar o `crypt` do pgcrypto. */
export const PASTA_MIGRACOES = 'backend/api/src/infraestrutura/db/migracoes/';

const PROIBIDOS_HASH: ReadonlyArray<[string, RegExp]> = [
  ['crypt(', /\bcrypt\s*\(/i],
  ['scrypt(', /\bscrypt(Sync)?\s*\(/],
  ['biblioteca de hash de senha', /['"](bcrypt|bcryptjs|argon2|@node-rs\/argon2|@node-rs\/bcrypt|scrypt-js)['"]/],
];

function emAlguma(caminho: string, pastas: readonly string[]): boolean {
  return pastas.some((p) => caminho.startsWith(p));
}

/** Uma linha por ocorrência: `caminho:linha: <motivo>`. */
export function checarDonoEHash(arquivos: readonly Arquivo[]): string[] {
  const problemas: string[] = [];
  for (const { caminho: bruto, conteudo } of arquivos) {
    const caminho = bruto.replace(/\\/g, '/');
    if (conteudo.includes('\u0000')) continue;
    const semDono = emAlguma(caminho, PASTAS_SEM_DONO);
    const semHash = emAlguma(caminho, PASTAS_SEM_HASH) && !caminho.startsWith(PASTA_MIGRACOES);
    if (!semDono && !semHash) continue;
    conteudo.split('\n').forEach((linha, i) => {
      if (semDono && RE_DONO.test(linha)) {
        problemas.push(`${caminho}:${i + 1}: cita a coluna ${COLUNA_DONO}; nenhuma rota lê ou escreve a marca de dono (ACE-63)`);
      }
      if (semHash) {
        for (const [termo, re] of PROIBIDOS_HASH) {
          if (re.test(linha)) problemas.push(`${caminho}:${i + 1}: usa ${termo}; o hash de senha é só do banco`);
        }
      }
    });
  }
  return problemas;
}

if (import.meta.main) {
  const problemas = checarDonoEHash(arquivosDoRepositorio(RAIZ));
  for (const p of problemas) console.error(`sem-e-dono: ${p}`);
  process.exitCode = problemas.length === 0 ? 0 : 1;
}
