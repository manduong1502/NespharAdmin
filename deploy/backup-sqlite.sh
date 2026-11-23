#!/usr/bin/env bash
# ==============================================================================
# NESPHAR SQLite Online Hot-Backup Script (An toàn 100% khi đang chạy WAL)
# Mặc định lưu 14 ngày tại /mnt/ssd500/tiko/backups/nesphar (giống ChatTikovia)
# Cron 02:30 sáng mỗi ngày:
#   30 2 * * * /bin/bash /mnt/ssd500/tiko/nesphar/deploy/backup-sqlite.sh >> /var/log/nesphar-backup.log 2>&1
# ==============================================================================
set -euo pipefail

if [[ -n "${BACKUP_ROOT:-}" ]]; then
  TARGET_BACKUP_ROOT="${BACKUP_ROOT}"
elif [[ -d "/mnt/ssd500/tiko" ]]; then
  TARGET_BACKUP_ROOT="/mnt/ssd500/tiko/backups/nesphar"
else
  TARGET_BACKUP_ROOT="/opt/nesphar-backups"
fi

RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "${TARGET_BACKUP_ROOT}/db" "${TARGET_BACKUP_ROOT}/uploads"

echo "[$(date -Iseconds)] Bắt đầu sao lưu dữ liệu Dược phẩm NESPHAR..."

if docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^nesphar-pharma-core$'; then
  docker exec nesphar-pharma-core sqlite3 /app/backend/data/nesphar.sqlite ".backup '/tmp/nesphar_${TIMESTAMP}.sqlite'"
  docker cp "nesphar-pharma-core:/tmp/nesphar_${TIMESTAMP}.sqlite" "${TARGET_BACKUP_ROOT}/db/nesphar_${TIMESTAMP}.sqlite"
  docker exec nesphar-pharma-core rm -f "/tmp/nesphar_${TIMESTAMP}.sqlite"
  gzip -f "${TARGET_BACKUP_ROOT}/db/nesphar_${TIMESTAMP}.sqlite"

  docker exec nesphar-pharma-core tar -czf - -C /app/backend uploads > "${TARGET_BACKUP_ROOT}/uploads/uploads_${TIMESTAMP}.tar.gz"
else
  APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  DB_FILE="${APP_DIR}/backend/data/nesphar.sqlite"
  if [[ -f "${DB_FILE}" ]]; then
    sqlite3 "${DB_FILE}" ".backup '${TARGET_BACKUP_ROOT}/db/nesphar_${TIMESTAMP}.sqlite'"
    gzip -f "${TARGET_BACKUP_ROOT}/db/nesphar_${TIMESTAMP}.sqlite"
  fi
  if [[ -d "${APP_DIR}/backend/uploads" ]]; then
    tar -czf "${TARGET_BACKUP_ROOT}/uploads/uploads_${TIMESTAMP}.tar.gz" -C "${APP_DIR}/backend" uploads
  fi
fi

find "${TARGET_BACKUP_ROOT}/db" -type f -name "nesphar_*.sqlite.gz" -mtime +"${RETENTION_DAYS}" -delete
find "${TARGET_BACKUP_ROOT}/uploads" -type f -name "uploads_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "[$(date -Iseconds)] Hoàn tất sao lưu tại ${TARGET_BACKUP_ROOT}!"
