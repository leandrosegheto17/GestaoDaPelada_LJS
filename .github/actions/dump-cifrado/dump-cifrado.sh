#!/usr/bin/env bash
# Dump cifrado do banco: pg_dump -Fc | age -r <chave pública>.
# Entradas por variável de ambiente (nada de segredo em argumento):
#   DUMP_URL     URL do banco (role somente leitura, pelada_backup_ro)
#   BACKUP_CHAVE chave pública age (age1...)
#   SAIDA        caminho do arquivo .age final
# O arquivo é escrito num temporário e só renomeado no fim (FUN-49): se o dump ou a
# cifragem falhar, o script sai com código diferente de 0 e não deixa arquivo parcial.
set -euo pipefail

: "${DUMP_URL:?DUMP_URL não definida}"
: "${BACKUP_CHAVE:?BACKUP_CHAVE não definida}"
: "${SAIDA:?SAIDA não definida}"

temporario="${SAIDA}.parcial"
trap 'rm -f "$temporario"' EXIT

pg_dump -Fc --enable-row-security "$DUMP_URL" | age -r "$BACKUP_CHAVE" -o "$temporario"

mv "$temporario" "$SAIDA"
trap - EXIT
