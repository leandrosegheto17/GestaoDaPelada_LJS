import { notaResposta } from '@pelada/contrato';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { escrever } from './cliente';
import { caminhoJogador, chavesElenco } from './elenco';

/** Nível na tela (GEL-103): centésimos com uma casa decimal, meio para cima (683 → "6,8", 685 → "6,9"). */
export function formatarNivel(nivel: number, semNota = false): string {
  if (semNota) return 'sem nota';
  const decimos = Math.floor((nivel + 5) / 10);
  return `${Math.floor(decimos / 10)},${decimos % 10}`;
}

interface Pedido {
  habilidadeId: string;
  /** `null` apaga a nota (GEL-98). */
  nota: number | null;
}

/** `PUT …/jogadores/:id/notas/:habilidadeId` (GEL-97): devolve o nível novo; invalida a ficha e a lista. */
export function useSalvarNota(grupoId: string, jogadorId: string) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: ({ habilidadeId, nota }: Pedido) =>
      escrever(
        'PUT',
        `${caminhoJogador(grupoId, jogadorId)}/notas/${encodeURIComponent(habilidadeId)}`,
        { nota },
        notaResposta,
      ),
    onSuccess: () =>
      Promise.all([
        cliente.invalidateQueries({ queryKey: chavesElenco.detalhe(grupoId, jogadorId) }),
        cliente.invalidateQueries({ queryKey: chavesElenco.lista(grupoId), exact: true }),
      ]),
  });
}
