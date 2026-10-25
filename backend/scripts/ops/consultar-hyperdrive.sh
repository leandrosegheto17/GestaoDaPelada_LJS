#!/usr/bin/env bash
# Lê a config do Hyperdrive na API da Cloudflare e a imprime em stdout.
# Uso: consultar-hyperdrive.sh <id-da-config>
# Entrada: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; CLOUDFLARE_API_BASE (obrigatória,
# https com o host da API da Cloudflare, mais um caminho opcional).
set -euo pipefail

if [[ ! "${CLOUDFLARE_API_TOKEN:-}" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "CLOUDFLARE_API_TOKEN ausente ou com caracteres fora de [A-Za-z0-9_-]." >&2
  exit 1
fi

if [[ -z "${CLOUDFLARE_API_BASE:-}" ]]; then
  echo "CLOUDFLARE_API_BASE ausente." >&2
  exit 1
fi
base="$CLOUDFLARE_API_BASE"

# A base recebe o token Bearer: só https e o host exato da Cloudflare (sem user@,
# porta, sufixo, maiúsculas, espaço ou quebra de linha). O valor não é ecoado.
esquema="https"
host_cf="api.cloudflare.com"
host_re="${host_cf//./\\.}"
if [[ ! "$base" =~ ^${esquema}://${host_re}(/[A-Za-z0-9._~/-]*)?$ ]]; then
  echo "CLOUDFLARE_API_BASE inválida: exige ${esquema} e o host ${host_cf}." >&2
  exit 1
fi

# O token vai por stdin do curl (fora de argv); a validação acima impede que
# aspas, barra invertida ou quebra de linha injetem diretivas na config.
printf 'header = "Authorization: Bearer %s"\n' "$CLOUDFLARE_API_TOKEN" |
  curl --fail-with-body -sS --config - \
    "${base}/accounts/${CLOUDFLARE_ACCOUNT_ID}/hyperdrive/configs/${1}"
