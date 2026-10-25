const SELETOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Elementos focáveis por Tab dentro de um contêiner, na ordem do documento. */
export function focaveisEm(contêiner: HTMLElement): HTMLElement[] {
  return Array.from(contêiner.querySelectorAll<HTMLElement>(SELETOR)).filter(
    (el) => !el.hasAttribute('hidden') && el.getAttribute('aria-hidden') !== 'true',
  );
}
