import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = process.env.DATA_DIR || path.resolve(__dirname, "../../data");
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.resolve(__dirname, "../../uploads");
for (const sub of ["media", "docs"]) {
  const dir = path.join(UPLOADS_DIR, sub);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const DB_FILE = process.env.DB_PATH || path.join(DATA_DIR, "nesphar.sqlite");

export const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SALES', 'WAREHOUSE')),
      phone TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'locked')),
      permissions_json TEXT NOT NULL DEFAULT '[]',
      last_login_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT NOT NULL,
      icon_key TEXT NOT NULL DEFAULT 'supplement',
      description TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      sku TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id),
      brand TEXT NOT NULL DEFAULT '',
      manufacturer TEXT NOT NULL DEFAULT '',
      supplier TEXT NOT NULL DEFAULT '',
      origin TEXT NOT NULL DEFAULT '',
      registration_no TEXT NOT NULL DEFAULT '',
      declaration_doc_url TEXT NOT NULL DEFAULT '',
      declaration_doc_name TEXT NOT NULL DEFAULT '',
      base_unit TEXT NOT NULL DEFAULT 'Hộp',
      specification TEXT NOT NULL DEFAULT '',
      cost_price INTEGER NOT NULL DEFAULT 0,
      retail_price INTEGER NOT NULL DEFAULT 0,
      original_price INTEGER NOT NULL DEFAULT 0,
      min_stock_alert INTEGER NOT NULL DEFAULT 20,
      image_url TEXT NOT NULL DEFAULT '',
      gallery_json TEXT NOT NULL DEFAULT '[]',
      unit_options_json TEXT NOT NULL DEFAULT '[]',
      allowed_tiers_json TEXT NOT NULL DEFAULT '["retail","clinic","pharmacy","distributor"]',
      channels_json TEXT NOT NULL DEFAULT '["zalo_mini_app","wholesale_portal"]',
      tags_json TEXT NOT NULL DEFAULT '[]',
      is_prescription INTEGER NOT NULL DEFAULT 0,
      promo_badge TEXT NOT NULL DEFAULT '',
      volume_tiers_json TEXT NOT NULL DEFAULT '[]',
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_new INTEGER NOT NULL DEFAULT 0,
      is_best_seller INTEGER NOT NULL DEFAULT 0,
      is_flash_promo INTEGER NOT NULL DEFAULT 0,
      has_video_preview INTEGER NOT NULL DEFAULT 0,
      sold_count INTEGER NOT NULL DEFAULT 0,
      short_summary TEXT NOT NULL DEFAULT '',
      ingredients TEXT NOT NULL DEFAULT '',
      benefits_json TEXT NOT NULL DEFAULT '[]',
      dosage TEXT NOT NULL DEFAULT '',
      target_users TEXT NOT NULL DEFAULT '',
      storage_note TEXT NOT NULL DEFAULT '',
      disclaimer TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_batches (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      batch_code TEXT NOT NULL,
      mfg_date TEXT NOT NULL,
      exp_date TEXT NOT NULL,
      cost_price INTEGER NOT NULL DEFAULT 0,
      initial_qty INTEGER NOT NULL DEFAULT 0,
      remaining_qty INTEGER NOT NULL DEFAULT 0,
      shelf_location TEXT NOT NULL DEFAULT 'Kệ A1',
      supplier_invoice TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'quarantined')),
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_batches_product_exp ON inventory_batches(product_id, exp_date);

    CREATE TABLE IF NOT EXISTS inventory_movements (
      id TEXT PRIMARY KEY,
      batch_id TEXT NOT NULL,
      batch_code TEXT NOT NULL,
      product_id TEXT NOT NULL,
      product_name TEXT NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('IMPORT', 'ORDER_EXPORT_FEFO', 'ORDER_RETURN', 'ADJUSTMENT')),
      qty_change INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reference_code TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      performed_by TEXT NOT NULL DEFAULT 'Hệ thống',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      zalo_id TEXT UNIQUE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      customer_tier TEXT NOT NULL DEFAULT 'retail' CHECK (customer_tier IN ('retail', 'clinic', 'pharmacy', 'distributor')),
      custom_discount_percent INTEGER,
      business_name TEXT NOT NULL DEFAULT '',
      tax_code TEXT NOT NULL DEFAULT '',
      gpp_license_no TEXT NOT NULL DEFAULT '',
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      assigned_staff_id TEXT,
      notes TEXT NOT NULL DEFAULT '',
      phone_linked INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_addresses (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      street TEXT NOT NULL,
      ward TEXT NOT NULL,
      district TEXT NOT NULL,
      province TEXT NOT NULL,
      tag TEXT NOT NULL DEFAULT 'Nhà riêng',
      is_default INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_tier_snapshot TEXT NOT NULL DEFAULT 'retail',
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'shipping', 'completed', 'cancelled')),
      return_status TEXT NOT NULL DEFAULT 'none' CHECK (return_status IN ('none', 'requested', 'returned')),
      return_reason TEXT NOT NULL DEFAULT '',
      subtotal INTEGER NOT NULL DEFAULT 0,
      discount_amount INTEGER NOT NULL DEFAULT 0,
      shipping_fee INTEGER NOT NULL DEFAULT 0,
      total_amount INTEGER NOT NULL DEFAULT 0,
      voucher_code TEXT,
      payment_method TEXT NOT NULL DEFAULT 'cod' CHECK (payment_method IN ('cod', 'vietqr', 'bank_transfer', 'zalopay')),
      payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'paid', 'refunded')),
      shipping_carrier TEXT NOT NULL DEFAULT 'NESPHAR Express',
      tracking_code TEXT NOT NULL DEFAULT '',
      address_json TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      handled_by_staff_id TEXT,
      source TEXT NOT NULL DEFAULT 'zalo_mini_app',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created_status ON orders(created_at DESC, status);

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      image TEXT NOT NULL,
      unit_name TEXT NOT NULL,
      specification_label TEXT NOT NULL,
      unit_multiplier REAL NOT NULL DEFAULT 1,
      unit_price INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      base_qty_deducted INTEGER NOT NULL DEFAULT 0,
      allocations_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS banners (
      id TEXT PRIMARY KEY,
      badge TEXT NOT NULL,
      title TEXT NOT NULL,
      points_json TEXT NOT NULL DEFAULT '[]',
      image_url TEXT NOT NULL,
      cta_link TEXT NOT NULL DEFAULT '/categories',
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS vouchers (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      discount_type TEXT NOT NULL CHECK (discount_type IN ('fixed', 'percent')),
      discount_value INTEGER NOT NULL,
      max_discount INTEGER,
      min_order_value INTEGER NOT NULL DEFAULT 0,
      expiry_date TEXT NOT NULL,
      usage_limit INTEGER NOT NULL DEFAULT 500,
      used_count INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS articles (
      slug TEXT PRIMARY KEY,
      article_group TEXT NOT NULL CHECK (article_group IN ('policy', 'about', 'health')),
      category_label TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      banner_tone TEXT NOT NULL DEFAULT 'emerald',
      author_location TEXT NOT NULL DEFAULT 'Dược Phẩm NESPHAR',
      sections_json TEXT NOT NULL DEFAULT '[]',
      is_published INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('order', 'promo', 'system')),
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      target_link TEXT NOT NULL DEFAULT '/orders',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id TEXT NOT NULL,
      customer_id TEXT NOT NULL,
      read_at TEXT NOT NULL,
      PRIMARY KEY (notification_id, customer_id)
    );

    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      topic TEXT NOT NULL CHECK (topic IN ('tu-van', 'bao-gia-si', 'gop-y')),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'replied', 'resolved')),
      staff_reply TEXT NOT NULL DEFAULT '',
      replied_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      diff_json TEXT NOT NULL DEFAULT '{}',
      ip_address TEXT NOT NULL DEFAULT '127.0.0.1',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      tx_type TEXT NOT NULL CHECK (tx_type IN ('welcome', 'earn', 'redeem', 'refund', 'admin_adjust')),
      points_change INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      title TEXT NOT NULL,
      order_code TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_loyalty_customer_created
      ON loyalty_transactions(customer_id, created_at DESC);
  `);

  // Safe forward schema migration for existing SQLite databases
  const prodCols = new Set(
    (db.prepare(`PRAGMA table_info(products)`).all() as Array<{ name: string }>).map(
      (c) => c.name
    )
  );
  const migrations: Array<[string, string]> = [
    ["tags_json", "TEXT NOT NULL DEFAULT '[]'"],
    ["is_prescription", "INTEGER NOT NULL DEFAULT 0"],
    ["promo_badge", "TEXT NOT NULL DEFAULT ''"],
    ["volume_tiers_json", "TEXT NOT NULL DEFAULT '[]'"],
  ];
  for (const [colName, colDef] of migrations) {
    if (!prodCols.has(colName)) {
      db.exec(`ALTER TABLE products ADD COLUMN ${colName} ${colDef}`);
    }
  }

  const custCols = new Set(
    (db.prepare(`PRAGMA table_info(customers)`).all() as Array<{ name: string }>).map(
      (c) => c.name
    )
  );
  const custMigrations: Array<[string, string]> = [
    ["avatar_url", "TEXT NOT NULL DEFAULT ''"],
    ["zalo_logged_in", "INTEGER NOT NULL DEFAULT 0"],
    ["welcome_bonus_claimed", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [colName, colDef] of custMigrations) {
    if (!custCols.has(colName)) {
      db.exec(`ALTER TABLE customers ADD COLUMN ${colName} ${colDef}`);
    }
  }

  const orderCols = new Set(
    (db.prepare(`PRAGMA table_info(orders)`).all() as Array<{ name: string }>).map(
      (c) => c.name
    )
  );
  const orderMigrations: Array<[string, string]> = [
    ["points_redeemed", "INTEGER NOT NULL DEFAULT 0"],
    ["points_discount", "INTEGER NOT NULL DEFAULT 0"],
    ["points_earned", "INTEGER NOT NULL DEFAULT 0"],
    ["points_reverted", "INTEGER NOT NULL DEFAULT 0"],
  ];
  for (const [colName, colDef] of orderMigrations) {
    if (!orderCols.has(colName)) {
      db.exec(`ALTER TABLE orders ADD COLUMN ${colName} ${colDef}`);
    }
  }
}

export type LoyaltyTxType = "welcome" | "earn" | "redeem" | "refund" | "admin_adjust";

export function recordLoyaltyTransaction(params: {
  customerId: string;
  txType: LoyaltyTxType;
  pointsChange: number;
  title: string;
  orderCode?: string;
  createdAt?: string;
}): number {
  const row = db
    .prepare(`SELECT loyalty_points FROM customers WHERE id = ?`)
    .get(params.customerId) as { loyalty_points: number } | undefined;
  const current = Number(row?.loyalty_points || 0);
  const nextBalance = Math.max(0, current + Math.trunc(params.pointsChange));
  const actualDelta = nextBalance - current;
  const ts = params.createdAt || nowIsoLocal();

  db.prepare(
    `UPDATE customers SET loyalty_points = ?, updated_at = ? WHERE id = ?`
  ).run(nextBalance, ts, params.customerId);

  if (actualDelta !== 0 || params.pointsChange !== 0) {
    const id = `ltx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    db.prepare(
      `INSERT INTO loyalty_transactions
        (id, customer_id, tx_type, points_change, balance_after, title, order_code, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.customerId,
      params.txType,
      actualDelta,
      nextBalance,
      params.title,
      params.orderCode || "",
      ts
    );
  }

  return nextBalance;
}

export function revertOrderLoyaltyIfNeeded(orderId: string): number | null {
  const order = db
    .prepare(
      `SELECT id, code, customer_id, points_redeemed, points_earned, points_reverted
       FROM orders WHERE id = ?`
    )
    .get(orderId) as Record<string, unknown> | undefined;

  if (!order || Number(order.points_reverted || 0) === 1) {
    return null;
  }

  const customerId = String(order.customer_id);
  const orderCode = String(order.code);
  const redeemed = Math.max(0, Number(order.points_redeemed || 0));
  const earned = Math.max(0, Number(order.points_earned || 0));
  let latestBalance: number | null = null;

  if (redeemed > 0) {
    latestBalance = recordLoyaltyTransaction({
      customerId,
      txType: "refund",
      pointsChange: redeemed,
      title: `Hoàn lại điểm đã dùng của đơn hủy #${orderCode}`,
      orderCode,
    });
  }

  if (earned > 0) {
    latestBalance = recordLoyaltyTransaction({
      customerId,
      txType: "refund",
      pointsChange: -earned,
      title: `Thu hồi điểm tích lũy của đơn hủy #${orderCode}`,
      orderCode,
    });
  }

  db.prepare(`UPDATE orders SET points_reverted = 1 WHERE id = ?`).run(orderId);
  return latestBalance;
}

export function nowIsoLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function todayDateOnly(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function logAudit(params: {
  actorId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  diff?: unknown;
  ipAddress?: string;
}): void {
  const id = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  db.prepare(
    `INSERT INTO audit_logs
      (id, actor_id, actor_name, actor_role, action, entity_type, entity_id, summary, diff_json, ip_address, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.actorId,
    params.actorName,
    params.actorRole,
    params.action,
    params.entityType,
    params.entityId,
    params.summary,
    JSON.stringify(params.diff ?? {}),
    params.ipAddress || "127.0.0.1",
    nowIsoLocal()
  );
}
