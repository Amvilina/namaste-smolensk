#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
ENV_FILE="$ROOT/.env.cloudflare"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет файла $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]]; then
  echo "В .env.cloudflare нет CLOUDFLARE_API_TOKEN" >&2
  exit 1
fi

if [[ -z "${MAX_BOT_TOKEN:-}" ]]; then
  echo "В .env.cloudflare нет MAX_BOT_TOKEN" >&2
  exit 1
fi

printf '%s' "$MAX_BOT_TOKEN" | npx --yes wrangler@4.36.0 secret put MAX_BOT_TOKEN
npx --yes wrangler@4.36.0 deploy
