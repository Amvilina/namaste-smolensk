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

echo "3/3 docker compose up --build"
"${SSH[@]}" "cd '$APP' && docker compose up -d --build"

echo "готово: http://212.119.42.209"
