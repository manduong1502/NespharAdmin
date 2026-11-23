#!/usr/bin/env node
/**
 * NESPHAR Go-Live Production Reset Tool
 * Usage:
 *   cd backend && npm run reset:golive -- --confirm-golive
 *   cd backend && npm run reset:golive -- --confirm-golive --clear-demo-batches
 *
 * Safely backs up the current SQLite file first, then removes all sample/demo
 * orders, customers, consultation tickets, notifications, stock movements, and
 * audit logs while preserving NESPHAR's 6 categories, 7 mandatory Zalo legal
 * policy pages, system settings, and staff accounts.
 */

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const args = process.argv.slice(2);
if (!args.includes("--confirm-golive")) {
  console.error(
    "LỖI AN TOÀN: Để tránh xóa nhầm dữ liệu, vui lòng truyền cờ xác nhận:\n  npm run reset:golive -- --confirm-golive"
  );
  process.exit(1);
}

const clearBatches = args.includes("--clear-demo-batches");
const dataDir = process.env.DATA_DIR || path.resolve(__dirname, "../data");
const dbPath = process.env.DB_PATH || path.join(dataDir, "nesphar.sqlite");

if (!fs.existsSync(dbPath)) {
  console.log("Chưa có tệp CSDL tại", dbPath, "- hệ thống đã sạch sẵn.");
  process.exit(0);
}

const ts = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(dataDir, `pre-golive-backup-${ts}.sqlite`);
fs.copyFileSync(dbPath, backupPath);
console.log("[1/3] Đã sao lưu an toàn CSDL trước khi làm sạch tại:", backupPath);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("BEGIN;");

try {
  db.exec(`
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM support_tickets;
    DELETE FROM customer_addresses;
    DELETE FROM customers;
    DELETE FROM notifications;
    DELETE FROM inventory_movements;
    DELETE FROM audit_logs;
    UPDATE products SET sold_count = 0;
    UPDATE vouchers SET used_count = 0;
  `);

  if (clearBatches) {
    db.exec(`DELETE FROM inventory_batches;`);
  }

  const nowLocal = new Date().toISOString().replace("T", " ").slice(0, 19);
  db.prepare(`
    INSERT INTO audit_logs (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, diff_json, ip_address, created_at)
    VALUES (?, 'system', 'Hệ thống Go-Live NESPHAR', 'SYSTEM', 'GOLIVE_PRODUCTION_RESET', 'system', 'golive', ?, '{}', '127.0.0.1', ?)
  `).run(
    `aud-golive-${Date.now()}`,
    `Đã làm sạch toàn bộ đơn hàng & khách hàng mẫu để bắt đầu vận hành thương mại chính thức${
      clearBatches ? " (đã xóa lô mẫu)" : ""
    }.`,
    nowLocal
  );

  db.exec("COMMIT;");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
  db.close();
  console.log("[2/3] Đã xóa sạch đơn hàng ảo, khách hàng mẫu, phiếu tư vấn mẫu và đặt lại bộ đếm = 0.");
  console.log("[3/3] Giữ nguyên tài khoản Nhân sự, Danh mục, Chính sách Pháp lý Zalo & Cấu hình công ty. Sẵn sàng Go-Live!");
} catch (err) {
  db.exec("ROLLBACK;");
  db.close();
  console.error("Lỗi khi làm sạch dữ liệu:", err);
  process.exit(1);
}
