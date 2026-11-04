#!/usr/bin/env bash
# Dump cifrado do Postgres (FUN-47, FUN-49).
# Entrada (variáveis): DATABASE_URL, BACKUP_CHAVE (chave pública age) e SAIDA (arquivo .age final).
# O arquivo final só existe se dump e cifragem terminarem: escreve num temporário e renomeia no fim.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL ausente}"
: "${BACKUP_CHAVE:?BACKUP_CHAVE ausente}"
: "${SAIDA:?SAIDA ausente}"

TMP="${SAIDA}.tmp.$$"
limpar() { rm -f "$TMP"; }
trap limpar EXIT
falhou() { echo "dump-cifrado: falhou ($1)" >&2; exit 1; }

pg_dump -Fc --enable-row-security --dbname="$DATABASE_URL" | age -r "$BACKUP_CHAVE" -o "$TMP" \
  || falhou "pg_dump ou age"

[ -s "$TMP" ] || falhou "arquivo vazio"
mv "$TMP" "$SAIDA"
echo "dump-cifrado: ok"
