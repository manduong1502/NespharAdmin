#!/bin/bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

echo "=== 0. PRE-DEPLOY SNAPSHOT (SQLITE WAL + UPLOADS) ==="
if sudo docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nesphar-pharma-core$'; then
  sudo bash "$APP_DIR/deploy/backup-sqlite.sh"
else
  echo "[INFO] Lần triển khai đầu tiên (container chưa chạy) -> bỏ qua snapshot trước deploy."
fi

echo "=== 1. ENSURING .env PRODUCTION CONFIG ==="
if [ ! -f "$APP_DIR/.env" ]; then
  RAND_SECRET="$(openssl rand -hex 32)"
  cat > "$APP_DIR/.env" <<EOF
PORT=4005
HOST_BIND_IP=127.0.0.1
JWT_SECRET=${RAND_SECRET}
ZALO_APP_SECRET=
ALLOW_SIMULATOR_PHONE_FALLBACK=true
ALLOW_DEMO_TIER_SWITCH=false
PAYMENT_WEBHOOK_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
OUTBOUND_WEBHOOK_URL=
CORS_ORIGINS=https://nesphar.bonix.site
EOF
  chmod 600 "$APP_DIR/.env"
  echo "[OK] Đã tạo mới .env (PORT=4005, JWT_SECRET 256-bit ngẫu nhiên)."
fi

HOST_PORT="$(grep -E '^PORT=' "$APP_DIR/.env" | tail -n1 | cut -d= -f2 | tr -d '[:space:]' || true)"
HOST_PORT="${HOST_PORT:-4005}"

if [ -d "$APP_DIR/.git" ]; then
  echo "=== 2. PULLING LATEST CODE FROM GITHUB ==="
  sudo git fetch origin main && sudo git reset --hard origin/main
fi

echo "=== 3. BUILDING & STARTING NESPHAR CORE (ADMIN + API + SQLITE) ==="
sudo docker compose up -d --build --remove-orphans

echo "=== 4. HEALTH CHECK (http://127.0.0.1:${HOST_PORT}/api/v1/health) ==="
for i in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${HOST_PORT}/api/v1/health" > /dev/null; then
    echo "NESPHAR Core healthy on port ${HOST_PORT}!"
    break
  fi
  if [ "$i" -eq 20 ]; then
    echo "CẢNH BÁO: NESPHAR chưa phản hồi sau 60 giây. Kiểm tra: sudo docker logs --tail 80 nesphar-pharma-core" >&2
    exit 1
  fi
  sleep 3
done

echo "=== 5. CLEANING UP UNUSED DOCKER IMAGES ==="
sudo docker image prune -f

echo "=== DEPLOYMENT COMPLETED SUCCESSFULLY ==="
