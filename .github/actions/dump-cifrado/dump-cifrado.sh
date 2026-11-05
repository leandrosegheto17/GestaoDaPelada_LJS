#!/usr/bin/env bash
# Dump cifrado de um banco Postgres (FUN-47, FUN-49).
# Entrada por variáveis de ambiente, para a URL não aparecer na lista de processos:
#   PG_URL         URL do banco (role somente leitura)
#   CHAVE_PUBLICA  destinatário age (age1...)
#   SAIDA          caminho do arquivo final .age
# Só cria SAIDA se o dump e a cifragem terminarem; qualquer falha sai com código != 0
# e apaga o arquivo parcial.
set -euo pipefail

: "${PG_URL:?PG_URL não definida}"
: "${CHAVE_PUBLICA:?CHAVE_PUBLICA não definida}"
: "${SAIDA:?SAIDA não definida}"

parcial="$(mktemp "${SAIDA}.parcial.XXXXXX")"
trap 'rm -f "$parcial"' EXIT

pg_dump --format=custom --enable-row-security --dbname="$PG_URL" \
  | age --recipient "$CHAVE_PUBLICA" --output "$parcial"

if [ ! -s "$parcial" ]; then
  echo "dump-cifrado: arquivo cifrado vazio" >&2
  exit 1
fi

mv "$parcial" "$SAIDA"
trap - EXIT
echo "dump-cifrado: $(basename "$SAIDA") gravado"
