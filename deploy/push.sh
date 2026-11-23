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
if [[ -n "${MAX_BOT_TOKEN:-}" && -n "${MAX_WEBHOOK_SECRET:-}" ]]; then
  {
    printf 'MAX_BOT_TOKEN=%s\n' "$MAX_BOT_TOKEN"
    printf 'MAX_WEBHOOK_SECRET=%s\n' "$MAX_WEBHOOK_SECRET"
  } | "${SSH[@]}" "umask 077; cat > '$APP/.env'"
else
  echo "В .env.cloudflare нет MAX_BOT_TOKEN или MAX_WEBHOOK_SECRET — заказ на сервере не отправится" >&2
fi

echo "3/3 docker compose up --build"
"${SSH[@]}" "cd '$APP' && docker compose up -d --build"

echo "готово: https://namaste-smolensk.ru"
