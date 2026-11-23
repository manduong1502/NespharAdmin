import fs from "node:fs";
import path from "node:path";
import { db, UPLOADS_DIR } from "./database";
import { ROLE_DEFAULT_PERMISSIONS } from "../middleware/auth";
import { hashPassword } from "../utils/security";

interface RealCatalogBatch {
  batchCode: string;
  mfgDate: string;
  expDate: string;
  qty: number;
  costPrice: number;
  shelfLocation: string;
}

interface RealCatalogProduct {
  id: string;
  sku: string;
  name: string;
  categoryId: string;
  tags: string[];
  isPrescription: boolean;
  promoBadge: string;
  volumeTiers: Array<{
    minQty: number;
    maxQty: number | null;
    unitPrice: number;
    label: string;
  }>;
  brand: string;
  manufacturer: string;
  supplier: string;
  origin: string;
  registrationNo: string;
  baseUnit: string;
  specification: string;
  costPrice: number;
  retailPrice: number;
  originalPrice: number;
  imageFile: string;
  isNew: boolean;
  isBestSeller: boolean;
  isFlashPromo: boolean;
  soldCount: number;
  shortSummary: string;
  ingredients: string;
  benefits: string[];
  dosage: string;
  targetUsers: string;
  storageNote: string;
  disclaimer: string;
  unitOptions: Array<{
    id: string;
    unitName: string;
    specificationLabel: string;
    multiplier: number;
    extraSavePercent?: number;
  }>;
  batches: RealCatalogBatch[];
}

interface RealCatalogDataset {
  categories: Array<{
    id: string;
    name: string;
    shortName: string;
    iconKey: string;
    description: string;
    sortOrder: number;
  }>;
  productTags: Array<{
    id: string;
    name: string;
    shortName: string;
    iconKey: string;
    description: string;
  }>;
  products: RealCatalogProduct[];
}

function loadRealCatalogDataset(): RealCatalogDataset {
  const candidates = [
    path.resolve(__dirname, "../../assets/realCatalogData.json"),
    path.resolve(__dirname, "./realCatalogData.json"),
    path.resolve(__dirname, "../../src/db/realCatalogData.json"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return JSON.parse(fs.readFileSync(p, "utf8")) as RealCatalogDataset;
    }
  }
  throw new Error("Missing realCatalogData.json in backend assets/db");
}

function formatDateOffset(daysOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTimeOffset(daysOffset: number, timeStr = "09:30:00"): string {
  return `${formatDateOffset(daysOffset)} ${timeStr}`;
}

function buildMinimalPdfBuffer(lines: string[]): Buffer {
  const safeLines = lines.map((l) =>
    l
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[()\\]/g, "")
  );

  const textOps = [
    "BT",
    "/F1 16 Tf",
    "50 760 Td",
    `(${safeLines[0] || "CONG TY TNHH DUOC PHAM NESPHAR"}) Tj`,
    "/F1 11 Tf",
  ];
  for (let i = 1; i < safeLines.length; i += 1) {
    textOps.push("0 -22 Td");
    textOps.push(`(${safeLines[i]}) Tj`);
  }
  textOps.push("ET");
  const streamContent = textOps.join("\n");

  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
    `5 0 obj\n<< /Length ${Buffer.byteLength(streamContent, "utf8")} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += obj;
  }
  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "utf8");
}

function copyDirFilesIfMissing(srcDir: string, destDir: string): void {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDirFilesIfMissing(srcPath, dstPath);
    } else if (!fs.existsSync(dstPath)) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function ensureMediaAndDocs(): void {
  const mediaTarget = path.join(UPLOADS_DIR, "media");
  fs.mkdirSync(mediaTarget, { recursive: true });

  const baseMediaCandidates = [
    path.resolve(__dirname, "../../assets/media"),
    path.resolve(__dirname, "../../../mini-app/src/static/images"),
  ];
  for (const srcDir of baseMediaCandidates) {
    if (fs.existsSync(srcDir)) {
      copyDirFilesIfMissing(srcDir, mediaTarget);
      break;
    }
  }

  const catalogMediaCandidates = [
    path.resolve(__dirname, "../../assets/media/catalog"),
    path.resolve(__dirname, "../../../mini-app/src/static/catalog"),
  ];
  for (const srcCat of catalogMediaCandidates) {
    if (fs.existsSync(srcCat)) {
      copyDirFilesIfMissing(srcCat, path.join(mediaTarget, "catalog"));
      break;
    }
  }

  const docsTarget = path.join(UPLOADS_DIR, "docs");
  fs.mkdirSync(docsTarget, { recursive: true });

  const genericDocs: Array<{ fileName: string; regNo: string; supplier: string }> = [
    {
      fileName: "HoSoCongBo-BioCare-DKSP.pdf",
      regNo: "2401/2025/DKSP",
      supplier: "Cong ty BioCare (TPBVSK Nhap khau USA / Italy / Turkey)",
    },
    {
      fileName: "HoSoCongBo-AnThien-GMP.pdf",
      regNo: "VD-31001-24",
      supplier: "Cong ty CP Duoc pham An Thien (Chuan GMP-WHO)",
    },
    {
      fileName: "HoSoCongBo-Dapharco-BYT.pdf",
      regNo: "DPC-202601/BYT",
      supplier: "Cong ty CP Duoc - Thiet bi Y te Da Nang (Dapharco)",
    },
  ];

  for (const doc of genericDocs) {
    const filePath = path.join(docsTarget, doc.fileName);
    if (!fs.existsSync(filePath)) {
      const pdfBuf = buildMinimalPdfBuffer([
        "HO SO PHAP LY & CONG BO LUU HANH SAN PHAM - NESPHAR",
        "------------------------------------------------------------",
        "Don vi phan phoi: CONG TY TNHH DUOC PHAM NESPHAR",
        "Ma so doanh nghiep (MST): 3002297464",
        "Dia chi: So 90 Duong Ha Hoang, P. Tran Phu, Tinh Ha Tinh",
        "Nguoi dai dien phap luat: Ba Nguyen Thi Huong - Giam doc",
        "------------------------------------------------------------",
        `Nha cung cap / Hang san xuat: ${doc.supplier}`,
        `So Dang ky / Ho so tham chieu: ${doc.regNo}`,
        "Tieu chuan bao quan kho: GSP / GDP - Kiem soat So lo & HSD (FEFO)",
        "Hotline Duoc si phu trach chuyen mon: 0926.090.668 - 0978.420.766",
      ]);
      fs.writeFileSync(filePath, pdfBuf);
    }
  }
}

function resolveDocForCategory(categoryId: string): { url: string; name: string } {
  if (categoryId === "cty-biocare") {
    return {
      url: "/uploads/docs/HoSoCongBo-BioCare-DKSP.pdf",
      name: "HoSoCongBo-BioCare-DKSP.pdf",
    };
  }
  if (categoryId === "cty-an-thien") {
    return {
      url: "/uploads/docs/HoSoCongBo-AnThien-GMP.pdf",
      name: "HoSoCongBo-AnThien-GMP.pdf",
    };
  }
  return {
    url: "/uploads/docs/HoSoCongBo-Dapharco-BYT.pdf",
    name: "HoSoCongBo-Dapharco-BYT.pdf",
  };
}

function resolveFallbackImageForCategory(categoryId: string): string {
  if (categoryId === "cty-biocare") return "/uploads/media/prod-omega.jpg";
  if (categoryId === "cty-an-thien") return "/uploads/media/prod-kids-syrup.jpg";
  return "/uploads/media/prod-medical-kit.jpg";
}

function populateCatalogAndSampleOrders(dataset: RealCatalogDataset, createdNow: string): void {
  // 1. Save official 5 Multi-Tags definition in system_settings
  db.prepare(`
    INSERT INTO system_settings (key, value_json)
    VALUES ('product_tags', ?)
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json
  `).run(JSON.stringify(dataset.productTags));

  // 2. Categories (9 Partner Companies)
  const insertCat = db.prepare(`
    INSERT INTO categories (id, name, short_name, icon_key, description, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      short_name = excluded.short_name,
      icon_key = excluded.icon_key,
      description = excluded.description,
      sort_order = excluded.sort_order,
      is_active = 1
  `);
  for (const c of dataset.categories) {
    insertCat.run(c.id, c.name, c.shortName, c.iconKey, c.description, c.sortOrder);
  }

  // 3. Real Products (367 items from BioCare, An Thiên, CTKM Dapharco 20.10) + Real GSP/ERP Batches
  const insertProd = db.prepare(`
    INSERT INTO products (
      id, sku, name, category_id, brand, manufacturer, supplier, origin,
      registration_no, declaration_doc_url, declaration_doc_name, base_unit, specification,
      cost_price, retail_price, original_price, min_stock_alert, image_url, gallery_json,
      unit_options_json, allowed_tiers_json, channels_json,
      tags_json, is_prescription, promo_badge, volume_tiers_json,
      is_visible, is_new, is_best_seller, is_flash_promo, has_video_preview, sold_count,
      short_summary, ingredients, benefits_json, dosage, target_users, storage_note, disclaimer, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, '["retail","clinic","pharmacy","distributor"]', '["zalo_mini_app","wholesale_portal"]',
      ?, ?, ?, ?,
      1, ?, ?, ?, 0, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const insertBatch = db.prepare(`
    INSERT INTO inventory_batches (
      id, product_id, batch_code, mfg_date, exp_date, cost_price,
      initial_qty, remaining_qty, shelf_location, supplier_invoice, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
  `);

  const insertMove = db.prepare(`
    INSERT INTO inventory_movements (
      id, batch_id, batch_code, product_id, product_name, movement_type,
      qty_change, balance_after, reference_code, note, performed_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let batchSeq = 1;
  const firstBatchByProdId = new Map<string, { id: string; batchCode: string; expDate: string }>();

  for (const p of dataset.products) {
    const doc = resolveDocForCategory(p.categoryId);
    const imgUrl = p.imageFile
      ? `/uploads/media/catalog/${p.imageFile}`
      : resolveFallbackImageForCategory(p.categoryId);

    insertProd.run(
      p.id,
      p.sku,
      p.name,
      p.categoryId,
      p.brand,
      p.manufacturer,
      p.supplier,
      p.origin,
      p.registrationNo,
      doc.url,
      doc.name,
      p.baseUnit,
      p.specification,
      p.costPrice,
      p.retailPrice,
      p.originalPrice,
      20,
      imgUrl,
      JSON.stringify([imgUrl]),
      JSON.stringify(p.unitOptions),
      JSON.stringify(p.tags || []),
      p.isPrescription ? 1 : 0,
      p.promoBadge || "",
      JSON.stringify(p.volumeTiers || []),
      p.isNew ? 1 : 0,
      p.isBestSeller ? 1 : 0,
      p.isFlashPromo ? 1 : 0,
      p.soldCount,
      p.shortSummary,
      p.ingredients,
      JSON.stringify(p.benefits || []),
      p.dosage,
      p.targetUsers,
      p.storageNote,
      p.disclaimer,
      createdNow
    );

    for (const b of p.batches) {
      const bId = `bat-${p.id}-${batchSeq++}`;
      insertBatch.run(
        bId,
        p.id,
        b.batchCode,
        b.mfgDate,
        b.expDate,
        b.costPrice,
        b.qty,
        b.qty,
        b.shelfLocation,
        `PNK-${p.categoryId.toUpperCase()}-2026`,
        createdNow
      );
      if (!firstBatchByProdId.has(p.id)) {
        firstBatchByProdId.set(p.id, { id: bId, batchCode: b.batchCode, expDate: b.expDate });
      }
      // Log initial stock movement for flagship items to keep movement history crisp & fast
      if (batchSeq <= 60) {
        insertMove.run(
          `mov-init-${bId}`,
          bId,
          b.batchCode,
          p.id,
          p.name,
          "IMPORT",
          b.qty,
          b.qty,
          `PNK-${p.sku}`,
          `Nhập kho chuẩn GSP lô ${b.batchCode} (${p.supplier})`,
          "Trần Quốc Bảo (Thủ kho GSP)",
          createdNow
        );
      }
    }
  }

  // 4. Update Hero Banners to showcase real partner lines
  db.exec(`DELETE FROM banners;`);
  const insertBanner = db.prepare(`
    INSERT INTO banners (id, badge, title, points_json, image_url, cta_link, sort_order, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);
  insertBanner.run(
    "banner-1",
    "BIOCARE NHẬP KHẨU MỸ · Ý",
    "TPBVSK Nhập khẩu — Giá sỉ bậc thang",
    JSON.stringify([
      "33 mã BioCare nhập khẩu Mỹ, Ý, Thổ Nhĩ Kỳ",
      "Giá sỉ tự động: 1–5 · 6–20 · 21+ hộp",
      "Đầy đủ công bố BYT & tư vấn Dược sĩ",
    ]),
    "/uploads/media/hero-banner-1.jpg",
    "/categories?cat=cty-biocare",
    1
  );
  insertBanner.run(
    "banner-2",
    "CTKM DAPHARCO THÁNG 10",
    "Ưu đãi Mua X Tặng Y cho Nhà thuốc & Gia đình",
    JSON.stringify([
      "143 mã Vật tư y tế, Sát khuẩn, Tinh dầu & TPBVSK Dapharco",
      "Khuyến mãi Mua 6 tặng 2, Mua 10 tặng 4 áp dụng toàn tỉnh",
      "Kiểm soát chặt chẽ Số lô & Hạn dùng chuẩn GSP/FEFO",
    ]),
    "/uploads/media/hero-banner-2.jpg",
    "/categories?cat=cty-dapharco",
    2
  );
  insertBanner.run(
    "banner-3",
    "DƯỢC PHẨM AN THIÊN GMP-WHO",
    "191 danh mục Thuốc & Nhi khoa phân loại chuẩn Bộ Y Tế",
    JSON.stringify([
      "Phân tách minh bạch thẻ Thuốc kê đơn (Rx), OTC & Nhi khoa",
      "Freeship đơn sỉ Nhà thuốc/Quầy thuốc từ 1.200.000đ",
      "Hotline Dược sĩ phụ trách: 0926.090.668",
    ]),
    "/uploads/media/prod-bp-monitor.jpg",
    "/categories?cat=cty-an-thien",
    3
  );

  // 5. Reconciled Sample B2B & B2C Orders referencing real products
  const pBio1 = dataset.products.find((x) => x.id === "bio-001") || dataset.products[0];
  const pBio5 = dataset.products.find((x) => x.id === "bio-005") || dataset.products[4];
  const pDp4 = dataset.products.find((x) => x.id === "dp-004") || dataset.products[35];
  const pAt2 = dataset.products.find((x) => x.id === "at-002") || dataset.products[40];

  const addrMan = {
    id: "addr-1",
    recipientName: "Mẫn Nguyễn",
    phone: "0903536849",
    street: "Số 18 Đường Nguyễn Công Trứ",
    ward: "Phường Bắc Hà",
    district: "TP. Hà Tĩnh",
    province: "Tỉnh Hà Tĩnh",
    isDefault: true,
    tag: "Nhà riêng",
  };
  const addrMinhTam = {
    id: "addr-minhtam",
    recipientName: "Nhà thuốc Minh Tâm GPP (DS. Tâm)",
    phone: "0912345678",
    street: "Số 112 Đường Hải Thượng Lãn Ông",
    ward: "Phường Tân Giang",
    district: "TP. Hà Tĩnh",
    province: "Tỉnh Hà Tĩnh",
    isDefault: true,
    tag: "Nhà thuốc / Cơ sở",
  };
  const addrMienTrung = {
    id: "addr-mientrung",
    recipientName: "Kho Dược Miền Trung (Ông Hùng)",
    phone: "0945112233",
    street: "Số 204 Đại lộ Lê Nin",
    ward: "Phường Hà Huy Tập",
    district: "TP. Vinh",
    province: "Tỉnh Nghệ An",
    isDefault: true,
    tag: "Nhà thuốc / Cơ sở",
  };

  const sampleOrders = [
    {
      id: "ord-1",
      code: "00001462087",
      customerId: "cust-man",
      customerName: "Mẫn Nguyễn",
      tier: "retail",
      status: "shipping",
      discount: 30000,
      shipping: 0,
      voucher: "NESPHAR30",
      payMethod: "cod",
      payStatus: "unpaid",
      carrier: "NESPHAR Express Nội Tỉnh",
      tracking: "NSP-HT-88412",
      address: addrMan,
      note: "Giao giờ hành chính, gọi trước 15 phút giúp mình.",
      staffId: "staff-sales",
      dayOffset: 0,
      time: "08:20:44",
      items: [
        { prod: pBio1, qty: 1, price: pBio1.retailPrice },
        { prod: pBio5, qty: 1, price: pBio5.retailPrice },
      ],
    },
    {
      id: "ord-b2b-pending-1",
      code: "00001462109",
      customerId: "cust-minhtam",
      customerName: "Nhà thuốc Minh Tâm GPP",
      tier: "pharmacy",
      status: "pending",
      discount: 150000,
      shipping: 0,
      voucher: "DOITAC5",
      payMethod: "vietqr",
      payStatus: "paid",
      carrier: "Xe tuyến GPP Hà Tĩnh",
      tracking: "",
      address: addrMinhTam,
      note: "Đơn nhập sỉ BioCare mức 6 hộp + Ambroxol An Thiên & Nước lau sàn Dapharco.",
      staffId: "staff-sales",
      dayOffset: 0,
      time: "10:15:20",
      items: [
        { prod: pBio1, qty: 6, price: 454000 },
        { prod: pAt2, qty: 20, price: 24600 },
        { prod: pDp4, qty: 6, price: 140500 },
      ],
    },
    {
      id: "ord-completed-3",
      code: "00001461990",
      customerId: "cust-mientrung",
      customerName: "Công ty TNHH Phân phối Dược Miền Trung",
      tier: "distributor",
      status: "completed",
      discount: 150000,
      shipping: 0,
      voucher: "DOITAC5",
      payMethod: "vietqr",
      payStatus: "paid",
      carrier: "Xe tải lạnh GDP NESPHAR",
      tracking: "GDP-NA-49810",
      address: addrMienTrung,
      note: "Đơn sỉ bậc 21+ hộp dòng BioCare nhập khẩu.",
      staffId: "staff-admin",
      dayOffset: -2,
      time: "15:10:00",
      items: [
        { prod: pBio1, qty: 22, price: 443000 },
        { prod: pBio5, qty: 25, price: 206000 },
      ],
    },
  ];

  const insertOrder = db.prepare(`
    INSERT INTO orders (
      id, code, customer_id, customer_name, customer_tier_snapshot, status, return_status,
      return_reason, subtotal, discount_amount, shipping_fee, total_amount, voucher_code,
      payment_method, payment_status, shipping_carrier, tracking_code, address_json,
      note, handled_by_staff_id, source, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'none', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'zalo_mini_app', ?, ?)
  `);
  const insertOrderItem = db.prepare(`
    INSERT INTO order_items (
      id, order_id, product_id, sku, name, image, unit_name, specification_label,
      unit_multiplier, unit_price, quantity, base_qty_deducted, allocations_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
  `);

  for (const o of sampleOrders) {
    const subtotal = o.items.reduce((s, it) => s + it.price * it.qty, 0);
    const totalAmount = Math.max(0, subtotal - o.discount + o.shipping);
    const ts = formatDateTimeOffset(o.dayOffset, o.time);

    insertOrder.run(
      o.id,
      o.code,
      o.customerId,
      o.customerName,
      o.tier,
      o.status,
      subtotal,
      o.discount,
      o.shipping,
      totalAmount,
      o.voucher,
      o.payMethod,
      o.payStatus,
      o.carrier,
      o.tracking,
      JSON.stringify(o.address),
      o.note,
      o.staffId,
      ts,
      ts
    );

    o.items.forEach((it, idx) => {
      const bInfo = firstBatchByProdId.get(it.prod.id) || {
        id: "bat-default",
        batchCode: "LOT2026",
        expDate: "2029-02-14",
      };
      const imgUrl = it.prod.imageFile
        ? `/uploads/media/catalog/${it.prod.imageFile}`
        : resolveFallbackImageForCategory(it.prod.categoryId);

      insertOrderItem.run(
        `oi-${o.id}-${idx + 1}`,
        o.id,
        it.prod.id,
        it.prod.sku,
        it.prod.name,
        imgUrl,
        it.prod.baseUnit,
        it.prod.specification,
        it.price,
        it.qty,
        it.qty,
        JSON.stringify([
          {
            batchId: bInfo.id,
            batchCode: bInfo.batchCode,
            expDate: bInfo.expDate,
            qty: it.qty,
          },
        ])
      );
    });
  }
}

export function seedInitialData(): void {
  ensureMediaAndDocs();
  const dataset = loadRealCatalogDataset();
  const createdNow = formatDateTimeOffset(-14, "08:00:00");

  const existingStaff = db
    .prepare(`SELECT COUNT(*) AS cnt FROM staff_users`)
    .get() as { cnt: number };

  if (existingStaff.cnt > 0) {
    // Check if existing DB needs seamless one-time upgrade from legacy 6-category demo to 9-Company + 367 real products
    const hasBioCareCat = db
      .prepare(`SELECT COUNT(*) AS cnt FROM categories WHERE id = 'cty-biocare'`)
      .get() as { cnt: number };
    if (hasBioCareCat.cnt === 0) {
      db.exec("PRAGMA foreign_keys = OFF;");
      db.exec("BEGIN;");
      try {
        db.exec(`
          DELETE FROM order_items;
          DELETE FROM orders;
          DELETE FROM inventory_movements;
          DELETE FROM inventory_batches;
          DELETE FROM products;
          DELETE FROM categories;
        `);
        populateCatalogAndSampleOrders(dataset, createdNow);
        db.exec("COMMIT;");
      } catch (err) {
        db.exec("ROLLBACK;");
        throw err;
      } finally {
        db.exec("PRAGMA foreign_keys = ON;");
      }
    }
    return;
  }

  const defaultPassHash = hashPassword("Nesphar@2026");

  db.exec("BEGIN");
  try {
    // 1. System Settings
    const settings: Array<[string, unknown]> = [
      [
        "company_info",
        {
          companyName: "CÔNG TY TNHH DƯỢC PHẨM NESPHAR",
          shortName: "Dược Phẩm NESPHAR",
          taxCode: "3002297464",
          gppNumber: "148/ĐKKDD-HT (GDP/GPP)",
          representative: "Bà Nguyễn Thị Hương",
          address: "Số 90 Đường Hà Hoàng, Tổ dân phố Đoài Thịnh, P. Trần Phú, tỉnh Hà Tĩnh",
          hotline: "0926090668",
          hotlineDisplay: "0926.090.668",
          secondaryHotline: "0978.420.766",
          email: "Duocphamnesphar@gmail.com",
          zaloOaId: "4490716441165809191",
          miniAppId: "1283290697529026891",
          workingHours: "07:30 – 21:30 (Tất cả các ngày trong tuần)",
          freeShipThreshold: 250000,
          defaultShippingFee: 25000,
        },
      ],
      ["near_expiry_days", 90],
      [
        "tier_discounts",
        {
          retail: 0,
          clinic: 8,
          pharmacy: 12,
          distributor: 18,
        },
      ],
    ];
    const insertSetting = db.prepare(
      `INSERT INTO system_settings (key, value_json) VALUES (?, ?)`
    );
    for (const [key, val] of settings) {
      insertSetting.run(key, JSON.stringify(val));
    }

    // 2. Staff Users (RBAC)
    const insertStaff = db.prepare(`
      INSERT INTO staff_users
        (id, email, password_hash, full_name, role, phone, status, permissions_json, last_login_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `);
    insertStaff.run(
      "staff-admin",
      "admin@nesphar.vn",
      defaultPassHash,
      "Nguyễn Thị Hương (Giám đốc)",
      "ADMIN",
      "0926090668",
      JSON.stringify(ROLE_DEFAULT_PERMISSIONS.ADMIN),
      formatDateTimeOffset(0, "08:05:12"),
      createdNow
    );
    insertStaff.run(
      "staff-sales",
      "sales@nesphar.vn",
      defaultPassHash,
      "DS. Nguyễn Mai Anh",
      "SALES",
      "0978420766",
      JSON.stringify(ROLE_DEFAULT_PERMISSIONS.SALES),
      formatDateTimeOffset(0, "08:18:40"),
      createdNow
    );
    insertStaff.run(
      "staff-warehouse",
      "kho@nesphar.vn",
      defaultPassHash,
      "Trần Quốc Bảo (Thủ kho GSP)",
      "WAREHOUSE",
      "0914882310",
      JSON.stringify(ROLE_DEFAULT_PERMISSIONS.WAREHOUSE),
      formatDateTimeOffset(-1, "17:10:05"),
      createdNow
    );

    // 3. Customers & Addresses
    const customers = [
      {
        id: "cust-man",
        zaloId: null,
        name: "Mẫn Nguyễn",
        phone: "0903536849",
        email: "man.nguyen@gmail.com",
        tier: "retail",
        customDiscount: null,
        businessName: "",
        taxCode: "",
        gppNo: "",
        points: 150,
        staffId: "staff-sales",
        notes: "Khách hàng thân thiết trên Zalo Mini App tại TP. Hà Tĩnh.",
        phoneLinked: 0,
      },
      {
        id: "cust-minhtam",
        zaloId: "zalo-nt-minhtam",
        name: "DS. Lê Thị Minh Tâm",
        phone: "0912345678",
        email: "nhathuocminhtam.ht@gmail.com",
        tier: "pharmacy",
        customDiscount: 12,
        businessName: "Nhà thuốc Minh Tâm GPP",
        taxCode: "3001984512",
        gppNo: "089/GPP-SYT-HT",
        points: 1840,
        staffId: "staff-sales",
        notes: "Đối tác Nhà thuốc GPP lấy định kỳ dòng BioCare, An Thiên & Dapharco đầu tháng.",
        phoneLinked: 1,
      },
      {
        id: "cust-hoabinh",
        zaloId: "zalo-pk-hoabinh",
        name: "BS. Trần Văn Hòa",
        phone: "0988776655",
        email: "pkdkhoabinh@gmail.com",
        tier: "clinic",
        customDiscount: 8,
        businessName: "Phòng khám Đa khoa Hòa Bình",
        taxCode: "3002110890",
        gppNo: "042/HT-GPHĐ",
        points: 960,
        staffId: "staff-sales",
        notes: "Phòng khám nội tổng quát đặt Thuốc An Thiên & Vật tư y tế Dapharco.",
        phoneLinked: 1,
      },
      {
        id: "cust-mientrung",
        zaloId: "zalo-dl-mientrung",
        name: "Ông Phạm Quốc Hùng",
        phone: "0945112233",
        email: "duocmientrung.b2b@gmail.com",
        tier: "distributor",
        customDiscount: 18,
        businessName: "Công ty TNHH Phân phối Dược Miền Trung",
        taxCode: "2901887321",
        gppNo: "312/GDP-SYT-NA",
        points: 4520,
        staffId: "staff-admin",
        notes: "Đại lý cấp 1 phân phối tuyến Nghệ An – Hà Tĩnh – Quảng Bình. Thanh toán VietQR.",
        phoneLinked: 1,
      },
    ];

    const insertCust = db.prepare(`
      INSERT INTO customers (
        id, zalo_id, name, phone, email, customer_tier, custom_discount_percent,
        business_name, tax_code, gpp_license_no, loyalty_points, assigned_staff_id,
        notes, phone_linked, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const c of customers) {
      insertCust.run(
        c.id,
        c.zaloId,
        c.name,
        c.phone,
        c.email,
        c.tier,
        c.customDiscount,
        c.businessName,
        c.taxCode,
        c.gppNo,
        c.points,
        c.staffId,
        c.notes,
        c.phoneLinked,
        createdNow,
        createdNow
      );
    }

    const insertAddr = db.prepare(`
      INSERT INTO customer_addresses
        (id, customer_id, recipient_name, phone, street, ward, district, province, tag, is_default)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertAddr.run("addr-1", "cust-man", "Mẫn Nguyễn", "0903536849", "Số 18 Đường Nguyễn Công Trứ", "Phường Bắc Hà", "TP. Hà Tĩnh", "Tỉnh Hà Tĩnh", "Nhà riêng", 1);
    insertAddr.run("addr-minhtam", "cust-minhtam", "Nhà thuốc Minh Tâm GPP (DS. Tâm)", "0912345678", "Số 112 Đường Hải Thượng Lãn Ông", "Phường Tân Giang", "TP. Hà Tĩnh", "Tỉnh Hà Tĩnh", "Nhà thuốc / Cơ sở", 1);
    insertAddr.run("addr-hoabinh", "cust-hoabinh", "Phòng khám Đa khoa Hòa Bình", "0988776655", "Số 68 Đường Vũ Quang", "Phường Trần Phú", "TP. Hà Tĩnh", "Tỉnh Hà Tĩnh", "Nhà thuốc / Cơ sở", 1);
    insertAddr.run("addr-mientrung", "cust-mientrung", "Kho Dược Miền Trung (Ông Hùng)", "0945112233", "Số 204 Đại lộ Lê Nin", "Phường Hà Huy Tập", "TP. Vinh", "Tỉnh Nghệ An", "Nhà thuốc / Cơ sở", 1);

    // 4. Vouchers
    const insertVoucher = db.prepare(`
      INSERT INTO vouchers
        (id, code, title, description, discount_type, discount_value, max_discount, min_order_value, expiry_date, usage_limit, used_count, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    insertVoucher.run("v-nesphar30", "NESPHAR30", "Giảm 30.000đ đơn từ 299.000đ", "Áp dụng cho tất cả Thực phẩm bảo vệ sức khỏe & Vật tư y tế trên Mini App.", "fixed", 30000, null, 299000, "31/12/2027", 500, 12);
    insertVoucher.run("v-chao20", "BANMOI20", "Giảm 20.000đ Chào bạn mới Zalo", "Ưu đãi dành cho đơn hàng đầu tiên từ 150.000đ trên NESPHAR Mini App.", "fixed", 20000, null, 150000, "31/12/2027", 1000, 28);
    insertVoucher.run("v-giaohang", "FREESHIPHT", "Hỗ trợ 25.000đ phí giao hàng", "Miễn/giảm phí vận chuyển cho đơn từ 250.000đ tại Hà Tĩnh & toàn quốc.", "fixed", 25000, null, 250000, "31/12/2027", 800, 19);
    insertVoucher.run("v-b2b5", "DOITAC5", "Chiết khấu thêm 5% (Tối đa 150.000đ)", "Ưu đãi cộng thêm cho đơn hàng từ 1.000.000đ (Khách lẻ & Đối tác Nhà thuốc).", "percent", 5, 150000, 1000000, "31/12/2027", 300, 9);

    // 5. Mandatory Zalo Legal Articles
    const articles = [
      {
        slug: "dieu-khoan-chinh-sach",
        group: "policy",
        label: "Điều khoản sử dụng",
        title: "Điều khoản chính sách sử dụng",
        summary: "Quy định chung về quyền và trách nhiệm khi tra cứu thông tin và đặt mua sản phẩm trên Zalo Mini App NESPHAR.",
        tone: "emerald",
        author: "Dược Phẩm NESPHAR",
        sections: [
          {
            heading: "1. Phạm vi danh mục & Quy định Thuốc kê đơn (Rx)",
            paragraphs: [
              "Ứng dụng Zalo Mini App chính thức của CÔNG TY TNHH DƯỢC PHẨM NESPHAR (MST: 3002297464) niêm yết minh bạch Thực phẩm bảo vệ sức khỏe, Vật tư y tế, Thiết bị y tế và Danh mục Dược phẩm phân phối chính hãng.",
              "Đối với mặt hàng thuộc Nhóm thuốc kê đơn (Rx), khách hàng cá nhân chỉ tra cứu thông tin và kết nối Dược sĩ tư vấn; tính năng đặt sỉ trực tuyến chỉ mở cho đối tác Nhà thuốc/Phòng khám đã xác thực chứng chỉ GPP/GPHĐ.",
            ],
          },
        ],
      },
      {
        slug: "chinh-sach-bao-mat",
        group: "policy",
        label: "Điều khoản sử dụng",
        title: "Chính sách bảo mật dữ liệu cá nhân",
        summary: "Cam kết bảo vệ dữ liệu cá nhân người dùng theo Nghị định 13/2023/NĐ-CP và quy chuẩn bảo mật Zalo Mini App.",
        tone: "teal",
        author: "Dược Phẩm NESPHAR",
        sections: [
          {
            heading: "Cam kết bảo mật theo Nghị định 13/2023/NĐ-CP",
            paragraphs: [
              "Thông tin cá nhân và hồ sơ cơ sở dược của Quý khách được bảo mật tuyệt đối trên máy chủ nội bộ NESPHAR, chỉ phục vụ xác nhận và giao nhận đơn hàng.",
            ],
          },
        ],
      },
      {
        slug: "chinh-sach-doi-tra",
        group: "policy",
        label: "Điều khoản sử dụng",
        title: "Chính sách kiểm hàng & đổi trả",
        summary: "Đồng kiểm khi nhận hàng, đổi mới 100% sản phẩm lỗi bao bì, sai quy cách hoặc cận hạn.",
        tone: "mint",
        author: "Dược Phẩm NESPHAR",
        sections: [
          {
            heading: "Quyền đồng kiểm Số lô & Hạn dùng",
            paragraphs: [
              "Tất cả kiện hàng từ NESPHAR đều hỗ trợ đồng kiểm tem niêm phong, Số lô (Batch/Lot) và Hạn sử dụng trước khi thanh toán.",
            ],
          },
        ],
      },
      {
        slug: "chinh-sach-giao-hang",
        group: "policy",
        label: "Điều khoản sử dụng",
        title: "Chính sách giao hàng & thanh toán",
        summary: "Giao nhanh nội tỉnh Hà Tĩnh trong ngày, giao tuyến huyện/liên tỉnh chuẩn bảo quản GSP/GDP.",
        tone: "botanical",
        author: "Dược Phẩm NESPHAR",
        sections: [
          {
            heading: "Phương thức vận chuyển & Thanh toán",
            paragraphs: [
              "Hỗ trợ thanh toán COD khi nhận hàng hoặc chuyển khoản mã QR động Napas/VietQR gạch nợ tự động.",
            ],
          },
        ],
      },
      {
        slug: "thong-tin-lien-he",
        group: "about",
        label: "VỀ CHÚNG TÔI",
        title: "Thông tin liên hệ & Pháp lý",
        summary: "Thông tin pháp nhân chính thức, địa chỉ trụ sở và tổng đài Dược sĩ tư vấn của Công ty TNHH Dược Phẩm NESPHAR.",
        tone: "emerald",
        author: "P. Trần Phú, Tỉnh Hà Tĩnh",
        sections: [
          {
            heading: "Đơn vị chủ quản ứng dụng",
            paragraphs: [
              "CÔNG TY TNHH DƯỢC PHẨM NESPHAR — MST: 3002297464",
              "Người đại diện pháp luật: Bà Nguyễn Thị Hương – Giám đốc",
              "Trụ sở: Số 90 Đường Hà Hoàng, TDP Đoài Thịnh, P. Trần Phú, tỉnh Hà Tĩnh.",
              "Hotline Dược sĩ: 0926.090.668 – 0978.420.766 | Email: Duocphamnesphar@gmail.com",
            ],
          },
        ],
      },
      {
        slug: "gioi-thieu-nesphar",
        group: "about",
        label: "VỀ CHÚNG TÔI",
        title: "Giới thiệu Dược Phẩm NESPHAR",
        summary: "Đối tác phân phối uy tín của BioCare, Dapharco, An Thiên, Dược TW3, Phú Thái, Minh Cường, Nam Việt, Phenikaa tại Miền Trung.",
        tone: "teal",
        author: "Dược Phẩm NESPHAR",
        sections: [
          {
            heading: "Hệ thống phân phối chuẩn GSP / GDP",
            paragraphs: [
              "NESPHAR cung cấp danh mục hơn 360+ mặt hàng thuốc, TPBVSK nhập khẩu và vật tư y tế chính hãng, kiểm soát chặt chẽ Số lô & Hạn dùng theo nguyên tắc FEFO.",
            ],
          },
        ],
      },
      {
        slug: "cam-nang-bao-ve-gan",
        group: "health",
        label: "TIN SỨC KHỎE",
        title: "5 nguyên tắc vàng bảo vệ sức khỏe chủ động mỗi ngày",
        summary: "Cách phối hợp vi chất nhập khẩu và đọc đúng nhãn Thuốc kê đơn / Không kê đơn an toàn cho gia đình.",
        tone: "botanical",
        author: "Ban Dược học NESPHAR",
        sections: [
          {
            heading: "Sử dụng thuốc & TPBVSK đúng phân loại",
            paragraphs: [
              "Luôn kiểm tra kỹ nhãn phân loại Thuốc kê đơn (Rx), Thuốc không kê đơn (OTC) hoặc Thực phẩm bảo vệ sức khỏe và tham vấn Dược sĩ chuyên môn trước khi phối hợp.",
            ],
          },
        ],
      },
    ];
    const insertArt = db.prepare(`
      INSERT INTO articles
        (slug, article_group, category_label, title, summary, banner_tone, author_location, sections_json, is_published, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `);
    for (const a of articles) {
      insertArt.run(a.slug, a.group, a.label, a.title, a.summary, a.tone, a.author, JSON.stringify(a.sections), createdNow);
    }

    // 6. Populate 9 Company Categories + 367 Real Products + Batches + Banners + Sample Orders
    populateCatalogAndSampleOrders(dataset, createdNow);

    // 7. Notifications & Support Tickets
    const insertNoti = db.prepare(`
      INSERT INTO notifications (id, customer_id, type, title, body, target_link, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertNoti.run("noti-1", null, "promo", "Cập nhật bảng giá BioCare, An Thiên & CTKM Dapharco Tháng 10", "Tra cứu ngay 367 sản phẩm chính hãng theo 9 Công ty & 5 Nhóm thẻ phân loại trên NESPHAR Mini App.", "/categories", 0, formatDateTimeOffset(0, "08:30:00"));
    insertNoti.run("noti-2", null, "promo", "Tặng mã NESPHAR30 giảm ngay 30.000đ", "Áp dụng cho mọi đơn hàng từ 299.000đ đặt trực tuyến qua Zalo Mini App.", "/vouchers", 0, formatDateTimeOffset(-1, "19:15:00"));

    const insertTicket = db.prepare(`
      INSERT INTO support_tickets
        (id, customer_id, customer_name, phone, topic, content, status, staff_reply, replied_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTicket.run(
      "tkt-101",
      null,
      "Quầy thuốc Tâm Đức (Cẩm Xuyên)",
      "0916502889",
      "bao-gia-si",
      "Quầy thuốc mình ở Cẩm Xuyên (đủ GPP) muốn mở tài khoản B2B để đặt sỉ bậc 21+ hộp dòng BioCare nhập khẩu và hàng An Thiên.",
      "open",
      "",
      "",
      formatDateTimeOffset(0, "09:12:30"),
      formatDateTimeOffset(0, "09:12:30")
    );

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
