/*
 * Referência do schema herdado (esquema-producao.txt): a leitura de `lerEsquema` num banco vazio migrado só com
 * as 23 migrações, sem o que depende do cluster. Roles são do servidor, não do banco: ficam só pelada_app e
 * pelada_backup_ro, e `login` vira `*` porque o seed local dá LOGIN a elas (AD-009).
 */
const ROLES_DA_REFERENCIA = ['pelada_app', 'pelada_backup_ro'];

export function referenciaDoEsquema(linhas: string[]): string {
  const normalizadas = linhas
    .filter((l) => {
      const m = /^role (\S+) /.exec(l);
      return !m || ROLES_DA_REFERENCIA.includes(m[1]!);
    })
    .map((l) => (l.startsWith('role ') ? l.replace(/ login=\w+/, ' login=*') : l));
  return normalizadas.join('\n') + '\n';
}
