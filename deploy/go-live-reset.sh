#!/usr/bin/env bash
# ==============================================================================
# NESPHAR Go-Live Clean Reset Script (Ubuntu Docker hoặc Bare-metal PM2)
# Sao lưu an toàn CSDL hiện tại rồi xóa toàn bộ đơn hàng & khách hàng mẫu Demo,
# giữ nguyên tài khoản Admin, cấu hình công ty, danh mục & chính sách Zalo.
# Chạy trước giờ G bàn giao:
#   sudo bash deploy/go-live-reset.sh
# ==============================================================================
set -euo pipefail

echo "================================================================"
echo "  CHUẨN BỊ DỌN DỮ LIỆU MẪU DEMO ĐỂ CHẠY THƯƠNG MẠI (GO-LIVE)"
echo "================================================================"

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nesphar-pharma-core$'; then
  # Chạy bản sao lưu trước rồi chạy script reset bên trong container
  bash "$(dirname "${BASH_SOURCE[0]}")/backup-sqlite.sh"
  docker exec nesphar-pharma-core node --no-warnings -e '
    const { DatabaseSync } = require("node:sqlite");
    const db = new DatabaseSync("/app/backend/data/nesphar.sqlite");
    db.exec("BEGIN; DELETE FROM order_items; DELETE FROM orders; DELETE FROM support_tickets; DELETE FROM customer_addresses; DELETE FROM customers; DELETE FROM notifications; DELETE FROM inventory_movements; DELETE FROM audit_logs; UPDATE products SET sold_count = 0; UPDATE vouchers SET used_count = 0; COMMIT; PRAGMA wal_checkpoint(TRUNCATE);");
    db.close();
    console.log("[OK] Đã làm sạch dữ liệu mẫu trong Docker container nesphar-pharma-core!");
  '
else
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  (cd "${APP_DIR}/backend" && npm run reset:golive -- --confirm-golive)
fi
