#!/bin/bash
# С ноутбука: git pull на сервере и пересборка контейнеров.
#   ./deploy/push.sh
set -euo pipefail

HOST="root@212.119.42.209"
APP="/root/namaste-smolensk"
SSH=(ssh -o ServerAliveInterval=10 -o ServerAliveCountMax=180 "$HOST")

echo "1/3 nginx: освобождаю порт 80"
"${SSH[@]}" "systemctl disable --now nginx || true"

echo "2/3 git pull в $APP"
"${SSH[@]}" "cd '$APP' && git status -sb && git pull"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env.cloudflare" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.cloudflare"
  set +a
fi
ENV_TMP="$(mktemp)"
add_env() {
  local key="$1"
  local value="${!key:-}"
  if [[ -n "$value" ]]; then
    printf '%s=%s\n' "$key" "$value" >> "$ENV_TMP"
  fi
}
add_env MAX_BOT_TOKEN
add_env MAX_WEBHOOK_SECRET
add_env SES_MAX_BOT_TOKEN
add_env SES_MAX_WEBHOOK_SECRET
add_env SES_MAX_ADMINS
add_env PORTFOLIO_MAX_BOT_TOKEN
add_env PORTFOLIO_MAX_WEBHOOK_SECRET
add_env PORTFOLIO_MAX_ADMINS
if [[ -s "$ENV_TMP" ]]; then
  "${SSH[@]}" "umask 077; cat > '$APP/.env'" < "$ENV_TMP"
fi
rm -f "$ENV_TMP"
if [[ -z "${MAX_BOT_TOKEN:-}" || -z "${MAX_WEBHOOK_SECRET:-}" ]]; then
  echo "В .env.cloudflare нет MAX_BOT_TOKEN или MAX_WEBHOOK_SECRET — заказ на сервере не отправится" >&2
fi

echo "3/3 docker compose up --build"
"${SSH[@]}" "cd '$APP' && docker compose up -d --build"

echo "готово: https://namaste-smolensk.ru"
