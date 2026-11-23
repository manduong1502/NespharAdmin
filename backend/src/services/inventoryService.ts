import { db, nowIsoLocal, todayDateOnly } from "../db/database";

export interface BatchAllocation {
  batchId: string;
  batchCode: string;
  expDate: string;
  qty: number;
}

export interface ProductStockSummary {
  availableStock: number;
  nearExpiryStock: number;
  expiredStock: number;
  quarantinedStock: number;
  activeBatchCount: number;
  nearestExpDate: string | null;
}

export function daysUntilDate(dateStr: string): number {
  const today = new Date(`${todayDateOnly()}T00:00:00`);
  const target = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getNearExpiryThresholdDays(): number {
  const row = db
    .prepare(`SELECT value_json FROM system_settings WHERE key = 'near_expiry_days'`)
    .get() as { value_json: string } | undefined;
  if (!row) return 90;
  try {
    return Number(JSON.parse(row.value_json)) || 90;
  } catch {
    return 90;
  }
}

export function getProductStockSummary(productId: string): ProductStockSummary {
  const batches = db
    .prepare(
      `SELECT id, batch_code, exp_date, remaining_qty, status
       FROM inventory_batches
       WHERE product_id = ?
       ORDER BY exp_date ASC`
    )
    .all(productId) as Array<{
    id: string;
    batch_code: string;
    exp_date: string;
    remaining_qty: number;
    status: string;
  }>;

  const thresholdDays = getNearExpiryThresholdDays();
  let availableStock = 0;
  let nearExpiryStock = 0;
  let expiredStock = 0;
  let quarantinedStock = 0;
  let activeBatchCount = 0;
  let nearestExpDate: string | null = null;

  for (const b of batches) {
    if (b.remaining_qty <= 0) continue;
    if (b.status === "quarantined") {
      quarantinedStock += b.remaining_qty;
      continue;
    }
    const daysLeft = daysUntilDate(b.exp_date);
    if (daysLeft < 0) {
      expiredStock += b.remaining_qty;
    } else {
      availableStock += b.remaining_qty;
      activeBatchCount += 1;
      if (!nearestExpDate) nearestExpDate = b.exp_date;
      if (daysLeft <= thresholdDays) {
        nearExpiryStock += b.remaining_qty;
      }
    }
  }

  return {
    availableStock,
    nearExpiryStock,
    expiredStock,
    quarantinedStock,
    activeBatchCount,
    nearestExpDate,
  };
}

export function allocateBatchesFEFO(params: {
  productId: string;
  productName: string;
  requiredBaseQty: number;
  orderCode: string;
  performedBy: string;
}): BatchAllocation[] {
  const today = todayDateOnly();
  const eligibleBatches = db
    .prepare(
      `SELECT id, batch_code, exp_date, remaining_qty
       FROM inventory_batches
       WHERE product_id = ?
         AND status = 'active'
         AND remaining_qty > 0
         AND exp_date >= ?
       ORDER BY exp_date ASC, created_at ASC`
    )
    .all(params.productId, today) as Array<{
    id: string;
    batch_code: string;
    exp_date: string;
    remaining_qty: number;
  }>;

  const totalAvail = eligibleBatches.reduce((sum, b) => sum + b.remaining_qty, 0);
  if (totalAvail < params.requiredBaseQty) {
    throw new Error(
      `Sản phẩm "${params.productName}" không đủ tồn kho khả dụng (cần ${params.requiredBaseQty}, còn ${totalAvail}).`
    );
  }

  let needed = params.requiredBaseQty;
  const allocations: BatchAllocation[] = [];

  const updateBatchStmt = db.prepare(
    `UPDATE inventory_batches SET remaining_qty = ? WHERE id = ?`
  );
  const insertMoveStmt = db.prepare(
    `INSERT INTO inventory_movements
      (id, batch_id, batch_code, product_id, product_name, movement_type, qty_change, balance_after, reference_code, note, performed_by, created_at)
     VALUES (?, ?, ?, ?, ?, 'ORDER_EXPORT_FEFO', ?, ?, ?, ?, ?, ?)`
  );

  for (const batch of eligibleBatches) {
    if (needed <= 0) break;
    const take = Math.min(batch.remaining_qty, needed);
    const nextRemaining = batch.remaining_qty - take;
    updateBatchStmt.run(nextRemaining, batch.id);

    const moveId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    insertMoveStmt.run(
      moveId,
      batch.id,
      batch.batch_code,
      params.productId,
      params.productName,
      -take,
      nextRemaining,
      params.orderCode,
      `Xuất kho FEFO cho đơn #${params.orderCode} (Lô ${batch.batch_code}, HSD ${batch.exp_date})`,
      params.performedBy,
      nowIsoLocal()
    );

    allocations.push({
      batchId: batch.id,
      batchCode: batch.batch_code,
      expDate: batch.exp_date,
      qty: take,
    });

    needed -= take;
  }

  return allocations;
}

export function restoreBatchesFromOrder(params: {
  productId: string;
  productName: string;
  allocations: BatchAllocation[];
  orderCode: string;
  movementType: "ORDER_RETURN" | "ADJUSTMENT";
  notePrefix: string;
  performedBy: string;
}): void {
  const getBatchStmt = db.prepare(
    `SELECT id, batch_code, remaining_qty FROM inventory_batches WHERE id = ?`
  );
  const updateBatchStmt = db.prepare(
    `UPDATE inventory_batches SET remaining_qty = ? WHERE id = ?`
  );
  const insertMoveStmt = db.prepare(
    `INSERT INTO inventory_movements
      (id, batch_id, batch_code, product_id, product_name, movement_type, qty_change, balance_after, reference_code, note, performed_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const alloc of params.allocations) {
    if (!alloc.batchId || alloc.qty <= 0) continue;
    const batch = getBatchStmt.get(alloc.batchId) as
      | { id: string; batch_code: string; remaining_qty: number }
      | undefined;
    if (!batch) continue;

    const nextRemaining = batch.remaining_qty + alloc.qty;
    updateBatchStmt.run(nextRemaining, batch.id);

    const moveId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    insertMoveStmt.run(
      moveId,
      batch.id,
      batch.batch_code,
      params.productId,
      params.productName,
      params.movementType,
      alloc.qty,
      nextRemaining,
      params.orderCode,
      `${params.notePrefix} #${params.orderCode} (+${alloc.qty} về lô ${batch.batch_code})`,
      params.performedBy,
      nowIsoLocal()
    );
  }
}
