import { Request, Router } from "express";
import {
  db,
  logAudit,
  nowIsoLocal,
  recordLoyaltyTransaction,
  revertOrderLoyaltyIfNeeded,
  todayDateOnly,
} from "../db/database";
import { createRateLimiter } from "../middleware/securityShield";
import {
  allocateBatchesFEFO,
  BatchAllocation,
  getProductStockSummary,
  restoreBatchesFromOrder,
} from "../services/inventoryService";
import {
  buildVietQrImageUrl,
  dispatchOperationalAlert,
  getPublicPaymentConfig,
} from "../services/alertService";
import { resolveZaloPhoneFromToken } from "../services/zaloAuthService";
import { computeVolumeAwareUnitPrice, VolumePriceTier } from "../services/xlsxImportService";

export const miniappRouter = Router();

// Anti-bot / anti-inventory-drain rate limiter for write endpoints (20 req/min/IP)
const miniappWriteLimiter = createRateLimiter({
  prefix: "miniapp-write",
  windowMs: 60_000,
  maxRequests: 20,
  errorMessage: "Thao tác quá nhanh. Vui lòng đợi ít giây rồi thử lại.",
});

function normalizePhone(raw: string): string {
  const digits = (raw || "").replace(/\D/g, "");
  if (digits.startsWith("84") && digits.length >= 11) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

function resolvePublicUrl(req: Request, urlPath: string): string {
  if (!urlPath) return "";
  if (urlPath.startsWith("http://") || urlPath.startsWith("https://") || urlPath.startsWith("data:")) {
    return urlPath;
  }
  const forwardedProto = (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0];
  const proto = forwardedProto === "https" || req.protocol === "https" ? "https" : "http";
  const rawHost = req.get("host") || "localhost:4000";
  const safeHost = /^[a-zA-Z0-9.\-:]+$/.test(rawHost) ? rawHost : "localhost:4000";
  return `${proto}://${safeHost}${urlPath.startsWith("/") ? "" : "/"}${urlPath}`;
}

function mapOrdersForCustomer(req: Request, customerId: string) {
  const orderRows = db
    .prepare(
      `SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC`
    )
    .all(customerId) as Array<Record<string, unknown>>;

  const itemStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);

  return orderRows.map((o) => {
    const items = (itemStmt.all(String(o.id)) as Array<Record<string, unknown>>).map((it) => ({
      productId: String(it.product_id),
      sku: String(it.sku),
      name: String(it.name),
      image: resolvePublicUrl(req, String(it.image || "")),
      unitName: String(it.unit_name),
      specificationLabel: String(it.specification_label),
      unitPrice: Number(it.unit_price),
      quantity: Number(it.quantity),
      allocations: safeJsonParse(String(it.allocations_json || "[]"), []),
    }));

    return {
      id: String(o.id),
      code: String(o.code),
      createdAt: String(o.created_at),
      status: String(o.status),
      returnStatus: String(o.return_status || "none"),
      items,
      subtotal: Number(o.subtotal),
      discountAmount: Number(o.discount_amount),
      pointsRedeemed: Number(o.points_redeemed || 0),
      pointsDiscount: Number(o.points_discount || 0),
      pointsEarned: Number(o.points_earned || 0),
      shippingFee: Number(o.shipping_fee),
      totalAmount: Number(o.total_amount),
      voucherCode: o.voucher_code ? String(o.voucher_code) : undefined,
      paymentMethod:
        String(o.payment_method) === "bank_transfer"
          ? "vietqr"
          : String(o.payment_method),
      paymentStatus: String(o.payment_status),
      vietQrUrl:
        (String(o.payment_method) === "vietqr" ||
          String(o.payment_method) === "bank_transfer") &&
        String(o.payment_status) !== "paid" &&
        String(o.status) !== "cancelled"
          ? buildVietQrImageUrl({
              amount: Number(o.total_amount),
              orderCode: String(o.code),
            })
          : "",
      trackingCode: String(o.tracking_code || ""),
      shippingCarrier: String(o.shipping_carrier || ""),
      address: safeJsonParse(String(o.address_json || "{}"), {}),
      note: String(o.note || ""),
      customerTierAtPurchase: String(o.customer_tier_snapshot || "retail"),
    };
  });
}

function mapAddressesForCustomer(customerId: string) {
  const rows = db
    .prepare(
      `SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id ASC`
    )
    .all(customerId) as Array<Record<string, unknown>>;

  return rows.map((a) => ({
    id: String(a.id),
    recipientName: String(a.recipient_name),
    phone: String(a.phone),
    street: String(a.street),
    ward: String(a.ward),
    district: String(a.district),
    province: String(a.province),
    tag: String(a.tag),
    isDefault: Boolean(a.is_default),
  }));
}

function mapLoyaltyHistory(customerId: string) {
  if (!customerId) return [];
  const rows = db
    .prepare(
      `SELECT * FROM loyalty_transactions
       WHERE customer_id = ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT 40`
    )
    .all(customerId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    type: String(r.tx_type),
    pointsChange: Number(r.points_change),
    balanceAfter: Number(r.balance_after),
    title: String(r.title),
    orderCode: String(r.order_code || ""),
    createdAt: String(r.created_at),
  }));
}

function serializeCustomer(customer: Record<string, unknown>) {
  return {
    id: String(customer.id),
    zaloId: customer.zalo_id ? String(customer.zalo_id) : null,
    name: String(customer.name),
    avatarUrl: String(customer.avatar_url || ""),
    zaloLoggedIn: Boolean(customer.zalo_logged_in) || Boolean(customer.zalo_id),
    welcomeBonusClaimed: Boolean(customer.welcome_bonus_claimed),
    phone: String(customer.phone),
    phoneLinked: Boolean(customer.phone_linked),
    loyaltyPoints: Number(customer.loyalty_points),
    customerTier: String(customer.customer_tier),
    customDiscountPercent:
      customer.custom_discount_percent !== null
        ? Number(customer.custom_discount_percent)
        : null,
    businessName: String(customer.business_name || ""),
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseVoucherExpiryIso(raw: string): string {
  const s = String(raw || "").trim();
  if (!s) return "9999-12-31";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return "9999-12-31";
}

function isVoucherNotExpired(raw: string, todayIso: string): boolean {
  return parseVoucherExpiryIso(raw) >= todayIso;
}

function ensureCustomerRow(params: {
  customerId: string;
  zaloId?: string;
  name?: string;
  phone?: string;
}): Record<string, unknown> {
  const cleanId = String(params.customerId || "").trim().slice(0, 80) || `cust-${Date.now()}`;
  const cleanZaloId = String(params.zaloId || "").trim().slice(0, 80) || null;

  let row = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(cleanId) as Record<string, unknown> | undefined;

  if (!row && cleanZaloId) {
    row = db
      .prepare(`SELECT * FROM customers WHERE zalo_id = ?`)
      .get(cleanZaloId) as Record<string, unknown> | undefined;
  }

  if (!row) {
    const ts = nowIsoLocal();
    const safeName = String(params.name || "Khách hàng Zalo").trim().slice(0, 120) || "Khách hàng Zalo";
    const safePhone = normalizePhone(String(params.phone || "")).slice(0, 16);
    db.prepare(
      `INSERT INTO customers (id, zalo_id, name, phone, customer_tier, loyalty_points, phone_linked, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'retail', 0, 0, ?, ?)`
    ).run(cleanId, cleanZaloId, safeName, safePhone, ts, ts);
    row = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(cleanId) as Record<string, unknown>;
  }

  return row;
}

miniappRouter.get("/bootstrap", (req, res) => {
  const requestedCustomerId = String(req.query.customerId || "").trim();
  const requestedZaloId = String(req.query.zaloId || "").trim();
  const requestedPhone = normalizePhone(String(req.query.phone || ""));

  let customer: Record<string, unknown> | undefined;
  if (requestedZaloId) {
    customer = db
      .prepare(`SELECT * FROM customers WHERE zalo_id = ?`)
      .get(requestedZaloId) as Record<string, unknown> | undefined;
  }
  if (!customer && requestedCustomerId) {
    customer = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(requestedCustomerId) as Record<string, unknown> | undefined;
  }
  // Only match by phone on bootstrap if that customer already completed phone_linked verification
  if (!customer && requestedPhone) {
    customer = db
      .prepare(`SELECT * FROM customers WHERE phone = ? AND phone_linked = 1`)
      .get(requestedPhone) as Record<string, unknown> | undefined;
  }

  const activeCustomerId = customer ? String(customer.id) : requestedCustomerId;
  const activeTier = customer ? String(customer.customer_tier || "retail") : "retail";

  const companySetting = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'company_info'`)
    .get() as { value_json: string } | undefined;
  const tierSetting = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'tier_discounts'`)
    .get() as { value_json: string } | undefined;
  const tagSetting = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'product_tags'`)
    .get() as { value_json: string } | undefined;

  const categories = (
    db
      .prepare(
        `SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`
      )
      .all() as Array<Record<string, unknown>>
  ).map((c) => ({
    id: String(c.id),
    name: String(c.name),
    shortName: String(c.short_name),
    iconKey: String(c.icon_key),
    description: String(c.description),
  }));

  const banners = (
    db
      .prepare(`SELECT * FROM banners WHERE is_active = 1 ORDER BY sort_order ASC`)
      .all() as Array<Record<string, unknown>>
  ).map((b) => ({
    id: String(b.id),
    badge: String(b.badge),
    title: String(b.title),
    points: safeJsonParse<string[]>(String(b.points_json || "[]"), []),
    image: resolvePublicUrl(req, String(b.image_url || "")),
    ctaLink: String(b.cta_link || "/categories"),
  }));

  const rawProducts = db
    .prepare(`SELECT * FROM products WHERE is_visible = 1 ORDER BY is_best_seller DESC, sku ASC`)
    .all() as Array<Record<string, unknown>>;

  const products = rawProducts
    .filter((p) => {
      const allowedTiers = safeJsonParse<string[]>(
        String(p.allowed_tiers_json || '["retail","clinic","pharmacy","distributor"]'),
        ["retail", "clinic", "pharmacy", "distributor"]
      );
      return allowedTiers.includes(activeTier);
    })
    .map((p) => {
      const stock = getProductStockSummary(String(p.id));
      const gallery = safeJsonParse<string[]>(String(p.gallery_json || "[]"), []);
      const primaryImg = String(p.image_url || gallery[0] || "");
      const images = Array.from(new Set([primaryImg, ...gallery].filter(Boolean))).map((u) =>
        resolvePublicUrl(req, u)
      );

      return {
        id: String(p.id),
        sku: String(p.sku),
        name: String(p.name),
        categoryId: String(p.category_id),
        tags: safeJsonParse<string[]>(String(p.tags_json || "[]"), []),
        isPrescription: Boolean(p.is_prescription),
        promoBadge: String(p.promo_badge || ""),
        volumeTiers: safeJsonParse<VolumePriceTier[]>(String(p.volume_tiers_json || "[]"), []),
        brand: String(p.brand),
        origin: String(p.origin),
        registrationNo: String(p.registration_no),
        declarationDocUrl: p.declaration_doc_url
          ? resolvePublicUrl(req, String(p.declaration_doc_url))
          : "",
        baseUnit: String(p.base_unit),
        specification: String(p.specification),
        retailPrice: Number(p.retail_price),
        originalPrice: Number(p.original_price),
        inStock: stock.availableStock > 0,
        stockCount: stock.availableStock,
        nearestExpDate: stock.nearestExpDate,
        soldCount: Number(p.sold_count),
        isNew: Boolean(p.is_new),
        isBestSeller: Boolean(p.is_best_seller),
        isFlashPromo: Boolean(p.is_flash_promo),
        hasVideoPreview: Boolean(p.has_video_preview),
        images,
        shortSummary: String(p.short_summary),
        ingredients: String(p.ingredients),
        benefits: safeJsonParse<string[]>(String(p.benefits_json || "[]"), []),
        dosage: String(p.dosage),
        targetUsers: String(p.target_users),
        storageNote: String(p.storage_note),
        disclaimer: String(p.disclaimer),
        unitOptions: safeJsonParse(String(p.unit_options_json || "[]"), [
          {
            id: "u-default",
            unitName: String(p.base_unit || "Hộp"),
            specificationLabel: String(p.specification || "Tiêu chuẩn"),
            multiplier: 1,
          },
        ]),
      };
    });

  const todayIso = todayDateOnly();
  const vouchers = (
    db
      .prepare(
        `SELECT * FROM vouchers
         WHERE is_active = 1 AND used_count < usage_limit
         ORDER BY min_order_value ASC`
      )
      .all() as Array<Record<string, unknown>>
  )
    .filter((v) => isVoucherNotExpired(String(v.expiry_date || ""), todayIso))
    .map((v) => ({
      id: String(v.id),
      code: String(v.code),
      title: String(v.title),
      description: String(v.description),
      discountType: String(v.discount_type),
      discountValue: Number(v.discount_value),
      maxDiscount: v.max_discount !== null ? Number(v.max_discount) : undefined,
      minOrderValue: Number(v.min_order_value),
      expiryDate: String(v.expiry_date),
    }));

  const articles = (
    db
      .prepare(`SELECT * FROM articles WHERE is_published = 1 ORDER BY updated_at DESC`)
      .all() as Array<Record<string, unknown>>
  ).map((a) => ({
    slug: String(a.slug),
    group: String(a.article_group),
    categoryLabel: String(a.category_label),
    title: String(a.title),
    updatedAt: String(a.updated_at),
    authorLocation: String(a.author_location),
    summary: String(a.summary),
    bannerTone: String(a.banner_tone),
    sections: safeJsonParse(String(a.sections_json || "[]"), []),
  }));

  const notifications = (
    activeCustomerId
      ? (db
          .prepare(
            `SELECT * FROM notifications
             WHERE customer_id IS NULL OR customer_id = ?
             ORDER BY created_at DESC LIMIT 30`
          )
          .all(activeCustomerId) as Array<Record<string, unknown>>)
      : (db
          .prepare(
            `SELECT * FROM notifications
             WHERE customer_id IS NULL
             ORDER BY created_at DESC LIMIT 20`
          )
          .all() as Array<Record<string, unknown>>)
  ).map((n) => ({
    id: String(n.id),
    type: String(n.type),
    title: String(n.title),
    body: String(n.body),
    createdAt: String(n.created_at),
    read: Boolean(n.is_read),
    targetLink: String(n.target_link || "/orders"),
  }));

  res.json({
    companyInfo: companySetting ? safeJsonParse(companySetting.value_json, {}) : {},
    paymentConfig: getPublicPaymentConfig(),
    tierDiscounts: tierSetting
      ? safeJsonParse(tierSetting.value_json, { retail: 0, clinic: 8, pharmacy: 12, distributor: 18 })
      : { retail: 0, clinic: 8, pharmacy: 12, distributor: 18 },
    productTags: tagSetting ? safeJsonParse(tagSetting.value_json, []) : [],
    categories,
    banners,
    products,
    vouchers,
    articles,
    customer: customer ? serializeCustomer(customer) : null,
    addresses: customer ? mapAddressesForCustomer(activeCustomerId) : [],
    orders: customer ? mapOrdersForCustomer(req, activeCustomerId) : [],
    loyaltyHistory: customer ? mapLoyaltyHistory(activeCustomerId) : [],
    notifications,
    syncedAt: nowIsoLocal(),
  });
});

miniappRouter.post("/auth/zalo-login", miniappWriteLimiter, async (req, res) => {
  const {
    customerId = "",
    zaloId = "",
    name = "",
    avatarUrl = "",
    phone = "",
    accessToken = "",
    phoneToken = "",
  } = req.body || {};

  const cleanZaloId = String(zaloId || "").trim().slice(0, 80) || null;
  const cleanName = String(name || "").trim().slice(0, 120);
  const cleanAvatar = String(avatarUrl || "")
    .trim()
    .slice(0, 600);

  let cleanPhone = "";
  let verifiedByZaloServer = false;

  if ((accessToken && phoneToken) || String(phone || "").trim()) {
    try {
      const resolved = await resolveZaloPhoneFromToken({
        accessToken: String(accessToken),
        phoneToken: String(phoneToken),
        fallbackPhone: String(phone),
      });
      cleanPhone = resolved.phone;
      verifiedByZaloServer = resolved.verifiedByZaloServer;
    } catch {
      const fallbackNorm = normalizePhone(String(phone || ""));
      if (fallbackNorm.length >= 9) {
        cleanPhone = fallbackNorm;
      }
    }
  }

  if (!cleanZaloId && !cleanPhone && !cleanName) {
    res.status(400).json({
      error: "Không nhận được thông tin tài khoản Zalo hợp lệ. Vui lòng thử lại.",
    });
    return;
  }

  const ts = nowIsoLocal();
  let welcomeBonusGranted = 0;
  let targetId = String(customerId || "").trim().slice(0, 80) || `cust-${Date.now()}`;

  db.exec("BEGIN");
  try {
    let matched: Record<string, unknown> | undefined;
    if (cleanZaloId) {
      matched = db
        .prepare(`SELECT * FROM customers WHERE zalo_id = ?`)
        .get(cleanZaloId) as Record<string, unknown> | undefined;
    }
    if (!matched && cleanPhone) {
      matched = db
        .prepare(`SELECT * FROM customers WHERE phone = ?`)
        .get(cleanPhone) as Record<string, unknown> | undefined;
    }
    if (!matched && targetId) {
      matched = db
        .prepare(`SELECT * FROM customers WHERE id = ?`)
        .get(targetId) as Record<string, unknown> | undefined;
    }

    if (matched) {
      targetId = String(matched.id);
      const nextPhone = cleanPhone || String(matched.phone || "");
      const nextPhoneLinked = cleanPhone ? 1 : Number(matched.phone_linked || 0);
      const existingName = String(matched.name || "");
      const nextName =
        cleanName && (existingName === "Khách hàng Zalo" || !matched.business_name)
          ? cleanName
          : existingName || cleanName || "Khách hàng Zalo";

      db.prepare(
        `UPDATE customers
         SET zalo_id = COALESCE(?, zalo_id),
             name = ?,
             avatar_url = COALESCE(NULLIF(?, ''), avatar_url),
             phone = ?,
             phone_linked = ?,
             zalo_logged_in = 1,
             updated_at = ?
         WHERE id = ?`
      ).run(cleanZaloId, nextName, cleanAvatar, nextPhone, nextPhoneLinked, ts, targetId);
    } else {
      if (cleanZaloId && targetId.startsWith("cust-zmp-")) {
        targetId = `zalo-${cleanZaloId}`;
      }
      db.prepare(
        `INSERT INTO customers (
          id, zalo_id, name, avatar_url, phone, customer_tier,
          loyalty_points, phone_linked, zalo_logged_in, welcome_bonus_claimed, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'retail', 0, ?, 1, 0, ?, ?)`
      ).run(
        targetId,
        cleanZaloId,
        cleanName || "Thành viên Zalo",
        cleanAvatar,
        cleanPhone,
        cleanPhone ? 1 : 0,
        ts,
        ts
      );
    }

    const currentRow = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(targetId) as Record<string, unknown>;

    if (Number(currentRow.welcome_bonus_claimed || 0) === 0) {
      welcomeBonusGranted = 50;
      db.prepare(`UPDATE customers SET welcome_bonus_claimed = 1 WHERE id = ?`).run(
        targetId
      );
      recordLoyaltyTransaction({
        customerId: targetId,
        txType: "welcome",
        pointsChange: welcomeBonusGranted,
        title: "Thưởng chào mừng đăng nhập thành viên Zalo lần đầu",
        createdAt: ts,
      });
      db.prepare(
        `INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
         VALUES (?, ?, 'promo', ?, ?, '/profile?openPoints=1', 0, ?)`
      ).run(
        `noti-welcome-${Date.now()}`,
        targetId,
        "Tặng +50 điểm thành viên Zalo NESPHAR!",
        "Bạn vừa nhận +50 điểm tích lũy (= 50.000đ ưu đãi). Dùng điểm trừ trực tiếp khi đặt hàng tại NESPHAR.",
        ts
      );
    }

    logAudit({
      actorId: targetId,
      actorName: String(cleanName || currentRow.name || "Thành viên Zalo"),
      actorRole: "ZALO_CUSTOMER",
      action: "ZALO_MEMBER_LOGIN",
      entityType: "customer",
      entityId: targetId,
      summary: `Đăng nhập thành viên Zalo Mini App (${cleanPhone || cleanZaloId || targetId})${
        welcomeBonusGranted > 0 ? ` — Cộng +${welcomeBonusGranted} điểm chào mừng` : ""
      }`,
      ipAddress: req.ip,
    });

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Không thể đồng bộ đăng nhập Zalo.",
    });
    return;
  }

  const updated = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(targetId) as Record<string, unknown>;

  res.json({
    ok: true,
    welcomeBonusGranted,
    verifiedByZaloServer,
    customer: serializeCustomer(updated),
    addresses: mapAddressesForCustomer(targetId),
    orders: mapOrdersForCustomer(req, targetId),
    loyaltyHistory: mapLoyaltyHistory(targetId),
  });
});

miniappRouter.post("/profile/sync-phone", miniappWriteLimiter, async (req, res) => {
  const {
    customerId = "",
    zaloId = "",
    phone = "",
    name = "",
    accessToken = "",
    phoneToken = "",
  } = req.body || {};

  let cleanPhone = "";
  let verifiedByZaloServer = false;
  try {
    const resolved = await resolveZaloPhoneFromToken({
      accessToken: String(accessToken),
      phoneToken: String(phoneToken),
      fallbackPhone: String(phone),
    });
    cleanPhone = resolved.phone;
    verifiedByZaloServer = resolved.verifiedByZaloServer;
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Số điện thoại liên kết không hợp lệ.",
    });
    return;
  }

  if (!cleanPhone || cleanPhone.length < 9) {
    res.status(400).json({ error: "Số điện thoại liên kết không hợp lệ." });
    return;
  }

  const cleanZaloId = String(zaloId || "").trim().slice(0, 80) || null;

  // Check if phone matches an existing verified CRM B2B/B2C customer first
  const matchedByPhone = db
    .prepare(`SELECT * FROM customers WHERE phone = ?`)
    .get(cleanPhone) as Record<string, unknown> | undefined;

  let targetId = String(customerId || "").trim() || `cust-${Date.now()}`;
  if (matchedByPhone) {
    targetId = String(matchedByPhone.id);
    db.prepare(
      `UPDATE customers
       SET phone_linked = 1,
           zalo_id = COALESCE(?, zalo_id),
           updated_at = ?
       WHERE id = ?`
    ).run(cleanZaloId, nowIsoLocal(), targetId);
  } else {
    const existingById = db
      .prepare(`SELECT * FROM customers WHERE id = ?`)
      .get(targetId) as Record<string, unknown> | undefined;
    if (existingById) {
      db.prepare(
        `UPDATE customers
         SET phone = ?,
             zalo_id = COALESCE(?, zalo_id),
             name = COALESCE(NULLIF(?, ''), name),
             phone_linked = 1,
             updated_at = ?
         WHERE id = ?`
      ).run(cleanPhone, cleanZaloId, String(name).trim().slice(0, 120), nowIsoLocal(), targetId);
    } else {
      const ts = nowIsoLocal();
      db.prepare(
        `INSERT INTO customers (id, zalo_id, name, phone, customer_tier, loyalty_points, phone_linked, zalo_logged_in, welcome_bonus_claimed, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'retail', 0, 1, 1, 1, ?, ?)`
      ).run(
        targetId,
        cleanZaloId,
        String(name || "Khách hàng Zalo").trim().slice(0, 120),
        cleanPhone,
        ts,
        ts
      );
      recordLoyaltyTransaction({
        customerId: targetId,
        txType: "welcome",
        pointsChange: 50,
        title: "Thưởng liên kết SĐT thành viên Zalo lần đầu",
        createdAt: ts,
      });
    }
  }

  const updated = db
    .prepare(`SELECT * FROM customers WHERE id = ?`)
    .get(targetId) as Record<string, unknown>;

  res.json({
    verifiedByZaloServer,
    customer: serializeCustomer(updated),
    addresses: mapAddressesForCustomer(targetId),
    orders: mapOrdersForCustomer(req, targetId),
    loyaltyHistory: mapLoyaltyHistory(targetId),
  });
});

miniappRouter.put("/profile", miniappWriteLimiter, (req, res) => {
  const { customerId = "", zaloId = "", name, phone, customerTier } = req.body || {};
  const existing = ensureCustomerRow({
    customerId: String(customerId || `cust-${Date.now()}`),
    zaloId: String(zaloId || ""),
    name: name ? String(name) : undefined,
    phone: phone ? String(phone) : undefined,
  });
  const effectiveId = String(existing.id);

  const nextName =
    name !== undefined ? String(name).trim().slice(0, 120) : String(existing.name);
  const nextPhone =
    phone !== undefined ? normalizePhone(String(phone)).slice(0, 16) : String(existing.phone);
  const allowDemoTierSwitch = process.env.ALLOW_DEMO_TIER_SWITCH !== "false";
  const allowedTiers = ["retail", "clinic", "pharmacy", "distributor"];
  const nextTier =
    allowDemoTierSwitch && customerTier && allowedTiers.includes(String(customerTier))
      ? String(customerTier)
      : String(existing.customer_tier);

  db.prepare(
    `UPDATE customers SET name = ?, phone = ?, customer_tier = ?, updated_at = ? WHERE id = ?`
  ).run(nextName, nextPhone, nextTier, nowIsoLocal(), effectiveId);

  res.json({ ok: true, customerId: effectiveId });
});

miniappRouter.post("/addresses", miniappWriteLimiter, (req, res) => {
  const {
    customerId = "",
    zaloId = "",
    recipientName,
    phone,
    street,
    ward,
    district,
    province,
    tag = "Nhà riêng",
    isDefault = false,
  } = req.body || {};

  if (!recipientName || !phone || !street) {
    res.status(400).json({ error: "Vui lòng nhập đầy đủ người nhận, số điện thoại và địa chỉ." });
    return;
  }

  const cust = ensureCustomerRow({
    customerId: String(customerId || `cust-${Date.now()}`),
    zaloId: String(zaloId || ""),
    name: String(recipientName),
    phone: String(phone),
  });
  const effectiveCustId = String(cust.id);

  const id = `addr-${Date.now()}`;
  if (isDefault) {
    db.prepare(`UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`).run(
      effectiveCustId
    );
  }
  db.prepare(
    `INSERT INTO customer_addresses
      (id, customer_id, recipient_name, phone, street, ward, district, province, tag, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    effectiveCustId,
    String(recipientName).trim(),
    normalizePhone(String(phone)),
    String(street).trim(),
    String(ward || "").trim(),
    String(district || "").trim(),
    String(province || "Tỉnh Hà Tĩnh").trim(),
    String(tag),
    isDefault ? 1 : 0
  );

  res.status(201).json({
    addresses: mapAddressesForCustomer(effectiveCustId),
    createdId: id,
    customerId: effectiveCustId,
  });
});

miniappRouter.put("/addresses/:id", miniappWriteLimiter, (req, res) => {
  const addrId = String(req.params.id);
  const {
    customerId = "cust-man",
    recipientName,
    phone,
    street,
    ward,
    district,
    province,
    tag,
    isDefault,
  } = req.body || {};

  if (isDefault) {
    db.prepare(`UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?`).run(
      String(customerId)
    );
  }

  db.prepare(
    `UPDATE customer_addresses
     SET recipient_name = COALESCE(?, recipient_name),
         phone = COALESCE(?, phone),
         street = COALESCE(?, street),
         ward = COALESCE(?, ward),
         district = COALESCE(?, district),
         province = COALESCE(?, province),
         tag = COALESCE(?, tag),
         is_default = COALESCE(?, is_default)
     WHERE id = ? AND customer_id = ?`
  ).run(
    recipientName ?? null,
    phone ? normalizePhone(String(phone)) : null,
    street ?? null,
    ward ?? null,
    district ?? null,
    province ?? null,
    tag ?? null,
    isDefault !== undefined ? (isDefault ? 1 : 0) : null,
    addrId,
    String(customerId)
  );

  res.json({ addresses: mapAddressesForCustomer(String(customerId)) });
});

miniappRouter.delete("/addresses/:id", miniappWriteLimiter, (req, res) => {
  const addrId = String(req.params.id);
  const customerId = String(req.query.customerId || "cust-man");
  db.prepare(`DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?`).run(
    addrId,
    customerId
  );
  res.json({ addresses: mapAddressesForCustomer(customerId) });
});

miniappRouter.post("/orders", miniappWriteLimiter, (req, res) => {
  const {
    customerId = "cust-man",
    items = [],
    address,
    voucherCode,
    redeemPoints = 0,
    paymentMethod = "cod",
    note = "",
    customerTier = "retail",
  } = req.body || {};

  if (!Array.isArray(items) || items.length === 0 || items.length > 50) {
    res.status(400).json({
      error: "Số lượng dòng sản phẩm không hợp lệ (tối thiểu 1, tối đa 50 mã/đơn).",
    });
    return;
  }
  if (!address || !address.recipientName || !address.phone) {
    res.status(400).json({ error: "Vui lòng chọn địa chỉ giao hàng hợp lệ." });
    return;
  }

  const customer = ensureCustomerRow({
    customerId: String(customerId || `cust-${Date.now()}`),
    zaloId: String(req.body?.zaloId || ""),
    name: String(address.recipientName),
    phone: String(address.phone),
  });

  const effectiveCustomerId = String(customer.id);
  const effectiveCustomerName = String(
    customer.business_name || customer.name || address.recipientName
  );
  const effectiveTier = String(customer.customer_tier || "retail");

  const tierSetting = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'tier_discounts'`)
    .get() as { value_json: string } | undefined;
  const tagSetting = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'product_tags'`)
    .get() as { value_json: string } | undefined;
  const tierDiscounts = tierSetting
    ? safeJsonParse<Record<string, number>>(tierSetting.value_json, {
        retail: 0,
        clinic: 8,
        pharmacy: 12,
        distributor: 18,
      })
    : { retail: 0, clinic: 8, pharmacy: 12, distributor: 18 };

  const orderId = `ord-${Date.now()}`;
  const orderCode = String(Math.floor(1462200 + (Date.now() % 800000))).padStart(11, "0");
  const ts = nowIsoLocal();

  db.exec("BEGIN");
  try {
    let subtotal = 0;
    const preparedItems: Array<{
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

    for (const rawItem of items) {
      const prod = db
        .prepare(`SELECT * FROM products WHERE id = ? AND is_visible = 1`)
        .get(String(rawItem.productId)) as Record<string, unknown> | undefined;
      if (!prod) {
        throw new Error(
          `Sản phẩm mã ${rawItem.productId} không tồn tại hoặc đang tạm ngưng kinh doanh.`
        );
      }

      const prodTags = safeJsonParse<string[]>(String(prod.tags_json || "[]"), []);
      const isRxProd = Boolean(prod.is_prescription) || prodTags.includes("nhom-thuoc-ke-don");
      if (isRxProd && effectiveTier === "retail") {
        throw new Error(
          `"${prod.name}" là Thuốc kê đơn (Rx) — khách hàng cá nhân vui lòng bấm Tư vấn Dược sĩ để gửi đơn thuốc. Đặt sỉ trực tuyến chỉ áp dụng cho Nhà thuốc / Phòng khám có giấy phép GPP.`
        );
      }

      const unitOptions = safeJsonParse<
        Array<{
          id: string;
          unitName: string;
          specificationLabel: string;
          multiplier: number;
          extraSavePercent?: number;
        }>
      >(String(prod.unit_options_json || "[]"), []);
      const chosenOpt =
        unitOptions.find((u) => u.id === rawItem.unitOptionId) ||
        unitOptions.find((u) => u.unitName === rawItem.unitName) ||
        unitOptions[0] || {
          id: "u-default",
          unitName: String(prod.base_unit || "Hộp"),
          specificationLabel: String(prod.specification || "Tiêu chuẩn"),
          multiplier: 1,
        };

      const rawQty = Math.round(Number(rawItem.quantity || 0));
      if (!Number.isFinite(rawQty) || rawQty < 1 || rawQty > 500) {
        throw new Error(`Số lượng đặt của "${prod.name}" không hợp lệ (1–500).`);
      }
      const qty = rawQty;
      const mult = Number(chosenOpt.multiplier || 1);
      const tierPct =
        customer && customer.custom_discount_percent !== null
          ? Number(customer.custom_discount_percent)
          : Number(tierDiscounts[effectiveTier] || 0);
      const volumeTiers = safeJsonParse<VolumePriceTier[]>(
        String(prod.volume_tiers_json || "[]"),
        []
      );

      // SECURITY: Always enforce server-authoritative volume + B2B tier price
      const unitPrice = computeVolumeAwareUnitPrice({
        retailPrice: Number(prod.retail_price),
        volumeTiers,
        multiplier: mult,
        extraSavePercent: chosenOpt.extraSavePercent ? Number(chosenOpt.extraSavePercent) : 0,
        customerDiscountPercent: tierPct,
        quantity: qty,
      });

      const baseQtyRequired = Math.max(1, Math.ceil(qty * mult));

      const allocations = allocateBatchesFEFO({
        productId: String(prod.id),
        productName: String(prod.name),
        requiredBaseQty: baseQtyRequired,
        orderCode,
        performedBy: "Zalo Mini App (FEFO)",
      });

      db.prepare(`UPDATE products SET sold_count = sold_count + ?, updated_at = ? WHERE id = ?`).run(
        baseQtyRequired,
        ts,
        String(prod.id)
      );

      subtotal += unitPrice * qty;
      preparedItems.push({
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

    let discountAmount = 0;
    let appliedVoucherCode: string | null = null;
    if (voucherCode) {
      const candidateVoucher = db
        .prepare(
          `SELECT * FROM vouchers
           WHERE code = ? AND is_active = 1 AND used_count < usage_limit`
        )
        .get(String(voucherCode).trim().toUpperCase()) as
        | Record<string, unknown>
        | undefined;
      const vRow =
        candidateVoucher &&
        isVoucherNotExpired(String(candidateVoucher.expiry_date || ""), todayDateOnly())
          ? candidateVoucher
          : undefined;
      if (vRow && subtotal >= Number(vRow.min_order_value)) {
        appliedVoucherCode = String(vRow.code);
        if (String(vRow.discount_type) === "fixed") {
          discountAmount = Number(vRow.discount_value);
        } else {
          const rawDisc = Math.round((subtotal * Number(vRow.discount_value)) / 100);
          discountAmount =
            vRow.max_discount !== null
              ? Math.min(rawDisc, Number(vRow.max_discount))
              : rawDisc;
        }
        db.prepare(`UPDATE vouchers SET used_count = used_count + 1 WHERE id = ?`).run(
          String(vRow.id)
        );
      }
    }

    let shippingFee = subtotal >= 250000 ? 0 : 25000;
    if (appliedVoucherCode === "FREESHIPHT" && subtotal >= 150000) {
      shippingFee = 0;
      discountAmount = 0;
    }

    // Server-authoritative Loyalty Points Redemption (1 điểm = 1.000đ, max 50% after-voucher subtotal)
    const freshCust = db
      .prepare(`SELECT loyalty_points FROM customers WHERE id = ?`)
      .get(effectiveCustomerId) as { loyalty_points: number } | undefined;
    const availablePoints = Math.max(0, Number(freshCust?.loyalty_points || 0));
    const afterVoucherSubtotal = Math.max(0, subtotal - discountAmount);
    const maxOrderRedeemPoints = Math.floor((afterVoucherSubtotal * 0.5) / 1000);
    const requestedRedeemPoints = Math.max(0, Math.floor(Number(redeemPoints || 0)));
    const actualPointsRedeemed = Math.min(
      requestedRedeemPoints,
      availablePoints,
      maxOrderRedeemPoints
    );
    const pointsDiscount = actualPointsRedeemed * 1000;
    const totalDiscountAmount = discountAmount + pointsDiscount;

    const totalAmount = Math.max(0, subtotal - totalDiscountAmount + shippingFee);
    const earnedPoints = Math.max(1, Math.floor(totalAmount / 10000));

    const allowedMethods = ["cod", "vietqr", "bank_transfer", "zalopay"];
    const safePayMethod = allowedMethods.includes(String(paymentMethod))
      ? String(paymentMethod)
      : "cod";

    db.prepare(`
      INSERT INTO orders (
        id, code, customer_id, customer_name, customer_tier_snapshot, status, return_status,
        subtotal, discount_amount, points_redeemed, points_discount, points_earned,
        shipping_fee, total_amount, voucher_code,
        payment_method, payment_status, shipping_carrier, tracking_code, address_json,
        note, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', 'none', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid', 'NESPHAR Express', '', ?, ?, 'zalo_mini_app', ?, ?)
    `).run(
      orderId,
      orderCode,
      effectiveCustomerId,
      effectiveCustomerName,
      effectiveTier,
      subtotal,
      totalDiscountAmount,
      actualPointsRedeemed,
      pointsDiscount,
      earnedPoints,
      shippingFee,
      totalAmount,
      appliedVoucherCode,
      safePayMethod,
      JSON.stringify(address),
      String(note || "").trim().slice(0, 500),
      ts,
      ts
    );

    const insertItem = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, sku, name, image, unit_name, specification_label,
        unit_multiplier, unit_price, quantity, base_qty_deducted, allocations_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    preparedItems.forEach((it, idx) => {
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

    if (actualPointsRedeemed > 0) {
      recordLoyaltyTransaction({
        customerId: effectiveCustomerId,
        txType: "redeem",
        pointsChange: -actualPointsRedeemed,
        title: `Đổi ${actualPointsRedeemed} điểm giảm ${pointsDiscount.toLocaleString("vi-VN")}đ cho đơn #${orderCode}`,
        orderCode,
        createdAt: ts,
      });
    }

    const newLoyaltyBalance = recordLoyaltyTransaction({
      customerId: effectiveCustomerId,
      txType: "earn",
      pointsChange: earnedPoints,
      title: `Tích điểm đơn hàng #${orderCode} (${totalAmount.toLocaleString("vi-VN")}đ)`,
      orderCode,
      createdAt: ts,
    });

    db.prepare(
      `INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
       VALUES (?, ?, 'order', ?, ?, '/orders', 0, ?)`
    ).run(
      `noti-${Date.now()}`,
      effectiveCustomerId,
      `Đặt hàng thành công #${orderCode}`,
      `Dược sĩ NESPHAR đã tiếp nhận đơn hàng ${totalAmount.toLocaleString("vi-VN")}đ${
        actualPointsRedeemed > 0 ? ` (đã giảm ${pointsDiscount.toLocaleString("vi-VN")}đ từ điểm)` : ""
      } và cộng +${earnedPoints} điểm tích lũy.`,
      ts
    );

    logAudit({
      actorId: effectiveCustomerId,
      actorName: effectiveCustomerName,
      actorRole: "ZALO_CUSTOMER",
      action: "CREATE_ORDER_MINIAPP",
      entityType: "order",
      entityId: orderId,
      summary: `Đơn hàng mới #${orderCode} từ Zalo Mini App (${totalAmount.toLocaleString("vi-VN")}đ – đổi ${actualPointsRedeemed} điểm, tích +${earnedPoints} điểm)`,
      diff: {
        orderCode,
        totalAmount,
        itemCount: preparedItems.length,
        pointsRedeemed: actualPointsRedeemed,
        pointsEarned: earnedPoints,
      },
      ipAddress: req.ip,
    });

    db.exec("COMMIT");

    dispatchOperationalAlert(
      "NEW_ORDER",
      [
        `[ĐƠN HÀNG MỚI ZALO MINI APP] #${orderCode}`,
        `Khách hàng: ${effectiveCustomerName} (${address.phone})`,
        `Hạng giá: ${effectiveTier.toUpperCase()}`,
        `Thanh toán: ${safePayMethod.toUpperCase()} — Tổng: ${totalAmount.toLocaleString("vi-VN")}đ`,
        `Sản phẩm & Lô xuất FEFO:`,
        ...preparedItems.map(
          (it) =>
            `  - [${it.sku}] ${it.name} (${it.unitName} x${it.quantity}) -> Lô: ${it.allocations
              .map((a) => `${a.batchCode} (${a.qty})`)
              .join(", ")}`
        ),
      ],
      {
        orderId,
        orderCode,
        customerName: effectiveCustomerName,
        phone: address.phone,
        totalAmount,
        paymentMethod: safePayMethod,
      }
    );

    const orders = mapOrdersForCustomer(req, effectiveCustomerId);
    const createdOrder = orders.find((o) => o.id === orderId) || orders[0];
    res.status(201).json({
      order: createdOrder,
      earnedPoints,
      redeemedPoints: actualPointsRedeemed,
      pointsDiscount,
      newLoyaltyBalance,
      loyaltyHistory: mapLoyaltyHistory(effectiveCustomerId),
      customerId: effectiveCustomerId,
    });
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(400).json({
      error: err instanceof Error ? err.message : "Không thể khởi tạo đơn hàng.",
    });
  }
});

miniappRouter.post("/orders/:id/cancel", miniappWriteLimiter, (req, res) => {
  const orderId = String(req.params.id);
  const {
    customerId = "",
    reason = "Khách chủ động hủy đơn trên Mini App",
  } = req.body || {};

  const order = db
    .prepare(`SELECT * FROM orders WHERE id = ? OR code = ?`)
    .get(orderId, orderId) as Record<string, unknown> | undefined;

  if (!order) {
    res.status(404).json({ error: "Không tìm thấy đơn hàng." });
    return;
  }
  if (customerId && String(order.customer_id) !== String(customerId)) {
    res.status(403).json({ error: "Bạn không có quyền hủy đơn hàng của tài khoản khác." });
    return;
  }
  if (String(order.status) !== "pending") {
    res.status(400).json({
      error: "Chỉ có thể hủy trực tiếp đơn hàng đang ở trạng thái Chờ xác nhận.",
    });
    return;
  }

  const items = db
    .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
    .all(String(order.id)) as Array<Record<string, unknown>>;

  const ts = nowIsoLocal();
  db.exec("BEGIN");
  try {
    for (const it of items) {
      const allocations = safeJsonParse<BatchAllocation[]>(
        String(it.allocations_json || "[]"),
        []
      );
      restoreBatchesFromOrder({
        productId: String(it.product_id),
        productName: String(it.name),
        allocations,
        orderCode: String(order.code),
        movementType: "ORDER_RETURN",
        notePrefix: "Hoàn tồn lô do khách hủy đơn",
        performedBy: "Zalo Mini App",
      });
      const baseDeducted = Number(it.base_qty_deducted || it.quantity || 0);
      if (baseDeducted > 0) {
        db.prepare(
          `UPDATE products SET sold_count = MAX(0, sold_count - ?), updated_at = ? WHERE id = ?`
        ).run(baseDeducted, ts, String(it.product_id));
      }
    }

    if (order.voucher_code) {
      db.prepare(
        `UPDATE vouchers SET used_count = MAX(0, used_count - 1) WHERE code = ?`
      ).run(String(order.voucher_code));
    }

    db.prepare(
      `UPDATE orders SET status = 'cancelled', return_status = 'returned', return_reason = ?, updated_at = ? WHERE id = ?`
    ).run(String(reason), ts, String(order.id));

    revertOrderLoyaltyIfNeeded(String(order.id));

    logAudit({
      actorId: String(order.customer_id),
      actorName: String(order.customer_name),
      actorRole: "ZALO_CUSTOMER",
      action: "CANCEL_ORDER_MINIAPP",
      entityType: "order",
      entityId: String(order.id),
      summary: `Khách hủy đơn #${order.code} trên Mini App – tự động cộng hoàn tồn các lô FEFO & cân đối lại điểm tích lũy`,
      diff: { status: { from: "pending", to: "cancelled" }, reason },
      ipAddress: req.ip,
    });

    db.exec("COMMIT");

    const updatedCust = db
      .prepare(`SELECT loyalty_points FROM customers WHERE id = ?`)
      .get(String(order.customer_id)) as { loyalty_points: number } | undefined;

    res.json({
      ok: true,
      loyaltyPoints: Number(updatedCust?.loyalty_points || 0),
      loyaltyHistory: mapLoyaltyHistory(String(order.customer_id)),
      orders: mapOrdersForCustomer(req, String(order.customer_id)),
    });
  } catch (err) {
    db.exec("ROLLBACK");
    res.status(500).json({
      error: err instanceof Error ? err.message : "Lỗi khi hủy đơn hàng.",
    });
  }
});

miniappRouter.post("/support-tickets", miniappWriteLimiter, (req, res) => {
  const {
    customerId = null,
    customerName = "",
    phone = "",
    topic = "tu-van",
    content = "",
    message = "",
  } = req.body || {};

  const finalContent = String(content || message || "").trim().slice(0, 2000);
  const finalPhone = normalizePhone(String(phone || "")).slice(0, 16);
  const finalName = String(customerName || "Khách hàng Zalo").trim().slice(0, 120);

  if (!finalName || !finalPhone || !finalContent) {
    res.status(400).json({ error: "Vui lòng điền họ tên, số điện thoại và nội dung cần hỗ trợ." });
    return;
  }

  const rawTopic = String(topic || "tu-van").trim();
  let safeTopic = "tu-van";
  if (rawTopic === "bao-gia-si" || rawTopic.toLowerCase().includes("sỉ")) {
    safeTopic = "bao-gia-si";
  } else if (rawTopic === "gop-y" || rawTopic.toLowerCase().includes("góp ý")) {
    safeTopic = "gop-y";
  }

  const id = `tkt-${Date.now()}`;
  const ts = nowIsoLocal();

  db.prepare(
    `INSERT INTO support_tickets
      (id, customer_id, customer_name, phone, topic, content, status, staff_reply, replied_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'open', '', '', ?, ?)`
  ).run(
    id,
    customerId ? String(customerId) : null,
    finalName,
    finalPhone,
    safeTopic,
    finalContent,
    ts,
    ts
  );

  logAudit({
    actorId: String(customerId || "guest"),
    actorName: finalName,
    actorRole: "ZALO_CUSTOMER",
    action: "SUBMIT_SUPPORT_TICKET",
    entityType: "support_ticket",
    entityId: id,
    summary: `Yêu cầu hỗ trợ mới (${safeTopic}) từ ${finalName} - SĐT ${finalPhone}`,
    ipAddress: req.ip,
  });

  dispatchOperationalAlert(
    "NEW_TICKET",
    [
      `[YÊU CẦU TƯ VẤN DƯỢC SĨ MỚI]`,
      `Khách hàng: ${finalName} — SĐT: ${finalPhone}`,
      `Chủ đề: ${
        safeTopic === "bao-gia-si"
          ? "Đăng ký mở tài khoản Giá Sỉ B2B"
          : safeTopic === "gop-y"
            ? "Góp ý dịch vụ"
            : "Tư vấn sản phẩm Dược"
      }`,
      `Nội dung: ${finalContent}`,
    ],
    { ticketId: id, customerName: finalName, phone: finalPhone, topic: safeTopic, content: finalContent }
  );

  res.status(201).json({ ok: true, id, ticketId: id, createdAt: ts });
});

miniappRouter.post("/notifications/:id/read", (req, res) => {
  const notiId = String(req.params.id);
  const customerId = String(req.body?.customerId || "cust-man");
  db.prepare(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND customer_id = ?`
  ).run(notiId, customerId);
  res.json({ ok: true });
});

miniappRouter.post("/notifications/read-all", (req, res) => {
  const { customerId = "cust-man" } = req.body || {};
  db.prepare(
    `UPDATE notifications SET is_read = 1 WHERE customer_id = ?`
  ).run(String(customerId));
  res.json({ ok: true });
});
