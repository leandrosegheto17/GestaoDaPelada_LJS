# Quebras autorizadas do contrato (G-20)

Cada linha libera uma quebra de compatibilidade detectada por `pnpm --filter @pelada/contrato checar-compatibilidade`:
campo removido, renomeado, de outro tipo ou que passou a ser obrigatório. Formato: ``- `schema.campo` - motivo``.
Depois de liberar, regrave o snapshot com `node scripts/checar-compatibilidade.ts --gravar`.

Nenhuma quebra autorizada até agora.
