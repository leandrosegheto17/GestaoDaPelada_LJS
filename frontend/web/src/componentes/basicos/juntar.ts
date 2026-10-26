/** Junta nomes de classe ignorando valores vazios. */
export function juntar(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
