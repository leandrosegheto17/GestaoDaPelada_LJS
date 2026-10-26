#!/usr/bin/env bash
# Dump do Postgres cifrado em fluxo (nada em claro no disco).
# Entradas por variável de ambiente: PG_URL (string de conexão), CHAVE_AGE (destinatário público age, age1...) e
# SAIDA (arquivo cifrado). Não imprime a URL nem a chave.
# O cliente é o pg_dump do PostgreSQL 16 (imagem oficial fixada), a versão do banco (a impressão digital do schema
# também vem da 16). `--enable-row-security` faz o dump respeitar as policies: a role de backup tem policy de leitura
# em toda tabela com RLS `FORCE`, e sem a opção o pg_dump falha em vez de sair parcial.
set -euo pipefail

: "${PG_URL:?PG_URL ausente}"
: "${CHAVE_AGE:?CHAVE_AGE ausente}"
: "${SAIDA:?SAIDA ausente}"

case "$CHAVE_AGE" in
  age1*) ;;
  *)
    echo 'CHAVE_AGE deve ser o destinatário público age (age1...).' >&2
    exit 1
    ;;
esac

# O stderr do pg_dump traz host e IP do servidor e o log do Actions é público: vai para um arquivo temporário
# descartável e nunca é repassado; na falha só sai mensagem fixa.
erro="$(mktemp)"
# Escreve num arquivo parcial; só um dump completo e cifrado vira o artefato (nunca um parcial).
parcial="${SAIDA}.parcial"
trap 'rm -f "$erro" "$parcial"' EXIT
rm -f "$SAIDA" "$parcial"

# Imagem por digest (índice multi-arch de postgres:16, consultado em 2026-10-25 com `docker buildx imagetools inspect`):
# uma tag trocada no registro receberia a URL do banco (SEC-004). O digest fica literal na linha do `docker run`, onde
# o checar-acoes-fixadas.mjs o confere. Para atualizar, consulte de novo e troque o digest.
if ! docker run --rm -e PG_URL postgres:16@sha256:9e2cf6287f25c3151f4c9421ccce2b17f3e60061c111a29165e0d2cdd9ff0a97 \
  sh -c 'pg_dump --format=custom --no-owner --no-privileges --enable-row-security "$PG_URL"' 2>"$erro" |
  age -r "$CHAVE_AGE" -o "$parcial"; then
  echo 'Falha ao gerar o dump.' >&2
  exit 1
fi

[ -s "$parcial" ] || {
  echo 'Dump cifrado vazio.' >&2
  exit 1
}
mv "$parcial" "$SAIDA"
echo "Dump cifrado: $(wc -c <"$SAIDA") bytes, sha256 $(sha256sum "$SAIDA" | cut -d' ' -f1)"
