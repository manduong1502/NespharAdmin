import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { db, nowIsoLocal, UPLOADS_DIR } from "../db/database";
import { verifyFileMagicBytes } from "../middleware/securityShield";

export interface VolumePriceTier {
  minQty: number;
  maxQty: number | null;
  unitPrice: number;
  label: string;
}

export function computeVolumeAwareUnitPrice(params: {
  retailPrice: number;
  volumeTiers: VolumePriceTier[];
  multiplier: number;
  extraSavePercent?: number;
  customerDiscountPercent: number;
  quantity: number;
}): number {
  const {
    retailPrice,
    volumeTiers,
    multiplier,
    extraSavePercent = 0,
    customerDiscountPercent,
    quantity,
  } = params;

  const mult = multiplier > 0 ? multiplier : 1;
  const extraFactor = extraSavePercent > 0 ? (100 - extraSavePercent) / 100 : 1;
  const tierFactor = (100 - Math.max(0, customerDiscountPercent)) / 100;
  const standardUnitPrice = Math.round((retailPrice * mult * extraFactor * tierFactor) / 100) * 100;

  if (!Array.isArray(volumeTiers) || volumeTiers.length === 0) {
    return standardUnitPrice;
  }

  const totalBaseUnits = Math.max(1, Math.round(quantity * mult));
  let matchedBracketPrice: number | null = null;
  for (const vt of volumeTiers) {
    if (
      totalBaseUnits >= Number(vt.minQty || 1) &&
      (vt.maxQty === null || vt.maxQty === undefined || totalBaseUnits <= Number(vt.maxQty))
    ) {
      matchedBracketPrice = Number(vt.unitPrice);
    }
  }

  if (matchedBracketPrice && matchedBracketPrice > 0) {
    const bracketOptionPrice = Math.round((matchedBracketPrice * mult) / 100) * 100;
    return Math.min(standardUnitPrice, bracketOptionPrice);
  }

  return standardUnitPrice;
}

/**
 * Lightweight zero-dependency ZIP reader using Node built-in zlib.inflateRawSync
 * to parse .xlsx workbooks (XML + embedded images) safely inside hardened containers.
 */
function readZipEntries(zipBuf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  // Locate End of Central Directory (EOCD: 0x06054b50)
  let eocdOffset = -1;
  const minSearch = Math.max(0, zipBuf.length - 65557);
  for (let i = zipBuf.length - 22; i >= minSearch; i -= 1) {
    if (zipBuf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Tệp tải lên không phải định dạng sổ tính Excel (.xlsx) hợp lệ.");
  }

  const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);

  let ptr = cdOffset;
  for (let idx = 0; idx < totalEntries && ptr + 46 <= zipBuf.length; idx += 1) {
    if (zipBuf.readUInt32LE(ptr) !== 0x02014b50) break;
    const method = zipBuf.readUInt16LE(ptr + 10);
    const compSize = zipBuf.readUInt32LE(ptr + 20);
    const uncompSize = zipBuf.readUInt32LE(ptr + 24);
    const nameLen = zipBuf.readUInt16LE(ptr + 28);
    const extraLen = zipBuf.readUInt16LE(ptr + 30);
    const commentLen = zipBuf.readUInt16LE(ptr + 32);
    const localHeaderOffset = zipBuf.readUInt32LE(ptr + 42);
    const name = zipBuf.subarray(ptr + 46, ptr + 46 + nameLen).toString("utf8");
    ptr += 46 + nameLen + extraLen + commentLen;

    // Anti-Zip-Bomb guard (max 35MB per entry)
    if (uncompSize > 35 * 1024 * 1024) continue;
    if (localHeaderOffset + 30 > zipBuf.length) continue;
    if (zipBuf.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;

    const lNameLen = zipBuf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = zipBuf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const rawSlice = zipBuf.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      entries.set(name, Buffer.from(rawSlice));
    } else if (method === 8) {
      entries.set(name, zlib.inflateRawSync(rawSlice));
    }
  }
  return entries;
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseSharedStrings(xml: string): string[] {
  const out: string[] = [];
  const siRegex = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;
  while ((m = siRegex.exec(xml)) !== null) {
    const inner = m[1];
    const tRegex = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let tm: RegExpExecArray | null;
    const parts: string[] = [];
    while ((tm = tRegex.exec(inner)) !== null) {
      parts.push(decodeXmlEntities(tm[1]));
    }
    out.push(parts.join(""));
  }
  return out;
}

function colLettersToIndex(letters: string): number {
  let idx = 0;
  for (let i = 0; i < letters.length; i += 1) {
    idx = idx * 26 + (letters.charCodeAt(i) - 64);
  }
  return idx; // 1-based
}

function parseWorksheetRows(xml: string, shared: string[]): Map<number, Map<number, string>> {
  const rows = new Map<number, Map<number, string>>();
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRegex.exec(xml)) !== null) {
    const rAttr = /\br="(\d+)"/.exec(rm[1]);
    if (!rAttr) continue;
    const rNum = Number(rAttr[1]);
    const cols = new Map<number, string>();
    const cellRegex = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRegex.exec(rm[2])) !== null) {
      const cAttrs = cm[1];
      const cBody = cm[2] || "";
      const refM = /\br="([A-Z]+)\d+"/.exec(cAttrs);
      if (!refM) continue;
      const cIdx = colLettersToIndex(refM[1]);
      const typeM = /\bt="([^"]+)"/.exec(cAttrs);
      const cType = typeM ? typeM[1] : "";

      let val = "";
      if (cType === "s") {
        const vm = /<v>(\d+)<\/v>/.exec(cBody);
        if (vm) val = shared[Number(vm[1])] || "";
      } else if (cType === "inlineStr") {
        const tm = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cBody);
        if (tm) val = decodeXmlEntities(tm[1]);
      } else {
        const vm = /<v>([\s\S]*?)<\/v>/.exec(cBody);
        if (vm) val = decodeXmlEntities(vm[1]);
      }
      if (val.trim() !== "") {
        cols.set(cIdx, val.trim());
      }
    }
    if (cols.size > 0) {
      rows.set(rNum, cols);
    }
  }
  return rows;
}

function extractDrawingImagesForSheet(
  entries: Map<string, Buffer>,
  sheetRelPath: string
): Map<number, string> {
  const rowToUrl = new Map<number, string>();
  const sRelsBuf = entries.get(sheetRelPath);
  if (!sRelsBuf) return rowToUrl;
  const sRelsXml = sRelsBuf.toString("utf8");
  const drawMatch = /Target="([^"]*drawings\/drawing\d+\.xml)"/.exec(sRelsXml);
  if (!drawMatch) return rowToUrl;

  const drawPath = drawMatch[1].replace("../", "xl/").replace(/^\/+/, "");
  const drawBuf = entries.get(drawPath);
  if (!drawBuf) return rowToUrl;

  const drawFile = path.posix.basename(drawPath);
  const drawRelsPath = `xl/drawings/_rels/${drawFile}.rels`;
  const drawRelsBuf = entries.get(drawRelsPath);
  if (!drawRelsBuf) return rowToUrl;

  const ridToMedia = new Map<string, string>();
  const relRegex = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
  let rm: RegExpExecArray | null;
  const drawRelsXml = drawRelsBuf.toString("utf8");
  while ((rm = relRegex.exec(drawRelsXml)) !== null) {
    const mediaTarget = rm[2].replace("../", "xl/").replace(/^\/+/, "");
    ridToMedia.set(rm[1], mediaTarget);
  }

  const catalogDir = path.join(UPLOADS_DIR, "media", "catalog");
  fs.mkdirSync(catalogDir, { recursive: true });

  const anchorRegex = /<(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)\b[^>]*>([\s\S]*?)<\/(?:xdr:)?(?:twoCellAnchor|oneCellAnchor)>/g;
  const drawXml = drawBuf.toString("utf8");
  let am: RegExpExecArray | null;
  while ((am = anchorRegex.exec(drawXml)) !== null) {
    const block = am[1];
    const fromBlock = /<(?:xdr:)?from>([\s\S]*?)<\/(?:xdr:)?from>/.exec(block);
    const toBlock = /<(?:xdr:)?to>([\s\S]*?)<\/(?:xdr:)?to>/.exec(block);
    const blipM = /r:embed="([^"]+)"/.exec(block);
    if (!fromBlock || !blipM) continue;

    const r1M = /<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/.exec(fromBlock[1]);
    if (!r1M) continue;
    const r1 = Number(r1M[1]);
    let bestRow1Based = r1 + 1;
    if (toBlock) {
      const r2M = /<(?:xdr:)?row>(\d+)<\/(?:xdr:)?row>/.exec(toBlock[1]);
      const r2OffM = /<(?:xdr:)?rowOff>(\d+)<\/(?:xdr:)?rowOff>/.exec(toBlock[1]);
      const r2 = r2M ? Number(r2M[1]) : r1;
      const r2Off = r2OffM ? Number(r2OffM[1]) : 0;
      const effR2 = r2 > r1 && r2Off === 0 ? r2 - 0.01 : r2 + 0.5;
      bestRow1Based = Math.floor((r1 + 0.5 + effR2) / 2) + 1;
    }

    const mediaKey = ridToMedia.get(blipM[1]);
    if (!mediaKey) continue;
    const imgBuf = entries.get(mediaKey);
    if (!imgBuf || !verifyFileMagicBytes(imgBuf.subarray(0, 16), "media")) continue;

    const ext = (path.posix.extname(mediaKey) || ".png").toLowerCase();
    const hash = crypto.createHash("sha1").update(imgBuf).digest("hex").slice(0, 12);
    const savedName = `imp-${hash}${ext}`;
    const destFile = path.join(catalogDir, savedName);
    if (!fs.existsSync(destFile)) {
      fs.writeFileSync(destFile, imgBuf);
    }
    if (!rowToUrl.has(bestRow1Based)) {
      rowToUrl.set(bestRow1Based, `/uploads/media/catalog/${savedName}`);
    }
  }

  return rowToUrl;
}

function parseVndInt(raw: string | undefined): number {
  if (!raw) return 0;
  const s = raw.trim();
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ""));
  if (/^\d{1,3}(,\d{3})+$/.test(s)) return Number(s.replace(/,/g, ""));
  const n = Math.round(Number(s.replace(/,/g, "")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function parseExcelDateIso(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const num = Number(s);
  if (Number.isFinite(num) && num > 35000 && num < 65000) {
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.round(num) * 86400_000);
    return dt.toISOString().slice(0, 10);
  }
  return fallback;
}

export function importProductsFromXlsxBuffer(
  xlsxBuffer: Buffer,
  actorName: string
): { importedProducts: number; importedBatches: number } {
  const entries = readZipEntries(xlsxBuffer);
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const shared = sharedXml ? parseSharedStrings(sharedXml) : [];

  const sheet1Xml = entries.get("xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet1Xml) {
    throw new Error("Không tìm thấy Sheet dữ liệu sản phẩm (sheet1) trong tệp Excel.");
  }

  const rows1 = parseWorksheetRows(sheet1Xml, shared);
  const rowImages = extractDrawingImagesForSheet(
    entries,
    "xl/worksheets/_rels/sheet1.xml.rels"
  );

  const validCats = new Set(
    (db.prepare(`SELECT id FROM categories`).all() as Array<{ id: string }>).map((c) => c.id)
  );
  const ts = nowIsoLocal();

  let importedProducts = 0;
  let importedBatches = 0;

  db.exec("BEGIN");
  try {
    for (const [rNum, cols] of rows1.entries()) {
      if (rNum < 5) continue; // Header is row 4 in MAU_NHAP_SAN_PHAM_NESPHAR.xlsx
      const skuRaw = (cols.get(2) || "").trim().toUpperCase();
      const nameRaw = (cols.get(3) || "").trim();
      if (!skuRaw || !nameRaw || skuRaw.includes("MÃ SP")) continue;

      const rawCat = (cols.get(4) || "khac").trim();
      const categoryId = validCats.has(rawCat) ? rawCat : "khac";

      const rawTags = (cols.get(5) || "")
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const ingredients = cols.get(7) || "";
      const benefitsText = cols.get(8) || "";
      const baseUnit = cols.get(9) || "Hộp";
      const specification = cols.get(10) || "Tiêu chuẩn";
      const cartonSpec = cols.get(11) || "";
      const origin = cols.get(12) || "Việt Nam";
      const regNo = cols.get(13) || "Đang cập nhật";
      const legalClass = (cols.get(14) || "KHONG_KE_DON").toUpperCase();

      const isRx =
        legalClass.includes("THUOC_KE_DON") ||
        legalClass === "KSDB" ||
        rawTags.includes("nhom-thuoc-ke-don");

      if (isRx && !rawTags.includes("nhom-thuoc-ke-don")) {
        rawTags.push("nhom-thuoc-ke-don");
      } else if (!isRx && !rawTags.includes("nhom-thuoc-khong-ke-don")) {
        rawTags.push("nhom-thuoc-khong-ke-don");
      }

      const listPrice = parseVndInt(cols.get(15));
      const price1 = parseVndInt(cols.get(16)) || listPrice;
      if (price1 <= 0) continue;

      const price2 = parseVndInt(cols.get(17));
      const minQty2 = parseVndInt(cols.get(18)) || 6;
      const price3 = parseVndInt(cols.get(19));
      const minQty3 = parseVndInt(cols.get(20)) || 21;
      const promoBadge =
        cols.get(21) ||
        (price2 > 0
          ? `Giá sỉ từ ${minQty2} ${baseUnit.toLowerCase()}: ${price2.toLocaleString("vi-VN")}đ`
          : "");

      const volumeTiers: VolumePriceTier[] = [];
      if (price2 > 0 && minQty2 > 1) {
        volumeTiers.push({
          minQty: 1,
          maxQty: minQty2 - 1,
          unitPrice: price1,
          label: `1 – ${minQty2 - 1} ${baseUnit.toLowerCase()}`,
        });
        volumeTiers.push({
          minQty: minQty2,
          maxQty: price3 > 0 && minQty3 > minQty2 ? minQty3 - 1 : null,
          unitPrice: price2,
          label:
            price3 > 0 && minQty3 > minQty2
              ? `${minQty2} – ${minQty3 - 1} ${baseUnit.toLowerCase()}`
              : `Từ ${minQty2} ${baseUnit.toLowerCase()}`,
        });
      }
      if (price3 > 0 && minQty3 > 1) {
        volumeTiers.push({
          minQty: minQty3,
          maxQty: null,
          unitPrice: price3,
          label: `Từ ${minQty3} ${baseUnit.toLowerCase()}`,
        });
      }

      const originalPrice = listPrice > price1 ? listPrice : price1;
      const costPrice = Math.round((price1 * 0.78) / 500) * 500;
      const imageUrl = rowImages.get(rNum) || "/uploads/media/prod-liver.jpg";

      const unitOptions: Array<Record<string, unknown>> = [
        {
          id: `${skuRaw.toLowerCase()}-u1`,
          unitName: baseUnit,
          specificationLabel: specification,
          multiplier: 1,
        },
      ];
      const cartonM = /(\d{1,4})/.exec(cartonSpec);
      if (cartonM && Number(cartonM[1]) >= 2) {
        unitOptions.push({
          id: `${skuRaw.toLowerCase()}-ucarton`,
          unitName: "Thùng",
          specificationLabel: cartonSpec,
          multiplier: Number(cartonM[1]),
          extraSavePercent: 5,
        });
      }

      const existing = db
        .prepare(`SELECT id FROM products WHERE sku = ?`)
        .get(skuRaw) as { id: string } | undefined;
      const prodId = existing ? existing.id : `imp-${skuRaw.toLowerCase()}-${Date.now() % 10000}`;

      const disclaimer = isRx
        ? "Thuốc kê đơn (Rx) — Chỉ bán theo đơn Bác sĩ hoặc phân phối sỉ cho cơ sở có giấy phép GPP."
        : "Thực phẩm bảo vệ sức khỏe / Sản phẩm chăm sóc sức khỏe — Đọc kỹ hướng dẫn trước khi dùng.";

      db.prepare(`
        INSERT INTO products (
          id, sku, name, category_id, brand, manufacturer, supplier, origin,
          registration_no, base_unit, specification, cost_price, retail_price, original_price,
          image_url, gallery_json, unit_options_json, tags_json, is_prescription,
          promo_badge, volume_tiers_json, is_visible, short_summary, ingredients,
          benefits_json, dosage, target_users, storage_note, disclaimer, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, '', ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, 1, ?, ?,
          ?, 'Dùng theo hướng dẫn trên bao bì hoặc tư vấn của Dược sĩ NESPHAR.',
          'Sử dụng theo chỉ dẫn chuyên môn phù hợp.', 'Bảo quản nơi khô mát dưới 30°C.', ?, ?
        )
        ON CONFLICT(sku) DO UPDATE SET
          name = excluded.name,
          category_id = excluded.category_id,
          origin = excluded.origin,
          registration_no = excluded.registration_no,
          base_unit = excluded.base_unit,
          specification = excluded.specification,
          retail_price = excluded.retail_price,
          original_price = excluded.original_price,
          image_url = CASE WHEN excluded.image_url LIKE '/uploads/media/catalog/%' THEN excluded.image_url ELSE products.image_url END,
          unit_options_json = excluded.unit_options_json,
          tags_json = excluded.tags_json,
          is_prescription = excluded.is_prescription,
          promo_badge = excluded.promo_badge,
          volume_tiers_json = excluded.volume_tiers_json,
          short_summary = excluded.short_summary,
          ingredients = excluded.ingredients,
          benefits_json = excluded.benefits_json,
          disclaimer = excluded.disclaimer,
          updated_at = excluded.updated_at
      `).run(
        prodId,
        skuRaw,
        nameRaw,
        categoryId,
        categoryId.replace("cty-", "").toUpperCase(),
        categoryId,
        origin,
        regNo,
        baseUnit,
        specification,
        costPrice,
        price1,
        originalPrice,
        imageUrl,
        JSON.stringify([imageUrl]),
        JSON.stringify(unitOptions),
        JSON.stringify(rawTags),
        isRx ? 1 : 0,
        promoBadge,
        JSON.stringify(volumeTiers),
        benefitsText || nameRaw,
        ingredients,
        JSON.stringify(benefitsText ? [benefitsText] : [nameRaw]),
        disclaimer,
        ts
      );

      importedProducts += 1;
    }

    // Optional Sheet 2: 2_TON_KHO_SO_LO_HSD (or ERP TK layout)
    const sheet2Xml = entries.get("xl/worksheets/sheet2.xml")?.toString("utf8");
    if (sheet2Xml) {
      const rows2 = parseWorksheetRows(sheet2Xml, shared);
      for (const [rNum, cols] of rows2.entries()) {
        if (rNum < 2) continue;
        const sku = (cols.get(1) || "").trim().toUpperCase();
        const batchCode = (cols.get(5) || "").trim();
        if (!sku || !batchCode || sku === "MA_VT" || sku.includes("MÃ SP")) continue;

        const prod = db
          .prepare(`SELECT id, name, cost_price FROM products WHERE sku = ?`)
          .get(sku) as { id: string; name: string; cost_price: number } | undefined;
        if (!prod) continue;

        const mfgDate = parseExcelDateIso(cols.get(6), "2026-02-01");
        const expDate = parseExcelDateIso(cols.get(7), "2029-02-01");
        const qty = parseVndInt(cols.get(8));
        if (qty <= 0) continue;
        const batchCost = parseVndInt(cols.get(9)) || Number(prod.cost_price || 0);
        const shelf = cols.get(10) || "Kệ GSP-A1";

        const existingBatch = db
          .prepare(`SELECT id FROM inventory_batches WHERE product_id = ? AND batch_code = ?`)
          .get(prod.id, batchCode) as { id: string } | undefined;

        if (existingBatch) {
          db.prepare(
            `UPDATE inventory_batches SET remaining_qty = ?, exp_date = ?, mfg_date = ? WHERE id = ?`
          ).run(qty, expDate, mfgDate, existingBatch.id);
        } else {
          const bId = `bat-imp-${Date.now()}-${importedBatches}`;
          db.prepare(`
            INSERT INTO inventory_batches
              (id, product_id, batch_code, mfg_date, exp_date, cost_price, initial_qty, remaining_qty, shelf_location, supplier_invoice, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'IMPORT-EXCEL', 'active', ?)
          `).run(bId, prod.id, batchCode, mfgDate, expDate, batchCost, qty, qty, shelf, ts);

          db.prepare(`
            INSERT INTO inventory_movements
              (id, batch_id, batch_code, product_id, product_name, movement_type, qty_change, balance_after, reference_code, note, performed_by, created_at)
            VALUES (?, ?, ?, ?, ?, 'IMPORT', ?, ?, 'EXCEL-IMPORT', 'Nhập lô tự động từ tệp Excel chuẩn NESPHAR', ?, ?)
          `).run(
            `mov-imp-${Date.now()}-${importedBatches}`,
            bId,
            batchCode,
            prod.id,
            prod.name,
            qty,
            qty,
            actorName,
            ts
          );
        }
        importedBatches += 1;
      }
    }

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  return { importedProducts, importedBatches };
}
