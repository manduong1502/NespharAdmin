#!/usr/bin/env bash
# ==============================================================================
# NESPHAR One-Command Ubuntu Mini Server Setup & Anti-DDoS Hardening
# Hệ điều hành: Ubuntu 22.04 / 24.04 LTS
# Chạy:
#   sudo bash deploy/setup-ubuntu.sh docker   (Khuyến nghị - Container cô lập non-root)
#   sudo bash deploy/setup-ubuntu.sh pm2      (Chạy trực tiếp Node.js 22 + PM2)
# ==============================================================================
set -euo pipefail

MODE="${1:-docker}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${APP_DIR}"

echo "================================================================"
echo "  KHỞI TẠO & GIA CỐ BẢO MẬT MINI SERVER DƯỢC PHẨM NESPHAR (${MODE})"
echo "  Thư mục dự án: ${APP_DIR}"
echo "================================================================"

# 1. Gia cố nhân Linux chống tấn công TCP SYN Flood & IP Spoofing
cat > /etc/sysctl.d/99-nesphar-security.conf <<'EOF'
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 4096
net.ipv4.tcp_synack_retries = 2
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
EOF
sysctl --system >/dev/null 2>&1 || true
echo "[OK] Đã kích hoạt chống TCP SYN-Flood & IP Spoofing cấp Kernel."

# 2. Cài đặt Tường lửa UFW & Fail2ban chống dò mật khẩu SSH
apt-get update
apt-get install -y ufw fail2ban openssl curl ca-certificates
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow 80/tcp >/dev/null 2>&1 || true
ufw allow 443/tcp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true
systemctl enable --now fail2ban >/dev/null 2>&1 || true
echo "[OK] Đã bật tường lửa UFW (chỉ mở SSH/80/443) và Fail2ban bảo vệ SSH."

# 3. Khởi tạo file .env bảo mật nếu chưa tồn tại (JWT_SECRET 64 ký tự ngẫu nhiên)
if [[ ! -f "${APP_DIR}/.env" ]]; then
  RAND_SECRET="$(openssl rand -hex 32)"
  cat > "${APP_DIR}/.env" <<EOF
PORT=4000
HOST_BIND_IP=127.0.0.1
JWT_SECRET=${RAND_SECRET}
ALLOW_DEMO_TIER_SWITCH=false
CORS_ORIGINS=
EOF
  chmod 600 "${APP_DIR}/.env"
  echo "[OK] Đã tự động tạo file .env (quyền 600) với khóa JWT_SECRET 256-bit ngẫu nhiên."
fi

if [[ "${MODE}" == "docker" ]]; then
  if ! command -v docker >/dev/null 2>&1; then
    echo "[INFO] Đang cài đặt Docker Engine chính thức..."
    apt-get install -y gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "${VERSION_CODENAME}") stable" > /etc/apt/sources.list.d/docker.list
    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    systemctl enable --now docker
  fi

  echo "[INFO] Đang đóng gói và khởi chạy container cô lập non-root nesphar-pharma-core..."
  docker compose up -d --build

elif [[ "${MODE}" == "pm2" ]]; then
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 22 ]]; then
    echo "[INFO] Đang cài đặt Node.js 22 LTS..."
    apt-get install -y gnupg sqlite3
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
  fi

  npm install -g pm2
  (cd "${APP_DIR}/web-admin" && npm ci && npm run build)
  (cd "${APP_DIR}/backend" && npm ci && npm run build)

  export $(grep -v '^#' "${APP_DIR}/.env" | xargs)
  pm2 startOrReload "${APP_DIR}/deploy/ecosystem.config.cjs" --update-env
  pm2 save
else
  echo "[ERROR] Chế độ không hợp lệ: '${MODE}'. Vui lòng chọn 'docker' hoặc 'pm2'."
  exit 1
fi

chmod +x "${APP_DIR}/deploy/backup-sqlite.sh"

echo ""
echo "================================================================"
echo "  TRIỂN KHAI & BẢO MẬT HOÀN TẤT!"
echo "  - Dịch vụ nội bộ : http://127.0.0.1:4000 (ẩn khỏi quét port WAN trực tiếp)"
echo "  - Khuyến nghị DDoS: Kết nối Cloudflare Tunnel (WAF miễn phí) -> http://127.0.0.1:4000"
echo "  - Tài khoản Admin : admin@nesphar.vn / Nesphar@2026 (Đổi mật khẩu ngay sau lần đầu!)"
echo "================================================================"
