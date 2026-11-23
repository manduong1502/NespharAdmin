import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import {
  db,
  logAudit,
  nowIsoLocal,
  recordLoyaltyTransaction,
  revertOrderLoyaltyIfNeeded,
  todayDateOnly,
  UPLOADS_DIR,
} from "../db/database";
import {
  AuthenticatedRequest,
  PermissionKey,
  requireAuth,
  requirePermission,
  ROLE_DEFAULT_PERMISSIONS,
} from "../middleware/auth";
import {
  getClientIp,
  loginFailureStore,
  verifyFileMagicBytes,
} from "../middleware/securityShield";
import {
  allocateBatchesFEFO,
  BatchAllocation,
  daysUntilDate,
  getNearExpiryThresholdDays,
  getProductStockSummary,
  restoreBatchesFromOrder,
} from "../services/inventoryService";
import {
  dispatchOperationalAlert,
  getAlertConfig,
  getPaymentConfig,
  sendTestTelegramMessage,
} from "../services/alertService";
import { reconcileBankTransfer } from "./webhookRoutes";
import { hashPassword, signJwt, verifyPassword } from "../utils/security";
import {
  importProductsFromXlsxBuffer,
  VolumePriceTier,
} from "../services/xlsxImportService";

export const adminRouter = Router();

const ALLOWED_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const ALLOWED_DOC_EXTS = new Set([".pdf"]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isDoc =
      file.mimetype === "application/pdf" ||
      String(req.query.folder || "") === "docs" ||
      file.originalname.toLowerCase().endsWith(".pdf");
    const dest = path.join(UPLOADS_DIR, isDoc ? "docs" : "media");
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .slice(0, 40);
    cb(null, `${Date.now()}-${base || "nesphar"}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || "").toLowerCase();
    const folder = String(req.query.folder || "media");
    if (folder === "docs") {
      if (!ALLOWED_DOC_EXTS.has(ext) && !ALLOWED_IMAGE_EXTS.has(ext)) {
        cb(new Error("Hồ sơ công bố chỉ chấp nhận tệp .PDF hoặc ảnh scan (.JPG, .PNG, .WEBP)."));
        return;
      }
    } else if (!ALLOWED_IMAGE_EXTS.has(ext)) {
      cb(new Error("Hình ảnh chỉ chấp nhận định dạng .JPG, .JPEG, .PNG hoặc .WEBP."));
      return;
    }
    cb(null, true);
  },
});

function safeJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function csvEscape(val: unknown): string {
  let s = val === null || val === undefined ? "" : String(val);
  // Neutralize Excel CSV Formula / DDE Injection (=, +, -, @, tab, CR) except plain negative numbers
  if (/^[=+\-@\t\r]/.test(s) && !/^-\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`;
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const LOGIN_WINDOW_MS = 15 * 60_000;
const MAX_LOGIN_FAILURES = 8;

// ==========================================
// AUTHENTICATION (with Brute-Force Shield)
// ==========================================
adminRouter.post("/auth/login", (req, res) => {
  const { email = "", password = "" } = req.body || {};
  const cleanEmail = String(email).trim().toLowerCase().slice(0, 120);
  const ip = getClientIp(req);
  const lockKey = `login:${ip}:${cleanEmail}`;

  const priorFailures = loginFailureStore.get(lockKey);
  if (priorFailures && priorFailures.count >= MAX_LOGIN_FAILURES) {
    const retrySec = Math.max(1, Math.ceil((priorFailures.resetAt - Date.now()) / 1000));
    res.setHeader("Retry-After", String(retrySec));
    res.status(429).json({
      error: `Tài khoản tạm khóa đăng nhập từ IP này do sai mật khẩu quá ${MAX_LOGIN_FAILURES} lần. Vui lòng thử lại sau ${Math.ceil(
        retrySec / 60
      )} phút.`,
      retryAfterSeconds: retrySec,
    });
    return;
  }

  const row = db
    .prepare(`SELECT * FROM staff_users WHERE LOWER(email) = ?`)
    .get(cleanEmail) as Record<string, unknown> | undefined;

  if (!row || !verifyPassword(String(password), String(row.password_hash))) {
    const failEntry = loginFailureStore.hit(lockKey, LOGIN_WINDOW_MS);
    if (failEntry.count === MAX_LOGIN_FAILURES) {
      logAudit({
        actorId: "anonymous",
        actorName: cleanEmail || "unknown",
        actorRole: "UNAUTHENTICATED",
        action: "SECURITY_LOGIN_LOCKOUT",
        entityType: "staff_user",
        entityId: cleanEmail,
        summary: `Chặn Brute-Force đăng nhập sau ${MAX_LOGIN_FAILURES} lần sai mật khẩu liên tiếp từ IP ${ip}`,
        ipAddress: ip,
      });
    }
    res.status(401).json({ error: "Email hoặc mật khẩu không chính xác." });
    return;
  }

  // Valid credentials -> reset brute-force counter
  loginFailureStore.reset(lockKey);
  if (String(row.status) !== "active") {
    res.status(403).json({ error: "Tài khoản nhân sự này hiện đang tạm khóa." });
    return;
  }

  const role = String(row.role) as "ADMIN" | "SALES" | "WAREHOUSE";
  const permissions = safeJson<PermissionKey[]>(
    String(row.permissions_json || "[]"),
    ROLE_DEFAULT_PERMISSIONS[role]
  );

  const ts = nowIsoLocal();
  db.prepare(`UPDATE staff_users SET last_login_at = ? WHERE id = ?`).run(ts, String(row.id));

  const token = signJwt({
    sub: String(row.id),
    email: String(row.email),
    name: String(row.full_name),
    role,
  });

  logAudit({
    actorId: String(row.id),
    actorName: String(row.full_name),
    actorRole: role,
    action: "STAFF_LOGIN",
    entityType: "staff_user",
    entityId: String(row.id),
    summary: `Đăng nhập hệ thống quản trị NESPHAR (${row.email})`,
    ipAddress: req.ip,
  });

  res.json({
    token,
    staff: {
      id: String(row.id),
      email: String(row.email),
      fullName: String(row.full_name),
      role,
      phone: String(row.phone || ""),
      permissions: permissions.length > 0 ? permissions : ROLE_DEFAULT_PERMISSIONS[role],
    },
  });
});

adminRouter.get("/auth/me", requireAuth, (req: AuthenticatedRequest, res) => {
  const staff = req.staff!;
  res.json({
    staff: {
      id: staff.sub,
      email: staff.email,
      fullName: staff.name,
      role: staff.role,
      permissions: staff.permissions,
    },
  });
});

// ==========================================
// FILE UPLOAD (MEDIA & BYT DECLARATION DOCS)
// ==========================================
adminRouter.post(
  "/upload",
  requireAuth,
  (req: AuthenticatedRequest, res) => {
    upload.single("file")(req, res, (err) => {
      if (err) {
        const msg =
          err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE"
            ? "Dung lượng tệp vượt quá giới hạn 15MB."
            : err instanceof Error
              ? err.message
              : "Tải tệp thất bại.";
        res.status(400).json({ error: msg });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: "Không nhận được tệp tải lên." });
        return;
      }
      const subFolder = req.file.destination.endsWith("docs") ? "docs" : "media";

      // Binary magic-byte inspection to block disguised HTML/SVG/EXE files
      try {
        const fd = fs.openSync(req.file.path, "r");
        const headBuf = Buffer.alloc(16);
        const bytesRead = fs.readSync(fd, headBuf, 0, 16, 0);
        fs.closeSync(fd);
        if (!verifyFileMagicBytes(headBuf.subarray(0, bytesRead), subFolder)) {
          fs.unlinkSync(req.file.path);
          res.status(400).json({
            error:
              "Nội dung nhị phân của tệp không khớp định dạng Ảnh/PDF thật (nghi ngờ tệp giả mạo).",
          });
          return;
        }
      } catch {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        res.status(400).json({ error: "Không thể xác thực định dạng tệp tải lên." });
        return;
      }

      const url = `/uploads/${subFolder}/${req.file.filename}`;
      res.status(201).json({
        url,
        fileName: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      });
    });
  }
);

// ==========================================
// GLOBAL QUICK SEARCH (Ctrl+K Command Palette)
// ==========================================
adminRouter.get("/search", requireAuth, (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    res.json({ results: [] });
    return;
  }
  const like = `%${q}%`;

  const orders = (
    db
      .prepare(
        `SELECT id, code, customer_name, status, total_amount
         FROM orders
         WHERE code LIKE ? OR customer_name LIKE ? OR tracking_code LIKE ?
         ORDER BY created_at DESC LIMIT 5`
      )
      .all(like, like, like) as Array<Record<string, unknown>>
  ).map((o) => ({
    kind: "order",
    id: String(o.id),
    title: `Đơn hàng #${o.code} — ${o.customer_name}`,
    subtitle: `${Number(o.total_amount).toLocaleString("vi-VN")}đ · Trạng thái: ${o.status}`,
    path: `/orders?q=${encodeURIComponent(String(o.code))}`,
  }));

  const products = (
    db
      .prepare(
        `SELECT id, sku, name, registration_no, retail_price
         FROM products
         WHERE sku LIKE ? OR name LIKE ? OR registration_no LIKE ?
         ORDER BY sku ASC LIMIT 5`
      )
      .all(like, like, like) as Array<Record<string, unknown>>
  ).map((p) => ({
    kind: "product",
    id: String(p.id),
    title: `SKU ${p.sku} — ${p.name}`,
    subtitle: `Số ĐK: ${p.registration_no} · Giá lẻ: ${Number(p.retail_price).toLocaleString("vi-VN")}đ`,
    path: `/products?q=${encodeURIComponent(String(p.sku))}`,
  }));

  const batches = (
    db
      .prepare(
        `SELECT b.id, b.batch_code, b.exp_date, b.remaining_qty, p.sku, p.name AS product_name
         FROM inventory_batches b
         JOIN products p ON p.id = b.product_id
         WHERE b.batch_code LIKE ? OR p.sku LIKE ? OR p.name LIKE ?
         ORDER BY b.exp_date ASC LIMIT 5`
      )
      .all(like, like, like) as Array<Record<string, unknown>>
  ).map((b) => ({
    kind: "batch",
    id: String(b.id),
    title: `Lô ${b.batch_code} — SKU ${b.sku}`,
    subtitle: `HSD: ${b.exp_date} · Tồn: ${b.remaining_qty} (${b.product_name})`,
    path: `/inventory?q=${encodeURIComponent(String(b.batch_code))}`,
  }));

  const customers = (
    db
      .prepare(
        `SELECT id, name, business_name, phone, customer_tier
         FROM customers
         WHERE name LIKE ? OR business_name LIKE ? OR phone LIKE ? OR gpp_license_no LIKE ?
         ORDER BY updated_at DESC LIMIT 5`
      )
      .all(like, like, like, like) as Array<Record<string, unknown>>
  ).map((c) => ({
    kind: "customer",
    id: String(c.id),
    title: String(c.business_name || c.name),
    subtitle: `SĐT: ${c.phone} · Hạng giá: ${c.customer_tier}`,
    path: `/customers?q=${encodeURIComponent(String(c.phone))}`,
  }));

  res.json({
    results: [...orders, ...products, ...batches, ...customers],
  });
});

// ==========================================
// MODULE 7: DASHBOARD & BUSINESS ANALYTICS
// ==========================================
adminRouter.get(
  "/dashboard",
  requireAuth,
  requirePermission("view_dashboard"),
  (_req, res) => {
    const validOrders = db
      .prepare(`SELECT * FROM orders WHERE status != 'cancelled' AND return_status != 'returned'`)
      .all() as Array<Record<string, unknown>>;

    const allOrdersCountRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM orders`)
      .get() as { cnt: number };
    const pendingCountRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM orders WHERE status = 'pending'`)
      .get() as { cnt: number };

    const productCostMap = new Map<string, number>();
    for (const p of db
      .prepare(`SELECT id, cost_price FROM products`)
      .all() as Array<{ id: string; cost_price: number }>) {
      productCostMap.set(p.id, Number(p.cost_price));
    }

    let netRevenue = 0;
    let b2bRevenue = 0;
    let b2cRevenue = 0;
    let estimatedCost = 0;

    const itemStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);
    const prodAgg = new Map<
      string,
      { productId: string; sku: string; name: string; baseUnitsSold: number; revenue: number }
    >();

    for (const o of validOrders) {
      const total = Number(o.total_amount);
      netRevenue += total;
      const tier = String(o.customer_tier_snapshot || "retail");
      if (tier === "retail") {
        b2cRevenue += total;
      } else {
        b2bRevenue += total;
      }

      const items = itemStmt.all(String(o.id)) as Array<Record<string, unknown>>;
      for (const it of items) {
        const pid = String(it.product_id);
        const baseQty = Number(it.base_qty_deducted || it.quantity || 1);
        const unitCost = productCostMap.get(pid) || 0;
        estimatedCost += unitCost * baseQty;

        const lineRev = Number(it.unit_price) * Number(it.quantity);
        const cur = prodAgg.get(pid) || {
          productId: pid,
          sku: String(it.sku),
          name: String(it.name),
          baseUnitsSold: 0,
          revenue: 0,
        };
        cur.baseUnitsSold += baseQty;
        cur.revenue += lineRev;
        prodAgg.set(pid, cur);
      }
    }

    const estimatedGrossProfit = Math.max(0, netRevenue - estimatedCost);
    const grossMarginPct =
      netRevenue > 0 ? Math.round((estimatedGrossProfit / netRevenue) * 1000) / 10 : 0;
    const b2bSharePct =
      netRevenue > 0 ? Math.round((b2bRevenue / netRevenue) * 1000) / 10 : 0;
    const averageOrderValue =
      validOrders.length > 0 ? Math.round(netRevenue / validOrders.length) : 0;

    // 14-day daily chart series
    const dailyMap = new Map<
      string,
      { date: string; label: string; revenue: number; orderCount: number; b2bRevenue: number }
    >();
    const pad = (n: number) => String(n).padStart(2, "0");
    for (let offset = -13; offset <= 0; offset += 1) {
      const d = new Date();
      d.setDate(d.getDate() + offset);
      const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const label = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
      dailyMap.set(key, { date: key, label, revenue: 0, orderCount: 0, b2bRevenue: 0 });
    }

    for (const o of validOrders) {
      const dKey = String(o.created_at).slice(0, 10);
      const bucket = dailyMap.get(dKey);
      if (bucket) {
        const total = Number(o.total_amount);
        bucket.revenue += total;
        bucket.orderCount += 1;
        if (String(o.customer_tier_snapshot) !== "retail") {
          bucket.b2bRevenue += total;
        }
      }
    }

    const allProdsRows = db
      .prepare(
        `SELECT id, sku, name, category_id, image_url, retail_price, sold_count, is_visible, is_prescription, tags_json, min_stock_alert
         FROM products ORDER BY is_best_seller DESC, sold_count DESC, sku ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const prodMetaMap = new Map<string, Record<string, unknown>>();
    let rxProductsCount = 0;
    const catCountMap = new Map<string, number>();
    for (const pr of allProdsRows) {
      const pid = String(pr.id);
      prodMetaMap.set(pid, pr);
      const cid = String(pr.category_id || "");
      catCountMap.set(cid, (catCountMap.get(cid) || 0) + 1);
      const pTags = safeJson<string[]>(String(pr.tags_json || "[]"), []);
      if (Boolean(pr.is_prescription) || pTags.includes("nhom-thuoc-ke-don")) {
        rxProductsCount += 1;
      }
    }

    const categoryCounts = (
      db
        .prepare(`SELECT id, name, short_name FROM categories WHERE is_active = 1 ORDER BY sort_order ASC`)
        .all() as Array<Record<string, unknown>>
    ).map((c) => ({
      id: String(c.id),
      name: String(c.name),
      shortName: String(c.short_name),
      count: catCountMap.get(String(c.id)) || 0,
    }));

    const todayKey = todayDateOnly();
    const todayBucket = dailyMap.get(todayKey);
    const todayRevenue = todayBucket ? todayBucket.revenue : 0;
    const todayOrdersCount = todayBucket ? todayBucket.orderCount : 0;
    const custCountRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM customers`)
      .get() as { cnt: number };

    // Merge real order sales with catalog best-sellers so Overview always has up to 10 rich rows
    const mergedTopIds: string[] = [];
    for (const item of Array.from(prodAgg.values()).sort((a, b) => b.revenue - a.revenue)) {
      if (mergedTopIds.length < 10) mergedTopIds.push(item.productId);
    }
    for (const pr of allProdsRows) {
      if (mergedTopIds.length >= 10) break;
      const pid = String(pr.id);
      if (!mergedTopIds.includes(pid)) mergedTopIds.push(pid);
    }

    const topProducts = mergedTopIds.map((pid) => {
      const agg = prodAgg.get(pid);
      const pr = prodMetaMap.get(pid);
      const stock = getProductStockSummary(pid);
      const retailPrice = Number(pr?.retail_price || 0);
      const soldUnits = agg
        ? agg.baseUnitsSold
        : Number(pr?.sold_count || 0);
      const rev = agg ? agg.revenue : soldUnits * retailPrice;
      return {
        productId: pid,
        sku: agg?.sku || String(pr?.sku || ""),
        name: agg?.name || String(pr?.name || ""),
        imageUrl: String(pr?.image_url || ""),
        retailPrice,
        isVisible: pr ? Boolean(pr.is_visible) : true,
        minStockAlert: Number(pr?.min_stock_alert || 20),
        baseUnitsSold: soldUnits,
        revenue: rev,
        availableStock: stock.availableStock,
      };
    });

    // Action queues
    const pendingOrders = (
      db
        .prepare(
          `SELECT id, code, customer_name, customer_tier_snapshot, total_amount, payment_method, created_at
           FROM orders WHERE status = 'pending' ORDER BY created_at DESC LIMIT 6`
        )
        .all() as Array<Record<string, unknown>>
    ).map((o) => ({
      id: String(o.id),
      code: String(o.code),
      customerName: String(o.customer_name),
      tier: String(o.customer_tier_snapshot),
      totalAmount: Number(o.total_amount),
      paymentMethod: String(o.payment_method),
      createdAt: String(o.created_at),
    }));

    const thresholdDays = getNearExpiryThresholdDays();
    const rawBatches = db
      .prepare(
        `SELECT b.*, p.sku AS product_sku, p.name AS product_name, p.base_unit
         FROM inventory_batches b
         JOIN products p ON p.id = b.product_id
         WHERE b.remaining_qty > 0
         ORDER BY b.exp_date ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const expiringBatches = rawBatches
      .map((b) => ({
        id: String(b.id),
        batchCode: String(b.batch_code),
        productSku: String(b.product_sku),
        productName: String(b.product_name),
        baseUnit: String(b.base_unit),
        expDate: String(b.exp_date),
        remainingQty: Number(b.remaining_qty),
        status: String(b.status),
        daysLeft: daysUntilDate(String(b.exp_date)),
      }))
      .filter((b) => b.daysLeft <= thresholdDays);

    const lowStockProducts = (
      db.prepare(`SELECT id, sku, name, base_unit, min_stock_alert FROM products`).all() as Array<
        Record<string, unknown>
      >
    )
      .map((p) => {
        const stock = getProductStockSummary(String(p.id));
        return {
          id: String(p.id),
          sku: String(p.sku),
          name: String(p.name),
          baseUnit: String(p.base_unit),
          availableStock: stock.availableStock,
          minStockAlert: Number(p.min_stock_alert),
        };
      })
      .filter((p) => p.availableStock <= p.minStockAlert);

    const openTickets = (
      db
        .prepare(
          `SELECT id, customer_name, phone, topic, content, created_at
           FROM support_tickets WHERE status = 'open' ORDER BY created_at DESC LIMIT 5`
        )
        .all() as Array<Record<string, unknown>>
    ).map((t) => ({
      id: String(t.id),
      customerName: String(t.customer_name),
      phone: String(t.phone),
      topic: String(t.topic),
      content: String(t.content),
      createdAt: String(t.created_at),
    }));

    const recentAudits = (
      db
        .prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 6`)
        .all() as Array<Record<string, unknown>>
    ).map((a) => ({
      id: String(a.id),
      actorName: String(a.actor_name),
      actorRole: String(a.actor_role),
      action: String(a.action),
      summary: String(a.summary),
      createdAt: String(a.created_at),
    }));

    res.json({
      kpis: {
        netRevenue,
        todayRevenue,
        todayOrdersCount,
        estimatedCost,
        estimatedGrossProfit,
        grossMarginPct,
        validOrdersCount: validOrders.length,
        totalOrdersCount: allOrdersCountRow.cnt,
        pendingOrdersCount: pendingCountRow.cnt,
        b2bRevenue,
        b2cRevenue,
        b2bSharePct,
        averageOrderValue,
        nearExpiryCount: expiringBatches.length,
        lowStockCount: lowStockProducts.length,
        openTicketCount: openTickets.length,
        totalCustomersCount: custCountRow.cnt,
        totalProductsCount: allProdsRows.length,
        rxProductsCount,
      },
      categoryCounts,
      dailySeries: Array.from(dailyMap.values()),
      topProducts,
      actionItems: {
        pendingOrders,
        expiringBatches,
        lowStockProducts,
        openTickets,
      },
      recentAudits,
      nearExpiryThresholdDays: thresholdDays,
    });
  }
);

// ==========================================
// MODULE 1: PRODUCTS & PHARMA LEGAL
// ==========================================
adminRouter.get("/products", requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT p.*, c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY p.sku ASC`
    )
    .all() as Array<Record<string, unknown>>;

  const products = rows.map((p) => {
    const stock = getProductStockSummary(String(p.id));
    return {
      id: String(p.id),
      sku: String(p.sku),
      name: String(p.name),
      categoryId: String(p.category_id),
      categoryName: String(p.category_name || ""),
      tags: safeJson<string[]>(String(p.tags_json || "[]"), []),
      isPrescription: Boolean(p.is_prescription),
      promoBadge: String(p.promo_badge || ""),
      volumeTiers: safeJson<VolumePriceTier[]>(String(p.volume_tiers_json || "[]"), []),
      brand: String(p.brand),
      manufacturer: String(p.manufacturer),
      supplier: String(p.supplier),
      origin: String(p.origin),
      registrationNo: String(p.registration_no),
      declarationDocUrl: String(p.declaration_doc_url || ""),
      declarationDocName: String(p.declaration_doc_name || ""),
      baseUnit: String(p.base_unit),
      specification: String(p.specification),
      costPrice: Number(p.cost_price),
      retailPrice: Number(p.retail_price),
      originalPrice: Number(p.original_price),
      minStockAlert: Number(p.min_stock_alert),
      imageUrl: String(p.image_url),
      gallery: safeJson<string[]>(String(p.gallery_json || "[]"), []),
      unitOptions: safeJson(String(p.unit_options_json || "[]"), []),
      allowedTiers: safeJson<string[]>(
        String(p.allowed_tiers_json || '["retail","clinic","pharmacy","distributor"]'),
        ["retail", "clinic", "pharmacy", "distributor"]
      ),
      isVisible: Boolean(p.is_visible),
      isNew: Boolean(p.is_new),
      isBestSeller: Boolean(p.is_best_seller),
      isFlashPromo: Boolean(p.is_flash_promo),
      soldCount: Number(p.sold_count),
      shortSummary: String(p.short_summary),
      ingredients: String(p.ingredients),
      benefits: safeJson<string[]>(String(p.benefits_json || "[]"), []),
      dosage: String(p.dosage),
      targetUsers: String(p.target_users),
      storageNote: String(p.storage_note),
      disclaimer: String(p.disclaimer),
      updatedAt: String(p.updated_at),
      stock,
    };
  });

  res.json({ products });
});

adminRouter.post(
  "/products",
  requireAuth,
  requirePermission("edit_products"),
  (req: AuthenticatedRequest, res) => {
    const b = req.body || {};
    if (!b.sku || !b.name || !b.categoryId) {
      res.status(400).json({ error: "Vui lòng nhập Mã SKU, Tên sản phẩm và Danh mục." });
      return;
    }

    const id = `nsp-${Date.now()}`;
    const ts = nowIsoLocal();
    const unitOptions =
      Array.isArray(b.unitOptions) && b.unitOptions.length > 0
        ? b.unitOptions
        : [
            {
              id: `u-${Date.now()}`,
              unitName: String(b.baseUnit || "Hộp"),
              specificationLabel: String(b.specification || "Tiêu chuẩn"),
              multiplier: 1,
            },
          ];
    const allowedTiers =
      Array.isArray(b.allowedTiers) && b.allowedTiers.length > 0
        ? b.allowedTiers
        : ["retail", "clinic", "pharmacy", "distributor"];
    const imageUrl = String(b.imageUrl || "/uploads/media/prod-liver.jpg");
    const gallery =
      Array.isArray(b.gallery) && b.gallery.length > 0 ? b.gallery : [imageUrl];
    const tags = Array.isArray(b.tags) ? b.tags.map(String) : [];
    const isPrescription = Boolean(b.isPrescription) || tags.includes("nhom-thuoc-ke-don");
    const promoBadge = String(b.promoBadge || "").trim();
    const volumeTiers = Array.isArray(b.volumeTiers) ? b.volumeTiers : [];

    try {
      db.prepare(`
        INSERT INTO products (
          id, sku, name, category_id, brand, manufacturer, supplier, origin,
          registration_no, declaration_doc_url, declaration_doc_name, base_unit, specification,
          cost_price, retail_price, original_price, min_stock_alert, image_url, gallery_json,
          unit_options_json, allowed_tiers_json, tags_json, is_prescription, promo_badge, volume_tiers_json,
          is_visible, is_new, is_best_seller,
          is_flash_promo, short_summary, ingredients, benefits_json, dosage,
          target_users, storage_note, disclaimer, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
      `).run(
        id,
        String(b.sku).trim(),
        String(b.name).trim(),
        String(b.categoryId),
        String(b.brand || "NESPHAR Pharma"),
        String(b.manufacturer || ""),
        String(b.supplier || ""),
        String(b.origin || "Việt Nam"),
        String(b.registrationNo || ""),
        String(b.declarationDocUrl || ""),
        String(b.declarationDocName || ""),
        String(b.baseUnit || "Hộp"),
        String(b.specification || ""),
        Number(b.costPrice || 0),
        Number(b.retailPrice || 0),
        Number(b.originalPrice || b.retailPrice || 0),
        Number(b.minStockAlert ?? 20),
        imageUrl,
        JSON.stringify(gallery),
        JSON.stringify(unitOptions),
        JSON.stringify(allowedTiers),
        JSON.stringify(tags),
        isPrescription ? 1 : 0,
        promoBadge,
        JSON.stringify(volumeTiers),
        b.isVisible === false ? 0 : 1,
        b.isNew ? 1 : 0,
        b.isBestSeller ? 1 : 0,
        b.isFlashPromo ? 1 : 0,
        String(b.shortSummary || ""),
        String(b.ingredients || ""),
        JSON.stringify(Array.isArray(b.benefits) ? b.benefits : []),
        String(b.dosage || ""),
        String(b.targetUsers || ""),
        String(b.storageNote || ""),
        String(
          b.disclaimer ||
            "Thực phẩm này không phải là thuốc và không có tác dụng thay thế thuốc chữa bệnh."
        ),
        ts
      );

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action: "CREATE_PRODUCT",
        entityType: "product",
        entityId: id,
        summary: `Thêm mới sản phẩm SKU ${b.sku} – ${b.name} (Số ĐK: ${b.registrationNo || "Đang cập nhật"})`,
        diff: { sku: b.sku, retailPrice: b.retailPrice, registrationNo: b.registrationNo },
        ipAddress: req.ip,
      });

      res.status(201).json({ id });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Không thể tạo sản phẩm (kiểm tra trùng SKU).",
      });
    }
  }
);

adminRouter.put(
  "/products/:id",
  requireAuth,
  requirePermission("edit_products"),
  (req: AuthenticatedRequest, res) => {
    const prodId = String(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM products WHERE id = ?`)
      .get(prodId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy sản phẩm." });
      return;
    }

    const b = req.body || {};
    const nextRetail =
      b.retailPrice !== undefined ? Number(b.retailPrice) : Number(existing.retail_price);
    const nextCost =
      b.costPrice !== undefined ? Number(b.costPrice) : Number(existing.cost_price);

    const priceChanged =
      nextRetail !== Number(existing.retail_price) || nextCost !== Number(existing.cost_price);

    if (
      priceChanged &&
      req.staff!.role !== "ADMIN" &&
      !req.staff!.permissions.includes("change_price")
    ) {
      res.status(403).json({
        error: "Tài khoản của bạn không có quyền thay đổi Giá vốn / Giá bán niêm yết (change_price).",
      });
      return;
    }

    const ts = nowIsoLocal();
    const imageUrl = String(b.imageUrl ?? existing.image_url);
    const gallery = Array.isArray(b.gallery)
      ? b.gallery
      : safeJson<string[]>(String(existing.gallery_json || "[]"), [imageUrl]);

    db.prepare(`
      UPDATE products SET
        sku = ?,
        name = ?,
        category_id = ?,
        brand = ?,
        manufacturer = ?,
        supplier = ?,
        origin = ?,
        registration_no = ?,
        declaration_doc_url = ?,
        declaration_doc_name = ?,
        base_unit = ?,
        specification = ?,
        cost_price = ?,
        retail_price = ?,
        original_price = ?,
        min_stock_alert = ?,
        image_url = ?,
        gallery_json = ?,
        unit_options_json = ?,
        allowed_tiers_json = ?,
        tags_json = ?,
        is_prescription = ?,
        promo_badge = ?,
        volume_tiers_json = ?,
        is_visible = ?,
        is_new = ?,
        is_best_seller = ?,
        is_flash_promo = ?,
        short_summary = ?,
        ingredients = ?,
        benefits_json = ?,
        dosage = ?,
        target_users = ?,
        storage_note = ?,
        disclaimer = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      String(b.sku ?? existing.sku).trim(),
      String(b.name ?? existing.name).trim(),
      String(b.categoryId ?? existing.category_id),
      String(b.brand ?? existing.brand),
      String(b.manufacturer ?? existing.manufacturer),
      String(b.supplier ?? existing.supplier),
      String(b.origin ?? existing.origin),
      String(b.registrationNo ?? existing.registration_no),
      String(b.declarationDocUrl ?? existing.declaration_doc_url),
      String(b.declarationDocName ?? existing.declaration_doc_name),
      String(b.baseUnit ?? existing.base_unit),
      String(b.specification ?? existing.specification),
      nextCost,
      nextRetail,
      Number(b.originalPrice ?? existing.original_price),
      Number(b.minStockAlert ?? existing.min_stock_alert),
      imageUrl,
      JSON.stringify(gallery),
      b.unitOptions ? JSON.stringify(b.unitOptions) : String(existing.unit_options_json),
      b.allowedTiers ? JSON.stringify(b.allowedTiers) : String(existing.allowed_tiers_json),
      Array.isArray(b.tags) ? JSON.stringify(b.tags) : String(existing.tags_json || "[]"),
      b.isPrescription !== undefined
        ? b.isPrescription
          ? 1
          : 0
        : Array.isArray(b.tags)
          ? b.tags.includes("nhom-thuoc-ke-don")
            ? 1
            : 0
          : Number(existing.is_prescription || 0),
      b.promoBadge !== undefined ? String(b.promoBadge).trim() : String(existing.promo_badge || ""),
      Array.isArray(b.volumeTiers)
        ? JSON.stringify(b.volumeTiers)
        : String(existing.volume_tiers_json || "[]"),
      b.isVisible !== undefined ? (b.isVisible ? 1 : 0) : Number(existing.is_visible),
      b.isNew !== undefined ? (b.isNew ? 1 : 0) : Number(existing.is_new),
      b.isBestSeller !== undefined ? (b.isBestSeller ? 1 : 0) : Number(existing.is_best_seller),
      b.isFlashPromo !== undefined ? (b.isFlashPromo ? 1 : 0) : Number(existing.is_flash_promo),
      String(b.shortSummary ?? existing.short_summary),
      String(b.ingredients ?? existing.ingredients),
      b.benefits ? JSON.stringify(b.benefits) : String(existing.benefits_json),
      String(b.dosage ?? existing.dosage),
      String(b.targetUsers ?? existing.target_users),
      String(b.storageNote ?? existing.storage_note),
      String(b.disclaimer ?? existing.disclaimer),
      ts,
      prodId
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: priceChanged ? "CHANGE_PRODUCT_PRICE" : "UPDATE_PRODUCT",
      entityType: "product",
      entityId: prodId,
      summary: priceChanged
        ? `Cập nhật giá SKU ${existing.sku}: Giá bán ${Number(existing.retail_price).toLocaleString("vi-VN")}đ -> ${nextRetail.toLocaleString("vi-VN")}đ`
        : `Cập nhật thông tin & hồ sơ pháp lý SKU ${existing.sku} (${b.name ?? existing.name})`,
      diff: priceChanged
        ? {
            retailPrice: { from: Number(existing.retail_price), to: nextRetail },
            costPrice: { from: Number(existing.cost_price), to: nextCost },
          }
        : { sku: existing.sku },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

adminRouter.patch(
  "/products/:id/visibility",
  requireAuth,
  requirePermission("edit_products"),
  (req: AuthenticatedRequest, res) => {
    const prodId = String(req.params.id);
    const { isVisible } = req.body || {};
    const existing = db
      .prepare(`SELECT sku, name, is_visible FROM products WHERE id = ?`)
      .get(prodId) as { sku: string; name: string; is_visible: number } | undefined;

    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy sản phẩm." });
      return;
    }

    const nextVal = isVisible ? 1 : 0;
    db.prepare(`UPDATE products SET is_visible = ?, updated_at = ? WHERE id = ?`).run(
      nextVal,
      nowIsoLocal(),
      prodId
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "TOGGLE_PRODUCT_VISIBILITY",
      entityType: "product",
      entityId: prodId,
      summary: `${nextVal ? "Bật hiển thị" : "Tạm ẩn"} sản phẩm SKU ${existing.sku} trên Zalo Mini App`,
      diff: { isVisible: { from: Boolean(existing.is_visible), to: Boolean(nextVal) } },
      ipAddress: req.ip,
    });

    res.json({ ok: true, isVisible: Boolean(nextVal) });
  }
);

const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

adminRouter.get("/products/template-xlsx", requireAuth, (_req, res) => {
  const candidates = [
    path.resolve(__dirname, "../../assets/MAU_NHAP_SAN_PHAM_NESPHAR.xlsx"),
    path.resolve(__dirname, "../../../docs/MAU_NHAP_SAN_PHAM_NESPHAR.xlsx"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="MAU_NHAP_SAN_PHAM_NESPHAR.xlsx"'
      );
      res.send(fs.readFileSync(filePath));
      return;
    }
  }
  res.status(404).json({ error: "Không tìm thấy tệp khuôn mẫu Excel trên máy chủ." });
});

adminRouter.post(
  "/products/import-xlsx",
  requireAuth,
  requirePermission("edit_products"),
  (req: AuthenticatedRequest, res) => {
    xlsxUpload.single("file")(req, res, (err) => {
      if (err) {
        res.status(400).json({
          error: err instanceof Error ? err.message : "Tải tệp Excel thất bại (tối đa 25MB).",
        });
        return;
      }
      if (!req.file || !req.file.originalname.toLowerCase().endsWith(".xlsx")) {
        res.status(400).json({ error: "Vui lòng chọn tệp sổ tính định dạng .xlsx chuẩn." });
        return;
      }
      try {
        const result = importProductsFromXlsxBuffer(req.file.buffer, req.staff!.name);
        logAudit({
          actorId: req.staff!.sub,
          actorName: req.staff!.name,
          actorRole: req.staff!.role,
          action: "IMPORT_PRODUCTS_XLSX",
          entityType: "product",
          entityId: req.file.originalname,
          summary: `Nhập hàng loạt từ tệp Excel "${req.file.originalname}": ${result.importedProducts} sản phẩm & ${result.importedBatches} lô tồn kho GSP`,
          diff: result,
          ipAddress: req.ip,
        });
        res.json({ ok: true, ...result });
      } catch (importErr) {
        res.status(400).json({
          error:
            importErr instanceof Error
              ? importErr.message
              : "Không thể đọc dữ liệu từ tệp Excel. Vui lòng dùng đúng khuôn mẫu NESPHAR.",
        });
      }
    });
  }
);

// ==========================================
// MODULE 2: INVENTORY, BATCH/LOT & EXPIRY (FEFO)
// ==========================================
adminRouter.get("/inventory/overview", requireAuth, (_req, res) => {
  const thresholdDays = getNearExpiryThresholdDays();
  const batchRows = db
    .prepare(
      `SELECT b.*, p.sku AS product_sku, p.name AS product_name, p.base_unit, p.registration_no
       FROM inventory_batches b
       JOIN products p ON p.id = b.product_id
       ORDER BY b.exp_date ASC, b.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const batches = batchRows.map((b) => {
    const daysLeft = daysUntilDate(String(b.exp_date));
    const status = String(b.status);
    let expiryState: "quarantined" | "expired" | "near_expiry" | "healthy" = "healthy";
    if (status === "quarantined") {
      expiryState = "quarantined";
    } else if (daysLeft < 0) {
      expiryState = "expired";
    } else if (daysLeft <= thresholdDays) {
      expiryState = "near_expiry";
    }

    return {
      id: String(b.id),
      productId: String(b.product_id),
      productSku: String(b.product_sku),
      productName: String(b.product_name),
      baseUnit: String(b.base_unit),
      registrationNo: String(b.registration_no || ""),
      batchCode: String(b.batch_code),
      mfgDate: String(b.mfg_date),
      expDate: String(b.exp_date),
      daysLeft,
      expiryState,
      costPrice: Number(b.cost_price),
      initialQty: Number(b.initial_qty),
      remainingQty: Number(b.remaining_qty),
      shelfLocation: String(b.shelf_location),
      supplierInvoice: String(b.supplier_invoice),
      status,
      createdAt: String(b.created_at),
    };
  });

  const movements = (
    db
      .prepare(`SELECT * FROM inventory_movements ORDER BY created_at DESC LIMIT 100`)
      .all() as Array<Record<string, unknown>>
  ).map((m) => ({
    id: String(m.id),
    batchId: String(m.batch_id),
    batchCode: String(m.batch_code),
    productId: String(m.product_id),
    productName: String(m.product_name),
    movementType: String(m.movement_type),
    qtyChange: Number(m.qty_change),
    balanceAfter: Number(m.balance_after),
    referenceCode: String(m.reference_code),
    note: String(m.note),
    performedBy: String(m.performed_by),
    createdAt: String(m.created_at),
  }));

  const productAlerts = (
    db
      .prepare(`SELECT id, sku, name, base_unit, min_stock_alert FROM products ORDER BY sku ASC`)
      .all() as Array<Record<string, unknown>>
  )
    .map((p) => {
      const summary = getProductStockSummary(String(p.id));
      return {
        productId: String(p.id),
        sku: String(p.sku),
        name: String(p.name),
        baseUnit: String(p.base_unit),
        minStockAlert: Number(p.min_stock_alert),
        ...summary,
      };
    })
    .filter((p) => p.availableStock <= p.minStockAlert);

  res.json({
    nearExpiryThresholdDays: thresholdDays,
    today: todayDateOnly(),
    batches,
    movements,
    productAlerts,
  });
});

adminRouter.post(
  "/inventory/batches",
  requireAuth,
  requirePermission("manage_inventory"),
  (req: AuthenticatedRequest, res) => {
    const {
      productId,
      batchCode,
      mfgDate,
      expDate,
      costPrice = 0,
      initialQty = 0,
      shelfLocation = "Kệ GSP-A1",
      supplierInvoice = "",
    } = req.body || {};

    if (!productId || !batchCode || !mfgDate || !expDate || Number(initialQty) <= 0) {
      res.status(400).json({
        error: "Vui lòng nhập đầy đủ Sản phẩm, Mã lô (Batch/Lot), NSX, HSD và Số lượng nhập > 0.",
      });
      return;
    }

    const prod = db
      .prepare(`SELECT id, sku, name FROM products WHERE id = ?`)
      .get(String(productId)) as { id: string; sku: string; name: string } | undefined;

    if (!prod) {
      res.status(404).json({ error: "Không tìm thấy sản phẩm cần nhập lô." });
      return;
    }

    const batchId = `bat-${Date.now()}`;
    const qty = Math.round(Number(initialQty));
    const cost = Math.round(Number(costPrice));
    const ts = nowIsoLocal();

    db.exec("BEGIN");
    try {
      db.prepare(`
        INSERT INTO inventory_batches (
          id, product_id, batch_code, mfg_date, exp_date, cost_price,
          initial_qty, remaining_qty, shelf_location, supplier_invoice, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
      `).run(
        batchId,
        prod.id,
        String(batchCode).trim().toUpperCase(),
        String(mfgDate).slice(0, 10),
        String(expDate).slice(0, 10),
        cost,
        qty,
        qty,
        String(shelfLocation).trim(),
        String(supplierInvoice).trim(),
        ts
      );

      db.prepare(`
        INSERT INTO inventory_movements (
          id, batch_id, batch_code, product_id, product_name, movement_type,
          qty_change, balance_after, reference_code, note, performed_by, created_at
        ) VALUES (?, ?, ?, ?, ?, 'IMPORT', ?, ?, ?, ?, ?, ?)
      `).run(
        `mov-${Date.now()}`,
        batchId,
        String(batchCode).trim().toUpperCase(),
        prod.id,
        prod.name,
        qty,
        qty,
        String(supplierInvoice || batchCode).trim(),
        `Nhập kho lô mới ${String(batchCode).toUpperCase()} (HSD ${String(expDate).slice(0, 10)})`,
        req.staff!.name,
        ts
      );

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action: "IMPORT_BATCH",
        entityType: "inventory_batch",
        entityId: batchId,
        summary: `Nhập kho lô ${String(batchCode).toUpperCase()} (+${qty} đơn vị) cho SKU ${prod.sku} – HSD ${String(
          expDate
        ).slice(0, 10)}`,
        diff: { batchCode, qty, expDate, costPrice: cost },
        ipAddress: req.ip,
      });

      db.exec("COMMIT");
      res.status(201).json({ id: batchId });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(500).json({
        error: err instanceof Error ? err.message : "Không thể nhập lô hàng.",
      });
    }
  }
);

adminRouter.patch(
  "/inventory/batches/:id",
  requireAuth,
  requirePermission("manage_inventory"),
  (req: AuthenticatedRequest, res) => {
    const batchId = String(req.params.id);
    const { remainingQty, status, shelfLocation, reason = "Kiểm kê / điều chỉnh kho GSP" } =
      req.body || {};

    const existing = db
      .prepare(
        `SELECT b.*, p.name AS product_name, p.sku AS product_sku
         FROM inventory_batches b
         JOIN products p ON p.id = b.product_id
         WHERE b.id = ?`
      )
      .get(batchId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy lô hàng." });
      return;
    }

    const prevQty = Number(existing.remaining_qty);
    const nextQty =
      remainingQty !== undefined ? Math.max(0, Math.round(Number(remainingQty))) : prevQty;
    const nextStatus =
      status === "quarantined" || status === "active"
        ? status
        : String(existing.status);
    const nextShelf =
      shelfLocation !== undefined ? String(shelfLocation).trim() : String(existing.shelf_location);
    const ts = nowIsoLocal();

    db.exec("BEGIN");
    try {
      db.prepare(
        `UPDATE inventory_batches SET remaining_qty = ?, status = ?, shelf_location = ? WHERE id = ?`
      ).run(nextQty, nextStatus, nextShelf, batchId);

      if (nextQty !== prevQty) {
        const delta = nextQty - prevQty;
        db.prepare(`
          INSERT INTO inventory_movements (
            id, batch_id, batch_code, product_id, product_name, movement_type,
            qty_change, balance_after, reference_code, note, performed_by, created_at
          ) VALUES (?, ?, ?, ?, ?, 'ADJUSTMENT', ?, ?, 'KIEM-KE-GSP', ?, ?, ?)
        `).run(
          `mov-${Date.now()}`,
          batchId,
          String(existing.batch_code),
          String(existing.product_id),
          String(existing.product_name),
          delta,
          nextQty,
          `${String(reason)} (${delta > 0 ? `+${delta}` : delta})`,
          req.staff!.name,
          ts
        );
      }

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action:
          nextStatus !== String(existing.status) ? "QUARANTINE_TOGGLE_BATCH" : "ADJUST_BATCH",
        entityType: "inventory_batch",
        entityId: batchId,
        summary: `Điều chỉnh lô ${existing.batch_code} (SKU ${existing.product_sku}): tồn ${prevQty} -> ${nextQty}, trạng thái ${nextStatus}`,
        diff: {
          remainingQty: { from: prevQty, to: nextQty },
          status: { from: existing.status, to: nextStatus },
          reason,
        },
        ipAddress: req.ip,
      });

      db.exec("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(500).json({ error: "Không thể cập nhật lô hàng." });
    }
  }
);

// ==========================================
// MODULE 3: ORDERS, BULK OPS & RETURNS
// ==========================================
adminRouter.get("/orders", requireAuth, (_req, res) => {
  const orderRows = db
    .prepare(
      `SELECT o.*, s.full_name AS handled_by_name, c.phone AS customer_phone, c.business_name
       FROM orders o
       LEFT JOIN staff_users s ON s.id = o.handled_by_staff_id
       LEFT JOIN customers c ON c.id = o.customer_id
       ORDER BY o.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const itemStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);

  const orders = orderRows.map((o) => {
    const items = (itemStmt.all(String(o.id)) as Array<Record<string, unknown>>).map((it) => ({
      id: String(it.id),
      productId: String(it.product_id),
      sku: String(it.sku),
      name: String(it.name),
      image: String(it.image),
      unitName: String(it.unit_name),
      specificationLabel: String(it.specification_label),
      unitMultiplier: Number(it.unit_multiplier),
      unitPrice: Number(it.unit_price),
      quantity: Number(it.quantity),
      baseQtyDeducted: Number(it.base_qty_deducted),
      allocations: safeJson<BatchAllocation[]>(String(it.allocations_json || "[]"), []),
    }));

    return {
      id: String(o.id),
      code: String(o.code),
      customerId: String(o.customer_id),
      customerName: String(o.customer_name),
      businessName: String(o.business_name || ""),
      customerPhone: String(o.customer_phone || ""),
      customerTierSnapshot: String(o.customer_tier_snapshot),
      status: String(o.status),
      returnStatus: String(o.return_status),
      returnReason: String(o.return_reason || ""),
      subtotal: Number(o.subtotal),
      discountAmount: Number(o.discount_amount),
      shippingFee: Number(o.shipping_fee),
      totalAmount: Number(o.total_amount),
      voucherCode: o.voucher_code ? String(o.voucher_code) : null,
      paymentMethod: String(o.payment_method),
      paymentStatus: String(o.payment_status),
      shippingCarrier: String(o.shipping_carrier),
      trackingCode: String(o.tracking_code),
      address: safeJson(String(o.address_json || "{}"), {}),
      note: String(o.note || ""),
      handledByStaffId: o.handled_by_staff_id ? String(o.handled_by_staff_id) : null,
      handledByName: String(o.handled_by_name || "Chưa gán"),
      createdAt: String(o.created_at),
      updatedAt: String(o.updated_at),
      items,
    };
  });

  res.json({ orders });
});

function applySingleOrderStatusUpdate(params: {
  orderId: string;
  nextStatus?: string;
  paymentStatus?: string;
  shippingCarrier?: string;
  trackingCode?: string;
  note?: string;
  staff: { sub: string; name: string; role: string };
  ipAddress?: string;
}): void {
  const existing = db
    .prepare(`SELECT * FROM orders WHERE id = ?`)
    .get(params.orderId) as Record<string, unknown> | undefined;
  if (!existing) {
    throw new Error(`Không tìm thấy đơn hàng ${params.orderId}`);
  }

  const prevStatus = String(existing.status);
  const status = params.nextStatus || prevStatus;

  if (
    (prevStatus === "cancelled" || String(existing.return_status) === "returned") &&
    status !== "cancelled"
  ) {
    throw new Error(
      `Đơn #${existing.code} đã hủy/hoàn kho các lô FEFO nên không thể mở lại. Vui lòng tạo đơn mới để phân bổ lại lô hạn dùng.`
    );
  }

  const payStatus =
    params.paymentStatus ||
    (status === "completed" && String(existing.payment_status) === "unpaid"
      ? "paid"
      : String(existing.payment_status));
  const carrier =
    params.shippingCarrier !== undefined
      ? params.shippingCarrier
      : String(existing.shipping_carrier);
  const tracking =
    params.trackingCode !== undefined ? params.trackingCode : String(existing.tracking_code);
  const note = params.note !== undefined ? params.note : String(existing.note);
  const ts = nowIsoLocal();

  let returnStatus = String(existing.return_status);
  if (status === "cancelled" && prevStatus !== "cancelled" && returnStatus !== "returned") {
    const items = db
      .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
      .all(params.orderId) as Array<Record<string, unknown>>;
    for (const it of items) {
      const allocations = safeJson<BatchAllocation[]>(String(it.allocations_json || "[]"), []);
      restoreBatchesFromOrder({
        productId: String(it.product_id),
        productName: String(it.name),
        allocations,
        orderCode: String(existing.code),
        movementType: "ORDER_RETURN",
        notePrefix: "Hoàn tồn lô do hủy đơn",
        performedBy: params.staff.name,
      });
      const baseDeducted = Number(it.base_qty_deducted || it.quantity || 0);
      if (baseDeducted > 0) {
        db.prepare(
          `UPDATE products SET sold_count = MAX(0, sold_count - ?), updated_at = ? WHERE id = ?`
        ).run(baseDeducted, ts, String(it.product_id));
      }
    }
    returnStatus = "returned";
    revertOrderLoyaltyIfNeeded(params.orderId);
  }

  db.prepare(`
    UPDATE orders SET
      status = ?,
      return_status = ?,
      payment_status = ?,
      shipping_carrier = ?,
      tracking_code = ?,
      note = ?,
      handled_by_staff_id = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    status,
    returnStatus,
    payStatus,
    carrier,
    tracking,
    note,
    params.staff.sub,
    ts,
    params.orderId
  );

  if (status !== prevStatus) {
    const statusLabels: Record<string, string> = {
      pending: "Chờ xác nhận",
      confirmed: "Đã được Dược sĩ xác nhận",
      shipping: "Đang giao hàng",
      completed: "Đã giao thành công",
      cancelled: "Đã hủy",
    };
    db.prepare(`
      INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
      VALUES (?, ?, 'order', ?, ?, '/orders', 0, ?)
    `).run(
      `noti-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      String(existing.customer_id),
      `Đơn hàng #${existing.code}: ${statusLabels[status] || status}`,
      tracking
        ? `Đơn vị vận chuyển: ${carrier} – Mã vận đơn: ${tracking}.`
        : `Trạng thái đơn hàng của bạn vừa được cập nhật trên hệ thống NESPHAR.`,
      ts
    );
  }

  logAudit({
    actorId: params.staff.sub,
    actorName: params.staff.name,
    actorRole: params.staff.role,
    action: "UPDATE_ORDER_STATUS",
    entityType: "order",
    entityId: params.orderId,
    summary: `Cập nhật đơn #${existing.code}: ${prevStatus} -> ${status} (TT: ${payStatus})`,
    diff: {
      status: { from: prevStatus, to: status },
      paymentStatus: { from: existing.payment_status, to: payStatus },
      trackingCode: tracking,
    },
    ipAddress: params.ipAddress,
  });
}

adminRouter.patch(
  "/orders/:id/status",
  requireAuth,
  requirePermission("approve_orders"),
  (req: AuthenticatedRequest, res) => {
    const orderId = String(req.params.id);
    const { status, paymentStatus, shippingCarrier, trackingCode, note } = req.body || {};

    db.exec("BEGIN");
    try {
      applySingleOrderStatusUpdate({
        orderId,
        nextStatus: status,
        paymentStatus,
        shippingCarrier,
        trackingCode,
        note,
        staff: req.staff!,
        ipAddress: req.ip,
      });
      db.exec("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(400).json({
        error: err instanceof Error ? err.message : "Không thể cập nhật đơn hàng.",
      });
    }
  }
);

adminRouter.post(
  "/orders/bulk-status",
  requireAuth,
  requirePermission("approve_orders"),
  (req: AuthenticatedRequest, res) => {
    const { orderIds = [], status } = req.body || {};
    const allowedStatuses = ["pending", "confirmed", "shipping", "completed", "cancelled"];
    if (!Array.isArray(orderIds) || orderIds.length === 0 || !allowedStatuses.includes(status)) {
      res.status(400).json({ error: "Vui lòng chọn danh sách đơn hàng và trạng thái hợp lệ." });
      return;
    }

    db.exec("BEGIN");
    try {
      for (const oid of orderIds) {
        applySingleOrderStatusUpdate({
          orderId: String(oid),
          nextStatus: String(status),
          staff: req.staff!,
          ipAddress: req.ip,
        });
      }
      db.exec("COMMIT");
      res.json({ ok: true, updatedCount: orderIds.length });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(400).json({
        error: err instanceof Error ? err.message : "Lỗi khi cập nhật trạng thái hàng loạt.",
      });
    }
  }
);

adminRouter.post(
  "/orders/:id/return",
  requireAuth,
  requirePermission("approve_orders"),
  (req: AuthenticatedRequest, res) => {
    const orderId = String(req.params.id);
    const { reason = "Hoàn trả theo chính sách đồng kiểm 07 ngày" } = req.body || {};

    const existing = db
      .prepare(`SELECT * FROM orders WHERE id = ?`)
      .get(orderId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy đơn hàng." });
      return;
    }
    if (String(existing.return_status) === "returned") {
      res.status(400).json({ error: "Đơn hàng này đã được xử lý hoàn trả kho trước đó." });
      return;
    }

    const items = db
      .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
      .all(orderId) as Array<Record<string, unknown>>;
    const ts = nowIsoLocal();

    db.exec("BEGIN");
    try {
      for (const it of items) {
        const allocations = safeJson<BatchAllocation[]>(String(it.allocations_json || "[]"), []);
        restoreBatchesFromOrder({
          productId: String(it.product_id),
          productName: String(it.name),
          allocations,
          orderCode: String(existing.code),
          movementType: "ORDER_RETURN",
          notePrefix: "Nhập hoàn trả đơn",
          performedBy: req.staff!.name,
        });
        const baseDeducted = Number(it.base_qty_deducted || it.quantity || 0);
        if (baseDeducted > 0) {
          db.prepare(
            `UPDATE products SET sold_count = MAX(0, sold_count - ?), updated_at = ? WHERE id = ?`
          ).run(baseDeducted, ts, String(it.product_id));
        }
      }

      db.prepare(`
        UPDATE orders
        SET status = 'cancelled',
            return_status = 'returned',
            return_reason = ?,
            payment_status = 'refunded',
            handled_by_staff_id = ?,
            updated_at = ?
        WHERE id = ?
      `).run(String(reason), req.staff!.sub, ts, orderId);

      revertOrderLoyaltyIfNeeded(orderId);

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action: "PROCESS_ORDER_RETURN",
        entityType: "order",
        entityId: orderId,
        summary: `Xử lý hoàn trả & hoàn tiền đơn #${existing.code} – đã cộng hoàn tồn đúng các lô xuất FEFO`,
        diff: { reason },
        ipAddress: req.ip,
      });

      db.exec("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(500).json({ error: "Lỗi khi xử lý hoàn trả đơn hàng." });
    }
  }
);

adminRouter.post(
  "/orders",
  requireAuth,
  requirePermission("approve_orders"),
  (req: AuthenticatedRequest, res) => {
    const {
      customerId,
      items = [],
      paymentMethod = "vietqr",
      paymentStatus = "unpaid",
      shippingCarrier = "NESPHAR Express Nội Tỉnh",
      note = "",
    } = req.body || {};

    if (!customerId || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({
        error: "Vui lòng chọn Khách hàng/Đối tác và ít nhất 1 sản phẩm để tạo đơn.",
      });
      return;
    }

    const customer = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(String(customerId)) as Record<string, unknown> | undefined;
    if (!customer) {
      res.status(404).json({ error: "Không tìm thấy hồ sơ khách hàng đã chọn." });
      return;
    }

    const defaultAddr = db
      .prepare(
        `SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC LIMIT 1`
      )
      .get(String(customerId)) as Record<string, unknown> | undefined;

    const addressSnapshot = defaultAddr
      ? {
          id: String(defaultAddr.id),
          recipientName: String(defaultAddr.recipient_name),
          phone: String(defaultAddr.phone),
          street: String(defaultAddr.street),
          ward: String(defaultAddr.ward),
          district: String(defaultAddr.district),
          province: String(defaultAddr.province),
          tag: String(defaultAddr.tag),
          isDefault: true,
        }
      : {
          id: `addr-pos-${Date.now()}`,
          recipientName: String(customer.business_name || customer.name),
          phone: String(customer.phone),
          street: "Nhận tại quầy / Địa chỉ hợp đồng đối tác",
          ward: "Phường Trần Phú",
          district: "TP. Hà Tĩnh",
          province: "Tỉnh Hà Tĩnh",
          tag: "Nhà thuốc / Cơ sở",
          isDefault: true,
        };

    const tierSetting = db
      .prepare(`SELECT value_json FROM system_settings WHERE key = 'tier_discounts'`)
      .get() as { value_json: string } | undefined;
    const tierDiscounts = tierSetting
      ? safeJson<Record<string, number>>(tierSetting.value_json, {
          retail: 0,
          clinic: 8,
          pharmacy: 12,
          distributor: 18,
        })
      : { retail: 0, clinic: 8, pharmacy: 12, distributor: 18 };

    const effectiveTier = String(customer.customer_tier || "retail");
    const tierPct =
      customer.custom_discount_percent !== null
        ? Number(customer.custom_discount_percent)
        : Number(tierDiscounts[effectiveTier] || 0);
    const tierFactor = (100 - tierPct) / 100;

    const orderId = `ord-${Date.now()}`;
    const orderCode = String(Math.floor(1462200 + (Date.now() % 800000))).padStart(11, "0");
    const ts = nowIsoLocal();

    db.exec("BEGIN");
    try {
      let subtotal = 0;
      const prepared: Array<{
        productId: string;
        sku: string;
        name: string;
        image: string;
        unitName: string;
        specLabel: string;
        multiplier: number;
        unitPrice: number;
        quantity: number;
        baseQtyRequired: number;
        allocations: BatchAllocation[];
      }> = [];

      for (const raw of items) {
        const prod = db
          .prepare(`SELECT * FROM products WHERE id = ?`)
          .get(String(raw.productId)) as Record<string, unknown> | undefined;
        if (!prod) {
          throw new Error(`Không tìm thấy sản phẩm ${raw.productId}.`);
        }

        const unitOptions = safeJson<
          Array<{
            id: string;
            unitName: string;
            specificationLabel: string;
            multiplier: number;
            extraSavePercent?: number;
          }>
        >(String(prod.unit_options_json || "[]"), []);
        const chosenOpt =
          unitOptions.find((u) => u.id === raw.unitOptionId) ||
          unitOptions[0] || {
            id: "u-base",
            unitName: String(prod.base_unit || "Hộp"),
            specificationLabel: String(prod.specification || "Tiêu chuẩn"),
            multiplier: 1,
          };

        const qty = Math.max(1, Math.round(Number(raw.quantity || 1)));
        const mult = Number(chosenOpt.multiplier || 1);
        const extraSave = chosenOpt.extraSavePercent
          ? (100 - Number(chosenOpt.extraSavePercent)) / 100
          : 1;
        const unitPrice =
          Math.round((Number(prod.retail_price) * mult * extraSave * tierFactor) / 1000) * 1000;
        const baseQtyRequired = Math.max(1, Math.ceil(qty * mult));

        const allocations = allocateBatchesFEFO({
          productId: String(prod.id),
          productName: String(prod.name),
          requiredBaseQty: baseQtyRequired,
          orderCode,
          performedBy: `${req.staff!.name} (POS/B2B)`,
        });

        db.prepare(`UPDATE products SET sold_count = sold_count + ?, updated_at = ? WHERE id = ?`).run(
          baseQtyRequired,
          ts,
          String(prod.id)
        );

        subtotal += unitPrice * qty;
        prepared.push({
          productId: String(prod.id),
          sku: String(prod.sku),
          name: String(prod.name),
          image: String(prod.image_url || ""),
          unitName: chosenOpt.unitName,
          specLabel: chosenOpt.specificationLabel,
          multiplier: mult,
          unitPrice,
          quantity: qty,
          baseQtyRequired,
          allocations,
        });
      }

      const shippingFee = subtotal >= 250000 ? 0 : 25000;
      const totalAmount = subtotal + shippingFee;
      const earnedPoints = Math.max(1, Math.floor(totalAmount / 10000));

      db.prepare(`
        INSERT INTO orders (
          id, code, customer_id, customer_name, customer_tier_snapshot, status, return_status,
          subtotal, discount_amount, points_earned, shipping_fee, total_amount, voucher_code,
          payment_method, payment_status, shipping_carrier, tracking_code, address_json,
          note, source, handled_by_staff_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'confirmed', 'none', ?, 0, ?, ?, ?, NULL, ?, ?, ?, '', ?, ?, 'admin_pos', ?, ?, ?)
      `).run(
        orderId,
        orderCode,
        String(customer.id),
        String(customer.business_name || customer.name),
        effectiveTier,
        subtotal,
        earnedPoints,
        shippingFee,
        totalAmount,
        String(paymentMethod),
        String(paymentStatus),
        String(shippingCarrier),
        JSON.stringify(addressSnapshot),
        String(note || "").trim(),
        req.staff!.sub,
        ts,
        ts
      );

      const insertItem = db.prepare(`
        INSERT INTO order_items (
          id, order_id, product_id, sku, name, image, unit_name, specification_label,
          unit_multiplier, unit_price, quantity, base_qty_deducted, allocations_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      prepared.forEach((it, idx) => {
        insertItem.run(
          `oi-${orderId}-${idx + 1}`,
          orderId,
          it.productId,
          it.sku,
          it.name,
          it.image,
          it.unitName,
          it.specLabel,
          it.multiplier,
          it.unitPrice,
          it.quantity,
          it.baseQtyRequired,
          JSON.stringify(it.allocations)
        );
      });

      recordLoyaltyTransaction({
        customerId: String(customer.id),
        txType: "earn",
        pointsChange: earnedPoints,
        title: `Tích điểm đơn hàng sỉ/POS #${orderCode} (${totalAmount.toLocaleString("vi-VN")}đ)`,
        orderCode,
        createdAt: ts,
      });

      db.prepare(`
        INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
        VALUES (?, ?, 'order', ?, ?, '/orders', 0, ?)
      `).run(
        `noti-${Date.now()}`,
        String(customer.id),
        `Đơn hàng sỉ/POS #${orderCode} đã được khởi tạo`,
        `Dược sĩ ${req.staff!.name} đã tạo đơn #${orderCode} (${totalAmount.toLocaleString("vi-VN")}đ) và phân bổ lô xuất FEFO.`,
        ts
      );

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action: "CREATE_POS_ORDER",
        entityType: "order",
        entityId: orderId,
        summary: `Khởi tạo đơn sỉ/POS #${orderCode} cho ${customer.business_name || customer.name} (${totalAmount.toLocaleString("vi-VN")}đ)`,
        diff: { orderCode, totalAmount, tier: effectiveTier },
        ipAddress: req.ip,
      });

      db.exec("COMMIT");

      dispatchOperationalAlert(
        "NEW_ORDER",
        [
          `[ĐƠN SỈ / POS MỚI] #${orderCode}`,
          `Đối tác: ${customer.business_name || customer.name} (${customer.phone})`,
          `Người lập: ${req.staff!.name}`,
          `Tổng thanh toán: ${totalAmount.toLocaleString("vi-VN")}đ (${paymentMethod.toUpperCase()})`,
        ],
        { orderId, orderCode, totalAmount, source: "admin_pos" }
      );

      res.status(201).json({ ok: true, id: orderId, code: orderCode });
    } catch (err) {
      db.exec("ROLLBACK");
      res.status(400).json({
        error: err instanceof Error ? err.message : "Không thể khởi tạo đơn sỉ/POS.",
      });
    }
  }
);

// ==========================================
// MODULE 4: CUSTOMERS CRM & PHARMACIST TICKETS
// ==========================================
adminRouter.get("/customers", requireAuth, (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, s.full_name AS assigned_staff_name
       FROM customers c
       LEFT JOIN staff_users s ON s.id = c.assigned_staff_id
       ORDER BY c.updated_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const statsStmt = db.prepare(`
    SELECT COUNT(*) AS order_count,
           COALESCE(SUM(CASE WHEN status != 'cancelled' THEN total_amount ELSE 0 END), 0) AS total_spent
    FROM orders WHERE customer_id = ?
  `);
  const addrStmt = db.prepare(`SELECT * FROM customer_addresses WHERE customer_id = ?`);
  const ordStmt = db.prepare(
    `SELECT id, code, status, total_amount, payment_method, created_at
     FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10`
  );

  const customers = rows.map((c) => {
    const cid = String(c.id);
    const st = statsStmt.get(cid) as { order_count: number; total_spent: number };
    const addresses = addrStmt.all(cid);
    const recentOrders = ordStmt.all(cid);

    return {
      id: cid,
      zaloId: c.zalo_id ? String(c.zalo_id) : null,
      avatarUrl: String(c.avatar_url || ""),
      zaloLoggedIn: Boolean(c.zalo_logged_in) || Boolean(c.zalo_id),
      name: String(c.name),
      phone: String(c.phone),
      email: String(c.email),
      customerTier: String(c.customer_tier),
      customDiscountPercent:
        c.custom_discount_percent !== null ? Number(c.custom_discount_percent) : null,
      businessName: String(c.business_name || ""),
      taxCode: String(c.tax_code || ""),
      gppLicenseNo: String(c.gpp_license_no || ""),
      loyaltyPoints: Number(c.loyalty_points),
      assignedStaffId: c.assigned_staff_id ? String(c.assigned_staff_id) : null,
      assignedStaffName: String(c.assigned_staff_name || "Chưa phân công"),
      notes: String(c.notes || ""),
      phoneLinked: Boolean(c.phone_linked),
      orderCount: Number(st.order_count),
      totalSpent: Number(st.total_spent),
      addresses,
      recentOrders,
      createdAt: String(c.created_at),
      updatedAt: String(c.updated_at),
    };
  });

  res.json({ customers });
});

adminRouter.post(
  "/customers",
  requireAuth,
  requirePermission("manage_crm"),
  (req: AuthenticatedRequest, res) => {
    const b = req.body || {};
    if (!b.name || !b.phone) {
      res.status(400).json({ error: "Vui lòng nhập Tên khách hàng / Đối tác và Số điện thoại." });
      return;
    }

    const id = `cust-${Date.now()}`;
    const ts = nowIsoLocal();
    const cleanPhone = String(b.phone).replace(/\D/g, "");

    db.prepare(`
      INSERT INTO customers (
        id, name, phone, email, customer_tier, custom_discount_percent,
        business_name, tax_code, gpp_license_no, loyalty_points, assigned_staff_id,
        notes, phone_linked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      id,
      String(b.name).trim(),
      cleanPhone,
      String(b.email || "").trim(),
      String(b.customerTier || "retail"),
      b.customDiscountPercent !== undefined && b.customDiscountPercent !== ""
        ? Number(b.customDiscountPercent)
        : null,
      String(b.businessName || "").trim(),
      String(b.taxCode || "").trim(),
      String(b.gppLicenseNo || "").trim(),
      Number(b.loyaltyPoints || 0),
      b.assignedStaffId || req.staff!.sub,
      String(b.notes || "").trim(),
      ts,
      ts
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "CREATE_CUSTOMER_CRM",
      entityType: "customer",
      entityId: id,
      summary: `Tạo hồ sơ khách hàng CRM: ${b.businessName || b.name} (Hạng: ${b.customerTier || "retail"})`,
      ipAddress: req.ip,
    });

    res.status(201).json({ id });
  }
);

adminRouter.put(
  "/customers/:id",
  requireAuth,
  requirePermission("manage_crm"),
  (req: AuthenticatedRequest, res) => {
    const cid = String(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(cid) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy khách hàng." });
      return;
    }

    const b = req.body || {};
    const nextTier = String(b.customerTier ?? existing.customer_tier);
    const tierChanged = nextTier !== String(existing.customer_tier);
    const ts = nowIsoLocal();

    const prevPoints = Number(existing.loyalty_points || 0);
    const nextPoints = Math.max(0, Math.floor(Number(b.loyaltyPoints ?? existing.loyalty_points)));

    db.prepare(`
      UPDATE customers SET
        name = ?,
        phone = ?,
        email = ?,
        customer_tier = ?,
        custom_discount_percent = ?,
        business_name = ?,
        tax_code = ?,
        gpp_license_no = ?,
        loyalty_points = ?,
        assigned_staff_id = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      String(b.name ?? existing.name).trim(),
      String(b.phone ?? existing.phone).replace(/\D/g, ""),
      String(b.email ?? existing.email).trim(),
      nextTier,
      b.customDiscountPercent !== undefined
        ? b.customDiscountPercent === null || b.customDiscountPercent === ""
          ? null
          : Number(b.customDiscountPercent)
        : existing.custom_discount_percent !== null
          ? Number(existing.custom_discount_percent)
          : null,
      String(b.businessName ?? existing.business_name).trim(),
      String(b.taxCode ?? existing.tax_code).trim(),
      String(b.gppLicenseNo ?? existing.gpp_license_no).trim(),
      nextPoints,
      b.assignedStaffId !== undefined
        ? b.assignedStaffId
          ? String(b.assignedStaffId)
          : null
        : existing.assigned_staff_id
          ? String(existing.assigned_staff_id)
          : null,
      String(b.notes ?? existing.notes),
      ts,
      cid
    );

    if (nextPoints !== prevPoints) {
      const delta = nextPoints - prevPoints;
      db.prepare(
        `INSERT INTO loyalty_transactions
          (id, customer_id, tx_type, points_change, balance_after, title, order_code, created_at)
         VALUES (?, ?, 'admin_adjust', ?, ?, ?, '', ?)`
      ).run(
        `ltx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        cid,
        delta,
        nextPoints,
        `Điều chỉnh điểm thành viên từ Quản trị NESPHAR (${delta > 0 ? `+${delta}` : delta} điểm)`,
        ts
      );
    }

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: tierChanged ? "UPDATE_CUSTOMER_TIER" : "UPDATE_CUSTOMER_CRM",
      entityType: "customer",
      entityId: cid,
      summary: tierChanged
        ? `Phân hạng chính sách giá khách hàng ${existing.name}: ${existing.customer_tier} -> ${nextTier}`
        : `Cập nhật hồ sơ CRM khách hàng ${b.businessName || b.name || existing.name}`,
      diff: {
        customerTier: { from: existing.customer_tier, to: nextTier },
        customDiscountPercent: b.customDiscountPercent,
      },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

adminRouter.get("/support-tickets", requireAuth, (_req, res) => {
  const tickets = (
    db.prepare(`SELECT * FROM support_tickets ORDER BY created_at DESC`).all() as Array<
      Record<string, unknown>
    >
  ).map((t) => ({
    id: String(t.id),
    customerId: t.customer_id ? String(t.customer_id) : null,
    customerName: String(t.customer_name),
    phone: String(t.phone),
    topic: String(t.topic),
    content: String(t.content),
    status: String(t.status),
    staffReply: String(t.staff_reply),
    repliedBy: String(t.replied_by),
    createdAt: String(t.created_at),
    updatedAt: String(t.updated_at),
  }));
  res.json({ tickets });
});

adminRouter.patch(
  "/support-tickets/:id/reply",
  requireAuth,
  requirePermission("manage_crm"),
  (req: AuthenticatedRequest, res) => {
    const tid = String(req.params.id);
    const { staffReply = "", status = "replied" } = req.body || {};

    const ticket = db
      .prepare(`SELECT * FROM support_tickets WHERE id = ?`)
      .get(tid) as Record<string, unknown> | undefined;
    if (!ticket) {
      res.status(404).json({ error: "Không tìm thấy yêu cầu tư vấn." });
      return;
    }

    const ts = nowIsoLocal();
    db.prepare(`
      UPDATE support_tickets
      SET staff_reply = ?, status = ?, replied_by = ?, updated_at = ?
      WHERE id = ?
    `).run(String(staffReply).trim(), String(status), req.staff!.name, ts, tid);

    if (ticket.customer_id && String(staffReply).trim()) {
      db.prepare(`
        INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
        VALUES (?, ?, 'system', ?, ?, '/profile', 0, ?)
      `).run(
        `noti-${Date.now()}`,
        String(ticket.customer_id),
        `Phản hồi từ ${req.staff!.name}`,
        String(staffReply).trim(),
        ts
      );
    }

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "REPLY_SUPPORT_TICKET",
      entityType: "support_ticket",
      entityId: tid,
      summary: `Dược sĩ phản hồi yêu cầu tư vấn của ${ticket.customer_name} (${ticket.phone})`,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

// ==========================================
// MODULE 5: CMS & SYSTEM SETTINGS
// ==========================================
adminRouter.get("/cms/all", requireAuth, (_req, res) => {
  const banners = (
    db.prepare(`SELECT * FROM banners ORDER BY sort_order ASC`).all() as Array<
      Record<string, unknown>
    >
  ).map((b) => ({
    id: String(b.id),
    badge: String(b.badge),
    title: String(b.title),
    points: safeJson<string[]>(String(b.points_json || "[]"), []),
    imageUrl: String(b.image_url),
    ctaLink: String(b.cta_link),
    sortOrder: Number(b.sort_order),
    isActive: Boolean(b.is_active),
  }));

  const categories = (
    db.prepare(`SELECT * FROM categories ORDER BY sort_order ASC`).all() as Array<
      Record<string, unknown>
    >
  ).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    shortName: String(c.short_name),
    iconKey: String(c.icon_key),
    description: String(c.description),
    sortOrder: Number(c.sort_order),
    isActive: Boolean(c.is_active),
  }));

  const vouchers = (
    db.prepare(`SELECT * FROM vouchers ORDER BY is_active DESC, code ASC`).all() as Array<
      Record<string, unknown>
    >
  ).map((v) => ({
    id: String(v.id),
    code: String(v.code),
    title: String(v.title),
    description: String(v.description),
    discountType: String(v.discount_type),
    discountValue: Number(v.discount_value),
    maxDiscount: v.max_discount !== null ? Number(v.max_discount) : null,
    minOrderValue: Number(v.min_order_value),
    expiryDate: String(v.expiry_date),
    usageLimit: Number(v.usage_limit),
    usedCount: Number(v.used_count),
    isActive: Boolean(v.is_active),
  }));

  const articles = (
    db.prepare(`SELECT * FROM articles ORDER BY article_group ASC, updated_at DESC`).all() as Array<
      Record<string, unknown>
    >
  ).map((a) => ({
    slug: String(a.slug),
    group: String(a.article_group),
    categoryLabel: String(a.category_label),
    title: String(a.title),
    summary: String(a.summary),
    bannerTone: String(a.banner_tone),
    authorLocation: String(a.author_location),
    sections: safeJson(String(a.sections_json || "[]"), []),
    isPublished: Boolean(a.is_published),
    updatedAt: String(a.updated_at),
  }));

  const notifications = (
    db.prepare(`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 40`).all() as Array<
      Record<string, unknown>
    >
  ).map((n) => ({
    id: String(n.id),
    customerId: n.customer_id ? String(n.customer_id) : null,
    type: String(n.type),
    title: String(n.title),
    body: String(n.body),
    targetLink: String(n.target_link),
    createdAt: String(n.created_at),
  }));

  const settingsRows = db.prepare(`SELECT * FROM system_settings`).all() as Array<{
    key: string;
    value_json: string;
  }>;
  const settings: Record<string, unknown> = {
    payment_config: getPaymentConfig(),
    alert_config: getAlertConfig(),
  };
  for (const s of settingsRows) {
    settings[s.key] = safeJson(s.value_json, {});
  }

  res.json({ banners, categories, vouchers, articles, notifications, settings });
});

adminRouter.post(
  "/cms/banners",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const b = req.body || {};
    const id = b.id || `banner-${Date.now()}`;
    db.prepare(`
      INSERT INTO banners (id, badge, title, points_json, image_url, cta_link, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        badge = excluded.badge,
        title = excluded.title,
        points_json = excluded.points_json,
        image_url = excluded.image_url,
        cta_link = excluded.cta_link,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active
    `).run(
      String(id),
      String(b.badge || "NESPHAR"),
      String(b.title || ""),
      JSON.stringify(Array.isArray(b.points) ? b.points : []),
      String(b.imageUrl || "/uploads/media/hero-banner-1.jpg"),
      String(b.ctaLink || "/categories"),
      Number(b.sortOrder ?? 1),
      b.isActive === false ? 0 : 1
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPSERT_BANNER",
      entityType: "banner",
      entityId: String(id),
      summary: `Cập nhật Banner trang chủ Mini App: "${b.title}"`,
      ipAddress: req.ip,
    });
    res.json({ ok: true, id });
  }
);

adminRouter.post(
  "/cms/categories",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const c = req.body || {};
    const id =
      c.id ||
      String(c.name || "danh-muc")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-");

    db.prepare(`
      INSERT INTO categories (id, name, short_name, icon_key, description, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        short_name = excluded.short_name,
        icon_key = excluded.icon_key,
        description = excluded.description,
        sort_order = excluded.sort_order,
        is_active = excluded.is_active
    `).run(
      id,
      String(c.name || ""),
      String(c.shortName || c.name || ""),
      String(c.iconKey || "supplement"),
      String(c.description || ""),
      Number(c.sortOrder ?? 1),
      c.isActive === false ? 0 : 1
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPSERT_CATEGORY",
      entityType: "category",
      entityId: id,
      summary: `Cập nhật danh mục ngành hàng: "${c.name}"`,
      ipAddress: req.ip,
    });
    res.json({ ok: true, id });
  }
);

adminRouter.post(
  "/cms/vouchers",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const v = req.body || {};
    if (!v.code || !v.title) {
      res.status(400).json({ error: "Vui lòng nhập Mã voucher và Tiêu đề ưu đãi." });
      return;
    }
    const id = v.id || `v-${Date.now()}`;
    db.prepare(`
      INSERT INTO vouchers
        (id, code, title, description, discount_type, discount_value, max_discount, min_order_value, expiry_date, usage_limit, used_count, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 0), ?)
      ON CONFLICT(id) DO UPDATE SET
        code = excluded.code,
        title = excluded.title,
        description = excluded.description,
        discount_type = excluded.discount_type,
        discount_value = excluded.discount_value,
        max_discount = excluded.max_discount,
        min_order_value = excluded.min_order_value,
        expiry_date = excluded.expiry_date,
        usage_limit = excluded.usage_limit,
        is_active = excluded.is_active
    `).run(
      String(id),
      String(v.code).trim().toUpperCase(),
      String(v.title).trim(),
      String(v.description || ""),
      v.discountType === "percent" ? "percent" : "fixed",
      Number(v.discountValue || 0),
      v.maxDiscount ? Number(v.maxDiscount) : null,
      Number(v.minOrderValue || 0),
      String(v.expiryDate || "31/12/2026"),
      Number(v.usageLimit || 500),
      v.usedCount !== undefined ? Number(v.usedCount) : 0,
      v.isActive === false ? 0 : 1
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPSERT_VOUCHER",
      entityType: "voucher",
      entityId: String(id),
      summary: `Cập nhật mã khuyến mại ${String(v.code).toUpperCase()} (${v.title})`,
      ipAddress: req.ip,
    });
    res.json({ ok: true, id });
  }
);

adminRouter.post(
  "/cms/articles",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const a = req.body || {};
    if (!a.title) {
      res.status(400).json({ error: "Vui lòng nhập tiêu đề bài viết / chính sách." });
      return;
    }
    const slug =
      a.slug ||
      String(a.title)
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");

    const ts = nowIsoLocal();
    db.prepare(`
      INSERT INTO articles
        (slug, article_group, category_label, title, summary, banner_tone, author_location, sections_json, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        article_group = excluded.article_group,
        category_label = excluded.category_label,
        title = excluded.title,
        summary = excluded.summary,
        author_location = excluded.author_location,
        sections_json = excluded.sections_json,
        is_published = excluded.is_published,
        updated_at = excluded.updated_at
    `).run(
      slug,
      a.group === "policy" || a.group === "about" ? a.group : "health",
      String(a.categoryLabel || "TIN SỨC KHỎE"),
      String(a.title).trim(),
      String(a.summary || ""),
      String(a.bannerTone || "emerald"),
      String(a.authorLocation || "Dược Phẩm NESPHAR"),
      JSON.stringify(Array.isArray(a.sections) ? a.sections : []),
      a.isPublished === false ? 0 : 1,
      ts
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPSERT_ARTICLE",
      entityType: "article",
      entityId: slug,
      summary: `Cập nhật bài viết / chính sách Mini App: "${a.title}"`,
      ipAddress: req.ip,
    });
    res.json({ ok: true, slug });
  }
);

adminRouter.post(
  "/cms/notifications",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const { title, body, type = "promo", targetLink = "/vouchers", customerId = null } =
      req.body || {};
    if (!title || !body) {
      res.status(400).json({ error: "Vui lòng nhập Tiêu đề và Nội dung thông báo." });
      return;
    }
    const id = `noti-${Date.now()}`;
    const ts = nowIsoLocal();
    db.prepare(`
      INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      id,
      customerId ? String(customerId) : null,
      type === "order" || type === "system" ? type : "promo",
      String(title).trim(),
      String(body).trim(),
      String(targetLink || "/"),
      ts
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "BROADCAST_NOTIFICATION",
      entityType: "notification",
      entityId: id,
      summary: `Phát thông báo xuống Zalo Mini App: "${title}" (${customerId ? "Cá nhân" : "Toàn bộ khách hàng"})`,
      ipAddress: req.ip,
    });
    res.status(201).json({ ok: true, id });
  }
);

adminRouter.put(
  "/settings",
  requireAuth,
  requirePermission("manage_cms"),
  (req: AuthenticatedRequest, res) => {
    const {
      companyInfo,
      nearExpiryDays,
      tierDiscounts,
      paymentConfig,
      alertConfig,
    } = req.body || {};
    const upsert = db.prepare(`
      INSERT INTO system_settings (key, value_json) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
    `);

    if (companyInfo) {
      upsert.run("company_info", JSON.stringify(companyInfo));
    }
    if (nearExpiryDays !== undefined) {
      upsert.run("near_expiry_days", JSON.stringify(Math.max(7, Number(nearExpiryDays))));
    }
    if (tierDiscounts) {
      upsert.run("tier_discounts", JSON.stringify(tierDiscounts));
    }
    if (paymentConfig) {
      upsert.run("payment_config", JSON.stringify({ ...getPaymentConfig(), ...paymentConfig }));
    }
    if (alertConfig) {
      upsert.run("alert_config", JSON.stringify({ ...getAlertConfig(), ...alertConfig }));
    }

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPDATE_SYSTEM_SETTINGS",
      entityType: "system_settings",
      entityId: "global",
      summary: `Cập nhật cấu hình vận hành, tài khoản VietQR & kênh cảnh báo Telegram/Webhook`,
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

adminRouter.post(
  "/settings/test-telegram",
  requireAuth,
  requirePermission("manage_cms"),
  async (req: AuthenticatedRequest, res) => {
    try {
      await sendTestTelegramMessage(req.body || {});
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Gửi tin nhắn kiểm thử Telegram thất bại.",
      });
    }
  }
);

adminRouter.post(
  "/settings/simulate-payment",
  requireAuth,
  requirePermission("approve_orders"),
  (req: AuthenticatedRequest, res) => {
    const { orderCode = "" } = req.body || {};
    const order = db
      .prepare(`SELECT * FROM orders WHERE code = ?`)
      .get(String(orderCode).trim()) as Record<string, unknown> | undefined;
    if (!order) {
      res.status(404).json({ error: `Không tìm thấy đơn hàng #${orderCode}.` });
      return;
    }
    const result = reconcileBankTransfer({
      amount: Number(order.total_amount),
      content: `NESPHAR ${order.code}`,
      referenceCode: `SIM-FT-${Date.now().toString().slice(-6)}`,
      sourceIp: req.ip,
    });
    res.json({ ok: true, result });
  }
);

// ==========================================
// MODULE 6: STAFF, RBAC & AUDIT LOGS + CSV EXPORT
// ==========================================
adminRouter.get("/staff", requireAuth, (_req, res) => {
  const rows = db
    .prepare(`SELECT * FROM staff_users ORDER BY created_at ASC`)
    .all() as Array<Record<string, unknown>>;

  const staff = rows.map((s) => {
    const role = String(s.role) as "ADMIN" | "SALES" | "WAREHOUSE";
    return {
      id: String(s.id),
      email: String(s.email),
      fullName: String(s.full_name),
      role,
      phone: String(s.phone),
      status: String(s.status),
      permissions: safeJson<PermissionKey[]>(
        String(s.permissions_json || "[]"),
        ROLE_DEFAULT_PERMISSIONS[role]
      ),
      lastLoginAt: s.last_login_at ? String(s.last_login_at) : null,
      createdAt: String(s.created_at),
    };
  });

  res.json({ staff });
});

adminRouter.post(
  "/staff",
  requireAuth,
  requirePermission("manage_staff"),
  (req: AuthenticatedRequest, res) => {
    const { email, password, fullName, role = "SALES", phone = "", permissions } = req.body || {};
    if (!email || !password || !fullName) {
      res.status(400).json({ error: "Vui lòng nhập Họ tên, Email và Mật khẩu khởi tạo." });
      return;
    }

    const safeRole: "ADMIN" | "SALES" | "WAREHOUSE" =
      role === "ADMIN" || role === "WAREHOUSE" ? role : "SALES";
    const perms = Array.isArray(permissions)
      ? permissions
      : ROLE_DEFAULT_PERMISSIONS[safeRole];

    const id = `staff-${Date.now()}`;
    try {
      db.prepare(`
        INSERT INTO staff_users
          (id, email, password_hash, full_name, role, phone, status, permissions_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(
        id,
        String(email).trim().toLowerCase(),
        hashPassword(String(password)),
        String(fullName).trim(),
        safeRole,
        String(phone).trim(),
        JSON.stringify(perms),
        nowIsoLocal()
      );

      logAudit({
        actorId: req.staff!.sub,
        actorName: req.staff!.name,
        actorRole: req.staff!.role,
        action: "CREATE_STAFF_USER",
        entityType: "staff_user",
        entityId: id,
        summary: `Tạo tài khoản nhân sự ${fullName} (${email}) – Vai trò ${safeRole}`,
        diff: { role: safeRole, permissions: perms },
        ipAddress: req.ip,
      });

      res.status(201).json({ id });
    } catch {
      res.status(400).json({ error: "Email nhân sự đã tồn tại trên hệ thống." });
    }
  }
);

adminRouter.put(
  "/staff/:id",
  requireAuth,
  requirePermission("manage_staff"),
  (req: AuthenticatedRequest, res) => {
    const sid = String(req.params.id);
    const existing = db
      .prepare(`SELECT * FROM staff_users WHERE id = ?`)
      .get(sid) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: "Không tìm thấy tài khoản nhân sự." });
      return;
    }

    const { fullName, role, phone, status, permissions, newPassword } = req.body || {};
    const nextRole =
      role === "ADMIN" || role === "SALES" || role === "WAREHOUSE"
        ? role
        : String(existing.role);
    const nextStatus =
      status === "locked" || status === "active" ? status : String(existing.status);

    // Prevent self-lockout or removing the last active ADMIN
    if (sid === req.staff!.sub && (nextStatus !== "active" || nextRole !== "ADMIN")) {
      res.status(400).json({
        error: "Không thể tự khóa hoặc tự hạ quyền Quản trị viên trên chính tài khoản đang đăng nhập.",
      });
      return;
    }
    if (
      String(existing.role) === "ADMIN" &&
      (nextRole !== "ADMIN" || nextStatus !== "active")
    ) {
      const otherAdmins = db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM staff_users WHERE role = 'ADMIN' AND status = 'active' AND id != ?`
        )
        .get(sid) as { cnt: number };
      if (otherAdmins.cnt === 0) {
        res.status(400).json({
          error: "Hệ thống bắt buộc duy trì ít nhất 01 tài khoản Giám đốc (ADMIN) đang hoạt động.",
        });
        return;
      }
    }
    const nextHash =
      newPassword && String(newPassword).trim().length >= 6
        ? hashPassword(String(newPassword).trim())
        : String(existing.password_hash);

    db.prepare(`
      UPDATE staff_users SET
        full_name = ?,
        role = ?,
        phone = ?,
        status = ?,
        permissions_json = ?,
        password_hash = ?
      WHERE id = ?
    `).run(
      String(fullName ?? existing.full_name).trim(),
      nextRole,
      String(phone ?? existing.phone).trim(),
      nextStatus,
      Array.isArray(permissions)
        ? JSON.stringify(permissions)
        : String(existing.permissions_json),
      nextHash,
      sid
    );

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "UPDATE_STAFF_RBAC",
      entityType: "staff_user",
      entityId: sid,
      summary: `Cập nhật phân quyền / trạng thái nhân sự ${existing.full_name} (Vai trò: ${nextRole}, TT: ${nextStatus})`,
      diff: { role: nextRole, status: nextStatus, permissions },
      ipAddress: req.ip,
    });

    res.json({ ok: true });
  }
);

adminRouter.get("/audit-logs", requireAuth, (req, res) => {
  const entityType = String(req.query.entityType || "");
  const q = String(req.query.q || "").trim().toLowerCase();

  let rows = db
    .prepare(`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200`)
    .all() as Array<Record<string, unknown>>;

  if (entityType) {
    rows = rows.filter((r) => String(r.entity_type) === entityType);
  }
  if (q) {
    rows = rows.filter(
      (r) =>
        String(r.summary).toLowerCase().includes(q) ||
        String(r.actor_name).toLowerCase().includes(q) ||
        String(r.action).toLowerCase().includes(q)
    );
  }

  res.json({
    logs: rows.map((r) => ({
      id: String(r.id),
      actorId: String(r.actor_id),
      actorName: String(r.actor_name),
      actorRole: String(r.actor_role),
      action: String(r.action),
      entityType: String(r.entity_type),
      entityId: String(r.entity_id),
      summary: String(r.summary),
      diff: safeJson(String(r.diff_json || "{}"), {}),
      ipAddress: String(r.ip_address),
      createdAt: String(r.created_at),
    })),
  });
});

adminRouter.get(
  "/export/:resource",
  requireAuth,
  requirePermission("export_data"),
  (req: AuthenticatedRequest, res) => {
    const resource = String(req.params.resource);
    let csvRows: string[] = [];
    let fileName = `nesphar-${resource}-${todayDateOnly()}.csv`;

    if (resource === "orders") {
      const rows = db.prepare(`SELECT * FROM orders ORDER BY created_at DESC`).all() as Array<
        Record<string, unknown>
      >;
      csvRows.push(
        [
          "Ma don hang",
          "Ngay tao",
          "Khach hang",
          "Hang gia",
          "Trang thai",
          "Thanh toan",
          "Tam tinh (VND)",
          "Giam gia (VND)",
          "Phi giao (VND)",
          "Tong thanh toan (VND)",
          "Don vi van chuyen",
          "Ma van don",
        ].join(",")
      );
      for (const r of rows) {
        csvRows.push(
          [
            r.code,
            r.created_at,
            r.customer_name,
            r.customer_tier_snapshot,
            r.status,
            `${r.payment_method} (${r.payment_status})`,
            r.subtotal,
            r.discount_amount,
            r.shipping_fee,
            r.total_amount,
            r.shipping_carrier,
            r.tracking_code,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else if (resource === "batches" || resource === "inventory") {
      fileName = `nesphar-batches-gsp-${todayDateOnly()}.csv`;
      const rows = db
        .prepare(
          `SELECT b.*, p.sku, p.name AS product_name, p.base_unit
           FROM inventory_batches b JOIN products p ON p.id = b.product_id
           ORDER BY b.exp_date ASC`
        )
        .all() as Array<Record<string, unknown>>;
      csvRows.push(
        [
          "SKU",
          "Ten san pham",
          "Ma Lo (Batch/Lot)",
          "NSX",
          "HSD",
          "So ngay con lai",
          "Don vi",
          "Gia nhap (VND)",
          "SL nhap",
          "SL ton",
          "Vi tri ke GSP",
          "Trang thai",
        ].join(",")
      );
      for (const r of rows) {
        csvRows.push(
          [
            r.sku,
            r.product_name,
            r.batch_code,
            r.mfg_date,
            r.exp_date,
            daysUntilDate(String(r.exp_date)),
            r.base_unit,
            r.cost_price,
            r.initial_qty,
            r.remaining_qty,
            r.shelf_location,
            r.status,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else if (resource === "customers") {
      const rows = db.prepare(`SELECT * FROM customers ORDER BY updated_at DESC`).all() as Array<
        Record<string, unknown>
      >;
      csvRows.push(
        [
          "Ma KH",
          "Ho ten",
          "Ten co so / Nha thuoc",
          "Dien thoai",
          "Email",
          "Hang khach",
          "MST",
          "So GPP/GDP",
          "Diem tich luy",
        ].join(",")
      );
      for (const r of rows) {
        csvRows.push(
          [
            r.id,
            r.name,
            r.business_name,
            r.phone,
            r.email,
            r.customer_tier,
            r.tax_code,
            r.gpp_license_no,
            r.loyalty_points,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else if (resource === "movements") {
      fileName = `nesphar-stock-movements-${todayDateOnly()}.csv`;
      const rows = db
        .prepare(`SELECT * FROM inventory_movements ORDER BY created_at DESC`)
        .all() as Array<Record<string, unknown>>;
      csvRows.push(
        [
          "Thoi gian",
          "Loai giao dich",
          "Ma Lo",
          "San pham",
          "Bien dong SL",
          "Ton sau GD",
          "Ma chung tu",
          "Nguoi thuc hien",
          "Ghi chu",
        ].join(",")
      );
      for (const m of rows) {
        csvRows.push(
          [
            m.created_at,
            m.movement_type,
            m.batch_code,
            m.product_name,
            m.qty_change,
            m.balance_after,
            m.reference_code,
            m.performed_by,
            m.note,
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else if (resource === "products") {
      const rows = db.prepare(`SELECT * FROM products ORDER BY sku ASC`).all() as Array<
        Record<string, unknown>
      >;
      fileName = `nesphar-products-${todayDateOnly()}.csv`;
      csvRows.push(
        [
          "SKU",
          "Ten san pham",
          "Thuong hieu",
          "So DK Cong bo BYT",
          "Don vi",
          "Gia von (VND)",
          "Gia ban le (VND)",
          "Ton kha dung FEFO",
          "Hien thi Mini App",
        ].join(",")
      );
      for (const r of rows) {
        const st = getProductStockSummary(String(r.id));
        csvRows.push(
          [
            r.sku,
            r.name,
            r.brand,
            r.registration_no,
            r.base_unit,
            r.cost_price,
            r.retail_price,
            st.availableStock,
            r.is_visible ? "Hien thi" : "Tam an",
          ]
            .map(csvEscape)
            .join(",")
        );
      }
    } else {
      res.status(400).json({ error: `Loại báo cáo CSV không hợp lệ: ${resource}` });
      return;
    }

    logAudit({
      actorId: req.staff!.sub,
      actorName: req.staff!.name,
      actorRole: req.staff!.role,
      action: "EXPORT_CSV",
      entityType: resource,
      entityId: fileName,
      summary: `Kết xuất tệp báo cáo Excel/CSV: ${fileName}`,
      ipAddress: req.ip,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send("\uFEFF" + csvRows.join("\n"));
  }
);
